import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Post,
  Put,
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
import { AssistenteConfiguracaoDto, AssistenteDto } from './assistente.dto';
import { provedores, selecionarConsulta } from './assistente-intencao';

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

  private async autorizar(req: Request, apenasAdmin = false) {
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
    if (apenasAdmin && usuario.perfil !== 'admin')
      throw new ForbiddenException();
    return {
      id: payload.usuarioId,
      perfil: usuario.perfil,
      chave: `${payload.usuarioId}:${payload.sessionId}`,
    };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async estado(@Req() req: Request) {
    const usuario = await this.autorizar(req);
    const config = process.env.ANTHROPIC_API_KEY
      ? await this.prisma.assistente_configuracao.findUnique({
          where: { id: 1 },
        })
      : null;
    return {
      provedores: provedores(config?.claude_ativo),
      historico: this.sessoes.ler(usuario.chave),
    };
  }

  @Get('configuracao')
  @Header('Cache-Control', 'no-store')
  async configuracao(@Req() req: Request) {
    await this.autorizar(req, true);
    const config = await this.prisma.assistente_configuracao.findUniqueOrThrow({
      where: { id: 1 },
    });
    return {
      ativo: config.claude_ativo,
      modelo: config.claude_modelo,
      credencialConfigurada: Boolean(process.env.ANTHROPIC_API_KEY),
    };
  }

  @Put('configuracao')
  @Header('Cache-Control', 'no-store')
  async salvarConfiguracao(
    @Req() req: Request,
    @Body() input: AssistenteConfiguracaoDto,
  ) {
    await this.autorizar(req, true);
    this.validarOrigem(req);
    if (input.ativo && !process.env.ANTHROPIC_API_KEY)
      throw new BadRequestException(
        'Configure a credencial institucional no servidor antes de ativar Claude.',
      );
    await this.prisma.assistente_configuracao.update({
      where: { id: 1 },
      data: { claude_ativo: input.ativo, claude_modelo: input.modelo },
    });
    return { salvo: true };
  }

  @Post('configuracao/testar')
  @Header('Cache-Control', 'no-store')
  async testarConfiguracao(
    @Req() req: Request,
    @Body() input: AssistenteConfiguracaoDto,
  ) {
    const usuario = await this.autorizar(req, true);
    this.validarOrigem(req);
    return this.sessoes.consultar(usuario.id, async () => {
      await selecionarConsulta(
        { provedor: 'claude', pergunta: 'Como funciona o Vale Expresso?' },
        input.modelo,
        true,
      );
      return { conectado: true };
    });
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

  @Post('consultar')
  @Header('Cache-Control', 'no-store')
  async consultar(@Req() req: Request, @Body() input: AssistenteDto) {
    const usuario = await this.autorizar(req);
    this.validarOrigem(req);
    input.pergunta = input.pergunta.trim();
    if (!input.pergunta) throw new BadRequestException('Digite uma pergunta.');
    return this.sessoes.consultar(usuario.id, async () => {
      const config =
        input.provedor === 'claude'
          ? await this.prisma.assistente_configuracao.findUnique({
              where: { id: 1 },
            })
          : null;
      const intent = await selecionarConsulta(
        input,
        config?.claude_ativo ? config.claude_modelo : undefined,
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
