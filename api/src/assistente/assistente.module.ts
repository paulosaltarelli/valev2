import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { JwtPayload } from '../auth/types';
import { DashModule } from '../dash/dash.module';
import { OperationalReportsService } from '../dash/operational-reports.service';
import { ExecucaoModule } from '../execucao/execucao.module';
import { PrismaService } from '../prisma/prisma.service';
import { AssistenteConsultas } from './assistente-consultas';
import {
  AssistenteDto,
  ConectarProvedorDto,
  ProvedorExterno,
} from './assistente.dto';
import {
  ChavesPessoais,
  provedores,
  selecionarConsulta,
} from './assistente-intencao';

type Turno = { pergunta: string; resposta: string; em: string };
const ttl = 30 * 60_000;

@Injectable()
export class AssistenteSessoes {
  private readonly historico = new Map<
    string,
    { turnos: Turno[]; expira: number }
  >();
  private readonly limites = new Map<
    number,
    { vezes: number; expira: number }
  >();
  private readonly emConsulta = new Set<number>();
  private readonly credenciais = new Map<
    string,
    { chaves: ChavesPessoais; timer: NodeJS.Timeout }
  >();

  pessoais(sessao: string): ChavesPessoais {
    return this.credenciais.get(sessao)?.chaves ?? {};
  }

  conectar(
    sessao: string,
    expira: number,
    provedor: ProvedorExterno,
    chave: string,
  ) {
    const anterior = this.credenciais.get(sessao);
    if (!anterior && this.credenciais.size >= 500) {
      throw new HttpException(
        'Limite temporário de conexões.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (anterior) clearTimeout(anterior.timer);
    const timer = setTimeout(
      () => this.credenciais.delete(sessao),
      Math.max(0, expira - Date.now()),
    ).unref();
    this.credenciais.set(sessao, {
      chaves: { ...anterior?.chaves, [provedor]: chave },
      timer,
    });
  }

  desconectar(sessao: string, provedor: ProvedorExterno) {
    const registro = this.credenciais.get(sessao);
    if (!registro) return;
    delete registro.chaves[provedor];
    if (!Object.keys(registro.chaves).length) {
      clearTimeout(registro.timer);
      this.credenciais.delete(sessao);
    }
  }

  ler(chave: string) {
    const sessao = this.historico.get(chave);
    return sessao && sessao.expira > Date.now() ? sessao.turnos : [];
  }

  gravar(chave: string, turno: Turno) {
    if (!this.historico.has(chave) && this.historico.size >= 500) {
      const maisAntiga = this.historico.keys().next().value;
      if (maisAntiga) this.historico.delete(maisAntiga);
    }
    const turnos = [...this.ler(chave), turno].slice(-8);
    this.historico.delete(chave);
    this.historico.set(chave, { turnos, expira: Date.now() + ttl });
  }

  async consultar<T>(usuarioId: number, acao: () => Promise<T>): Promise<T> {
    const agora = Date.now();
    for (const [chave, sessao] of this.historico) {
      if (sessao.expira <= agora) this.historico.delete(chave);
    }
    for (const [id, limite] of this.limites) {
      if (limite.expira <= agora) this.limites.delete(id);
    }
    const limite = this.limites.get(usuarioId) ?? {
      vezes: 0,
      expira: agora + 60_000,
    };
    if (
      limite.vezes >= 8 ||
      this.emConsulta.has(usuarioId) ||
      this.emConsulta.size >= 4
    ) {
      throw new HttpException(
        'Limite temporário de consultas. Aguarde antes de tentar novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.limites.set(usuarioId, { ...limite, vezes: limite.vezes + 1 });
    this.emConsulta.add(usuarioId);
    try {
      return await acao();
    } finally {
      this.emConsulta.delete(usuarioId);
    }
  }
}

@Controller('assistente')
@UseGuards(JwtAuthGuard)
export class AssistenteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessoes: AssistenteSessoes,
    private readonly consultas: AssistenteConsultas,
    private readonly relatorios: OperationalReportsService,
  ) {}

  private async autorizar(req: Request) {
    if (process.env.VALE_ASSISTENTE_ATIVO !== 'true')
      throw new NotFoundException();
    const payload = req.user as JwtPayload;
    if (!Number.isInteger(payload.usuarioId) || payload.usuarioId <= 0)
      throw new UnauthorizedException();
    const [sessao, usuario] = await Promise.all([
      this.prisma.rm_sessao.findUnique({
        where: { session_id: payload.sessionId },
        select: { username: true, expires_at: true },
      }),
      this.prisma.usuario.findUnique({
        where: { usuario_id: payload.usuarioId },
        select: { ativo: true, perfil: true },
      }),
    ]);
    if (
      !sessao ||
      sessao.username !== payload.username ||
      sessao.expires_at.getTime() <= Date.now()
    )
      throw new UnauthorizedException();
    if (!usuario?.ativo || !['admin', 'operator'].includes(usuario.perfil))
      throw new ForbiddenException();
    return {
      id: payload.usuarioId,
      perfil: usuario.perfil,
      chave: `${payload.usuarioId}:${payload.sessionId}`,
      expira: sessao.expires_at.getTime(),
    };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async estado(@Req() req: Request) {
    const usuario = await this.autorizar(req);
    return {
      provedores: provedores(this.sessoes.pessoais(usuario.chave)),
      historico: this.sessoes.ler(usuario.chave),
    };
  }

  private validarOrigem(req: Request) {
    if (
      req.get('origin') &&
      req.get('origin') !==
        (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    ) {
      throw new ForbiddenException('Origem inválida.');
    }
  }

  @Get('contexto')
  @Header('Cache-Control', 'no-store')
  async contexto(@Req() req: Request, @Query('execucao') execucao?: string) {
    await this.autorizar(req);
    const id = Number(execucao);
    if (
      execucao !== undefined &&
      (!Number.isInteger(id) || id < 1 || id > 2147483647)
    ) {
      throw new BadRequestException('Execução inválida.');
    }
    const [opcoes, filtro] = await Promise.all([
      this.relatorios.options(),
      execucao
        ? this.prisma.execucao.findUnique({
            where: { execucao_id: id },
            select: { periodo_id: true, filial_id: true },
          })
        : null,
    ]);
    return { ...opcoes, filtro };
  }

  @Post('provedores')
  @Header('Cache-Control', 'no-store')
  async conectar(@Req() req: Request, @Body() input: ConectarProvedorDto) {
    const usuario = await this.autorizar(req);
    this.validarOrigem(req);
    const prefixo = input.provedor === 'gpt' ? 'sk-' : 'sk-ant-';
    if (
      !input.chave.startsWith(prefixo) ||
      (input.provedor === 'gpt' && input.chave.startsWith('sk-ant-'))
    ) {
      throw new BadRequestException(
        'A chave não corresponde ao provedor selecionado.',
      );
    }
    this.sessoes.conectar(
      usuario.chave,
      usuario.expira,
      input.provedor,
      input.chave,
    );
    return { provedores: provedores(this.sessoes.pessoais(usuario.chave)) };
  }

  @Delete('provedores/:provedor')
  @Header('Cache-Control', 'no-store')
  async desconectar(@Req() req: Request, @Param('provedor') provedor: string) {
    const usuario = await this.autorizar(req);
    this.validarOrigem(req);
    if (provedor !== 'gpt' && provedor !== 'claude')
      throw new BadRequestException('Provedor inválido.');
    this.sessoes.desconectar(usuario.chave, provedor);
    return { provedores: provedores(this.sessoes.pessoais(usuario.chave)) };
  }

  @Post('consultar')
  @Header('Cache-Control', 'no-store')
  async consultar(@Req() req: Request, @Body() input: AssistenteDto) {
    const usuario = await this.autorizar(req);
    this.validarOrigem(req);
    input.pergunta = input.pergunta.trim();
    if (!input.pergunta) throw new BadRequestException('Digite uma pergunta.');
    return this.sessoes.consultar(usuario.id, async () => {
      const intent = await selecionarConsulta(
        input,
        this.sessoes.pessoais(usuario.chave),
      );
      if (
        input.matricula &&
        !['valores', 'variaveis', 'erros', 'km', 'esclarecer'].includes(intent)
      ) {
        return {
          texto:
            'Remova a matrícula para consultar indicadores do conjunto de funcionários.',
        };
      }
      const resultado = await this.consultas.consultar(
        intent,
        input,
        usuario.perfil,
      );
      this.sessoes.gravar(usuario.chave, {
        pergunta: input.pergunta,
        resposta: resultado.texto,
        em: new Date().toISOString(),
      });
      return resultado;
    });
  }
}

@Module({
  imports: [ExecucaoModule, DashModule],
  controllers: [AssistenteController],
  providers: [AssistenteSessoes, AssistenteConsultas],
})
export class AssistenteModule {}
