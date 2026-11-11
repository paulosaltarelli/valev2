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
import type { ResultadoAssistente, TurnoAssistente } from './assistente-tipos';
import { OperationalReportsService } from '../dash/operational-reports.service';
import { AssistenteSql } from './assistente-sql';
import { AssistenteInvestigacao } from './assistente-investigacao';

class PlanoDto {
  @IsIn(['consulta', 'relatorio', 'sql', 'conhecimento', 'investigar'])
  acao!: 'consulta' | 'relatorio' | 'sql' | 'conhecimento' | 'investigar';

  @IsOptional()
  @IsString()
  @Length(1, 120)
  funcionario?: string;

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

// A continuação de escopo é resolvida no servidor, inclusive após reabrir o chat.
export function retomarTodasFiliais(
  input: AssistenteDto,
  historico: { pergunta: string; resposta: string }[],
): AssistenteDto {
  const somenteEscopo = /^(?:todas(?: as filiais)?|todas elas|geral)[.!?\s]*$/i;
  if (
    !somenteEscopo.test(input.pergunta.trim()) ||
    !/qual filial|selecione (?:uma |a )?filial/i.test(
      historico.at(-1)?.resposta ?? '',
    )
  )
    return input;
  const anterior = [...historico]
    .reverse()
    .find((t) => !somenteEscopo.test(t.pergunta.trim()));
  return anterior
    ? {
        ...input,
        pergunta: anterior.pergunta.slice(0, 470) + ' · todas as filiais',
        filialId: undefined,
        todasFiliais: true,
      }
    : input;
}

@Injectable()
export class AssistenteAvancado {
  constructor(
    private readonly consultas: AssistenteConsultas,
    private readonly relatorios: OperationalReportsService,
    private readonly conhecimento: AssistenteConhecimento,
    private readonly sql: AssistenteSql,
    private readonly investigacao: AssistenteInvestigacao,
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
    historico: TurnoAssistente[],
    usuarioId?: number,
  ): Promise<ResultadoAssistente> {
    input = retomarTodasFiliais(input, historico);
    const regras =
      regrasFixas +
      '\n\nContexto administrativo:\n' +
      (contexto || promptSugerido);
    const opcoes = await this.relatorios.options();
    const periodos = opcoes.periodos.filter((p) => p.ativo);
    const filiais = opcoes.filiais.filter((f) => f.ativa);
    const grupoAnterior = historico.at(-1)?.contexto;
    const continuacao = input.pergunta
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    if (
      grupoAnterior?.tipo === 'funcionarios_com_erro' &&
      /\b(?:eles|elas|esses|essas|estes|estas)\b/.test(continuacao) &&
      /\b(?:quais|quem|liste|listar|mostre|mostrar|erro|erros|falha|falhas)\b|por que|porque/.test(
        continuacao,
      ) &&
      !/\b\d{1,2}\/\d{4}\b|\b(?:outra|nova) (?:filial|competencia)\b|\b(?:competencia|mes|periodo) (?:anterior|seguinte|passad[oa]|proxim[oa])\b/.test(
        continuacao,
      )
    ) {
      return this.investigacao.responderGrupo(
        grupoAnterior,
        provedor,
        credencial,
        contexto,
      );
    }
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
Formato {"acao":"consulta|sql|conhecimento|investigar","consulta":"${intents.join('|')}","periodoId":numero_ou_null,"filialId":numero_ou_null,"titulo":"título curto"}. Para investigar, acrescente "funcionario":"nome ou matrícula citado na pergunta" quando disponível. Não invente identificação.
Use investigar para explicar por que um funcionário teve problema, ficou sem valores, teve falhas ou não foi calculado. Esta ferramenta consulta banco, memórias, erros e código em conjunto. Não troque a investigação por uma resposta genérica de conhecimento.
Perguntas como “tem funcionário com erro?” ou “há funcionários com problemas?” usam consulta erros, em todas as filiais quando a tela não seleciona uma. Não peça filial para esse panorama. “Todas” em resposta a uma pergunta de filial mantém a pergunta original e a competência e abrange todas as filiais.
Use conhecimento para dúvidas sobre telas, regras, estrutura e processos. Use consulta para pendências, evidências de erro, memórias e comparações que já tenham um serviço pertinente. Use sql para perguntas sobre valores, totais, rankings, descontos, relatórios, dashboards e consultas personalizadas: a próxima ferramenta construirá e executará um SELECT validado sobre dados reais.
Os campos periodoId e filialId devem usar IDs da lista fornecida. Null em filialId significa todas as filiais ativas. Use a competência e a filial do contexto quando a pergunta não as mudar. Se perguntar quais filiais têm pendências, use pendencias e filialId null. Se perguntar qual filial teve maior ou menor valor, ou um ranking de filiais, use sql e filialId null, mesmo que a tela atual tenha uma filial selecionada. Mês 10 significa outubro do ano do contexto, e deve selecionar a competência ativa correspondente.
Catálogo: pendencias (todas as filiais), valores (resultados por funcionário e fórmula), variaveis (memórias de cálculo e variáveis), erros (evidências e situações), comparacao (competência anterior, com regras históricas), financeiro (relatório financeiro existente), km (distâncias), formulas (cadastro, só admin). Não troque ausência de suporte por uma consulta de assunto diferente.`,
      JSON.stringify({
        pergunta: input.pergunta,
        contexto: {
          periodoId: input.periodoId,
          filialId: input.filialId,
          todasFiliais: input.todasFiliais,
        },
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

    const perguntaNormalizada = input.pergunta
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const panoramaErros =
      !input.matricula &&
      !plano.funcionario &&
      /funcionar|colaborador/.test(perguntaNormalizada) &&
      /erro|falh|problema/.test(perguntaNormalizada) &&
      /\b(?:tem|ha|existe|existem|quais|quantos|liste|listar|mostre|mostrar)\b/.test(
        perguntaNormalizada,
      ) &&
      !/por que|porque|\bpq\b/.test(perguntaNormalizada);
    if (panoramaErros) {
      plano.acao = 'consulta';
      plano.consulta = 'erros';
    }
    const investigar =
      !panoramaErros &&
      (plano.acao === 'investigar' ||
        (/funcion[aá]rio|colaborador/i.test(input.pergunta) &&
          /por qu[eê]|\bpq\b|problema|sem valor|n[aã]o (?:vieram|teve|calcul)/i.test(
            input.pergunta,
          )));
    if (plano.acao === 'conhecimento' && !investigar) {
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
    const comparaFiliais =
      /\bqual(?:is)?\s+(?:a\s+|as\s+)?filia(?:l|is)\b/.test(
        perguntaNormalizada,
      ) ||
      /\b(?:ranking|compar\w*)\s+(?:de\s+|entre\s+|das\s+)?filiais\b/.test(
        perguntaNormalizada,
      );
    const panoramaSemRecorte =
      panoramaErros &&
      !input.filialId &&
      /^(?:tem|ha|existe|existem|quais|quantos)\s+(?:(?:alguns?|algumas?|os|as)\s+)?(?:funcionarios?|colaboradores?)\s+(?:com|em)\s+(?:erros?|falhas?|problemas?)(?:\s+(?:nesta|nessa|na)\s+competencia)?[\s?!.]*$/.test(
        perguntaNormalizada,
      );
    const filialId =
      input.todasFiliais ||
      panoramaSemRecorte ||
      /\btodas (?:as )?filiais\b/.test(perguntaNormalizada) ||
      comparaFiliais ||
      plano.filialId === null
        ? undefined
        : (plano.filialId ?? input.filialId);
    if (filialId && !filiais.some((f) => f.filial_id === filialId))
      throw new BadRequestException(
        'Filial não disponível para esta consulta.',
      );
    if (investigar) {
      const matriculaDaPergunta =
        /(?:matr[ií]cula|funcion[aá]rio)\s+(\d[\d./-]{2,49})/i.exec(
          input.pergunta,
        )?.[1];
      return this.investigacao.responder(
        input.matricula ?? matriculaDaPergunta ?? plano.funcionario,
        {
          periodoId,
          competencia: periodos.find((p) => p.periodo_id === periodoId)!
            .competencia,
          filialId,
        },
        provedor,
        credencial,
        contexto,
      );
    }
    if (
      input.matricula &&
      !['valores', 'variaveis', 'erros', 'km'].includes(plano.consulta)
    )
      throw new BadRequestException(
        'Esta consulta não aceita filtro de matrícula.',
      );
    const filtros = { ...input, periodoId, filialId };
    const rankingDeFiliais =
      comparaFiliais &&
      /\b(maior|menor|mais|menos|ranking)\b/.test(perguntaNormalizada);
    if (
      plano.acao === 'sql' ||
      plano.acao === 'relatorio' ||
      rankingDeFiliais
    ) {
      return this.sql.responder(
        input.pergunta,
        {
          periodoId,
          competencia: periodos.find((p) => p.periodo_id === periodoId)!
            .competencia,
          filialId,
          filial: filiais.find((f) => f.filial_id === filialId)?.nome,
          matricula: input.matricula,
          perfil,
          usuarioId,
        },
        provedor,
        credencial,
        contexto,
        historico,
      );
    }
    return this.consultas.consultar(plano.consulta, filtros, perfil);
  }
}
