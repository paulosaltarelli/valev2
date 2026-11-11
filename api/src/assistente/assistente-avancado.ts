import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { AssistenteDto, intents } from './assistente.dto';
import type { Intent } from './assistente.dto';
import { AssistenteConsultas } from './assistente-consultas';
import { AssistenteConhecimento } from './assistente-conhecimento';
import { consultarModelo } from './assistente-intencao';
import { promptSugerido, regrasFixas } from './assistente-prompt';
import {
  transformarRelatorio,
  validarTransformacao,
} from './assistente-relatorio';
import type { ResultadoAssistente } from './assistente-tipos';
import { OperationalReportsService } from '../dash/operational-reports.service';

class PlanoDto {
  @IsIn(['consulta', 'relatorio', 'conhecimento'])
  acao!: 'consulta' | 'relatorio' | 'conhecimento';

  @IsIn(intents)
  consulta!: Intent;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  periodoId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  filialId?: number | null;

  @IsString()
  @Length(1, 120)
  titulo!: string;
}

function lerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    throw new ServiceUnavailableException(
      'A IA não retornou um plano válido. Reformule a pergunta.',
    );
  }
}

@Injectable()
export class AssistenteAvancado {
  constructor(
    private readonly consultas: AssistenteConsultas,
    private readonly relatorios: OperationalReportsService,
    private readonly conhecimento: AssistenteConhecimento,
  ) {}

  estadoConhecimento() {
    return this.conhecimento.estado();
  }

  async responder(
    input: AssistenteDto,
    perfil: string,
    provedor: 'claude' | 'gpt-institucional',
    credencial: { modelo: string; chave: string },
    contexto: string | null | undefined,
    historico: { pergunta: string; resposta: string }[],
  ): Promise<ResultadoAssistente> {
    const regras =
      regrasFixas +
      '\n\nContexto administrativo:\n' +
      (contexto || promptSugerido);
    const opcoes = await this.relatorios.options();
    const periodos = opcoes.periodos.filter((p) => p.ativo);
    const filiais = opcoes.filiais.filter((f) => f.ativa);
    const memoria = historico.slice(-3).map((turno) => ({
      pergunta: turno.pergunta.slice(0, 500),
      resposta: turno.resposta.slice(0, 800),
    }));
    const fontes = this.conhecimento.buscar(
      input.pergunta + ' ' + memoria.map((t) => t.pergunta).join(' '),
      perfil,
    );
    const planoBruto = await consultarModelo(
      provedor,
      credencial,
      regras +
        `\nPlaneje uma única ação. Retorne somente JSON, sem Markdown.
Formato {"acao":"consulta|relatorio|conhecimento","consulta":"${intents.join('|')}","periodoId":numero_ou_null,"filialId":numero_ou_null,"titulo":"título curto"}.
Use conhecimento para dúvidas sobre telas, regras, estrutura e processos. Use consulta para os dados operacionais dos exemplos. Use relatorio para listas com filtros, agrupamentos, rankings, dashboards ou relatórios personalizados.
Os campos periodoId e filialId devem usar IDs da lista fornecida. Null em filialId significa todas as filiais ativas. Use a competência e a filial do contexto quando a pergunta não as mudar. Se perguntar quais filiais têm pendências, use pendencias e filialId null.
Catálogo: pendencias (todas as filiais), valores (resultados por funcionário e fórmula), variaveis (memórias de cálculo e variáveis), erros (evidências e situações), comparacao (competência anterior, com regras históricas), financeiro (relatório financeiro existente), km (distâncias), formulas (cadastro, só admin). Não troque ausência de suporte por uma consulta de assunto diferente.`,
      JSON.stringify({
        pergunta: input.pergunta,
        contexto: { periodoId: input.periodoId, filialId: input.filialId },
        periodos: periodos.map((p) => ({
          id: p.periodo_id,
          competencia: p.competencia,
        })),
        filiais: filiais
          .slice(0, 100)
          .map((f) => ({ id: f.filial_id, nome: f.nome })),
        historico: memoria,
      }),
      700,
    );
    const objeto = lerJson(planoBruto);
    if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto))
      throw new ServiceUnavailableException('O plano retornado é inválido.');
    const plano = plainToInstance(PlanoDto, objeto);
    if (
      validateSync(plano, { whitelist: true, forbidNonWhitelisted: true })
        .length
    )
      throw new ServiceUnavailableException('O plano retornado é inválido.');

    if (plano.acao === 'conhecimento') {
      const texto = await consultarModelo(
        provedor,
        credencial,
        regras +
          '\nResponda à dúvida usando somente as fontes anexadas. Não invente dados operacionais. Cite os caminhos dos arquivos relevantes quando presentes. Se o guia ou os trechos não sustentarem uma afirmação, declare a limitação.',
        JSON.stringify({
          pergunta: input.pergunta,
          historico: memoria,
          fontes,
        }),
        2200,
      );
      return {
        texto: texto.slice(0, 12000),
        fonte: fontes.fontes.join(' · '),
        consultadoEm: new Date().toISOString(),
        detalhes: fontes.estado.revisao
          ? 'Conhecimento do código ' +
            fontes.estado.revisao +
            ', gerado em ' +
            fontes.estado.atualizadoEm +
            '.'
          : 'Resposta baseada no guia operacional. O pacote do código não está disponível.',
        links: [{ texto: 'Processamentos', url: '/processamento' }],
      };
    }
    const periodoId =
      plano.periodoId ?? input.periodoId ?? periodos[0]?.periodo_id;
    if (!periodoId || !periodos.some((p) => p.periodo_id === periodoId))
      throw new BadRequestException(
        'Não há competência ativa compatível com a consulta.',
      );
    const filialId =
      plano.filialId === null ? undefined : (plano.filialId ?? input.filialId);
    if (filialId && !filiais.some((f) => f.filial_id === filialId))
      throw new BadRequestException(
        'Filial não disponível para esta consulta.',
      );
    if (
      input.matricula &&
      !['valores', 'variaveis', 'erros', 'km'].includes(plano.consulta)
    )
      throw new BadRequestException(
        'Esta consulta não aceita filtro de matrícula.',
      );
    const filtros = { ...input, periodoId, filialId };
    let resultado: ResultadoAssistente;
    if (
      plano.acao === 'relatorio' &&
      !filialId &&
      !['pendencias', 'ajuda', 'esclarecer'].includes(plano.consulta)
    ) {
      resultado = await this.consultarFiliais(
        plano.consulta,
        filtros,
        perfil,
        filiais,
      );
    } else {
      resultado = await this.consultas.consultar(
        plano.consulta,
        filtros,
        perfil,
      );
    }
    if (plano.acao !== 'relatorio' || !resultado.tabela) return resultado;
    const transformacao = validarTransformacao(
      lerJson(
        await consultarModelo(
          provedor,
          credencial,
          regras +
            `\nCrie somente um JSON de transformação de relatório. Use exclusivamente os nomes de colunas fornecidos.
Formato {"filtros":[{"coluna":"nome exato","operador":"igual|diferente|contem|maior|menor|vazio","valor":"texto"}],"agrupar":["coluna"],"metricas":[{"operacao":"contagem|soma|minimo|maximo","coluna":"coluna ou vazio para contagem"}],"colunas":["projeção final, opcional"],"decrescente":false,"grafico":false}.
Opcional ordenarPor com coluna final. Use arrays vazios quando não solicitado. Limites: 10 filtros, 3 agrupamentos, 6 métricas, 12 colunas projetadas. Não agregue versões, IDs, revisões nem quantidades não solicitadas.
Contagem é de registros, não de funcionários únicos. Valores vazios permanecem vazios. Após agregação, nomes são "Contagem de registros" ou "soma de COLUNA", "minimo de COLUNA", "maximo de COLUNA".
Para um gráfico, use um agrupamento e uma métrica. Não invente colunas. Não infira o valor enviado ao RM a partir do valor final local.`,
          JSON.stringify({
            pergunta: input.pergunta,
            colunas: resultado.tabela.colunas,
            linhas: resultado.tabela.linhas.length,
            parcial: resultado.tabela.parcial,
            contexto: {
              competencia: resultado.competencia,
              filial: resultado.filial,
            },
          }),
          1400,
        ),
      ),
    );
    const relatorio = transformarRelatorio(resultado, transformacao);
    return { ...relatorio, texto: plano.titulo + '. ' + relatorio.texto };
  }

  private async consultarFiliais(
    intent: Intent,
    filtros: AssistenteDto,
    perfil: string,
    filiais: { filial_id: number; nome: string }[],
  ): Promise<ResultadoAssistente> {
    if (filiais.length > 25)
      throw new BadRequestException(
        'Selecione uma filial para reduzir o relatório a até 25 filiais.',
      );
    let base: ResultadoAssistente | undefined;
    const linhas: (string | number | null)[][] = [];
    const ausentes: string[] = [];
    let parcial = false;
    const inicio = Date.now();
    for (const filial of filiais) {
      if (Date.now() - inicio > 12000)
        throw new ServiceUnavailableException(
          'O relatório excedeu o tempo de consulta. Selecione uma filial.',
        );
      const item: ResultadoAssistente = await this.consultas.consultar(
        intent,
        { ...filtros, filialId: filial.filial_id },
        perfil,
      );
      if (!item.tabela) {
        ausentes.push(filial.nome + ': ' + item.texto);
        continue;
      }
      if (!base) base = item;
      if (
        JSON.stringify(base.tabela!.colunas) !==
        JSON.stringify(item.tabela.colunas)
      )
        throw new BadRequestException(
          'As filiais retornaram estruturas incompatíveis. Consulte uma filial por vez.',
        );
      parcial ||= item.tabela.parcial;
      linhas.push(
        ...item.tabela.linhas.map((linha) => [filial.nome, ...linha]),
      );
      if (linhas.length > 2000) {
        parcial = true;
        break;
      }
    }
    if (!base)
      return {
        texto: 'Não há uma base de relatório disponível para o recorte.',
        detalhes: ausentes.join('\n'),
        fonte: 'Banco do Vale Expresso',
        consultadoEm: new Date().toISOString(),
      };
    return {
      ...base,
      filial: 'Todas as filiais ativas',
      detalhes: [base.detalhes, ...ausentes].filter(Boolean).join('\n'),
      tabela: {
        colunas: ['Filial', ...base.tabela!.colunas],
        linhas: linhas.slice(0, 2000),
        parcial: parcial || ausentes.length > 0,
      },
      grafico: undefined,
    };
  }
}
