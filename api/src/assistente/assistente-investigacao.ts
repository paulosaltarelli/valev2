import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { analisarExpressao } from '../helpers/calculator/formula-expression';
import { lerSnapshotFormula } from '../dash/operational-reports';
import { classificarLog, situacaoValor } from './assistente-consultas';
import { AssistenteConhecimento } from './assistente-conhecimento';
import { consultarModelo } from './assistente-intencao';
import { promptSugerido, regrasFixas } from './assistente-prompt';
import {
  contextoConsulta,
  type ContextoErros,
  type ResultadoAssistente,
} from './assistente-tipos';

const fatosInternos = Symbol('fatos-investigacao');
type ResultadoFatos = ResultadoAssistente & {
  [fatosInternos]?: Record<string, unknown>;
};

function evidenciaDoCaso(dados: ResultadoFatos) {
  const logs = dados[fatosInternos]?.logsHistoricos;
  if (!Array.isArray(logs) || !logs.length)
    return 'Não há log histórico reconhecido que confirme uma causa específica.';
  return (
    'Evidência histórica: ' +
    logs
      .slice(0, 2)
      .map(
        (l: { codigo?: string; evidencia: string; data: string }) =>
          l.evidencia +
          (l.codigo ? ' Código relacionado: ' + l.codigo + '.' : '') +
          ' Registro: ' +
          l.data +
          '.',
      )
      .join(' ') +
    ' Não comprova, sozinha, a causa atual.'
  );
}
type PessoaInvestigacao = {
  execucao_funcionario_base_id: number;
  funcionario_id_rm: string;
  nome_funcionario: string | null;
  status: string | null;
  execucao: {
    execucao_id: number;
    filial_id: number;
    filial: { nome: string };
  };
};

export function resumirLogInvestigacao(mensagem: string, matricula: string) {
  const conhecido = classificarLog(mensagem);
  if (conhecido?.matricula === matricula)
    return {
      tipo: 'Log histórico',
      codigo: conhecido.codigo,
      evidencia: conhecido.causa,
    };
  const calculo =
    /^Erro ao calcular fórmula (\d+) para funcionário ([^:\r\n]+):/.exec(
      mensagem,
    );
  if (calculo?.[2] === matricula) {
    const simbolo = /Undefined symbol ([A-Za-z_][A-Za-z0-9_]{0,49})\b/.exec(
      mensagem,
    );
    const evidencia = simbolo
      ? `A calculadora registrou símbolo não definido: ${simbolo[1]}.`
      : /A fórmula deve retornar um número finito/.test(mensagem)
        ? 'A calculadora registrou que a fórmula não retornou um número finito.'
        : /Unexpected operator|Unexpected end|Parenthesis .* expected|Value expected/.test(
              mensagem,
            )
          ? 'A calculadora registrou erro de sintaxe na expressão.'
          : 'A calculadora rejeitou o cálculo desta fórmula. O detalhe técnico não foi exposto automaticamente.';
    return {
      tipo: 'Log histórico',
      codigo: calculo[1],
      evidencia,
    };
  }
  const inesperado =
    /^Erro inesperado ao processar valores do funcionário ([^:\r\n]+):/.exec(
      mensagem,
    );
  if (inesperado?.[1] === matricula)
    return {
      tipo: 'Log histórico',
      evidencia:
        'Foi registrada falha inesperada no processamento de valores; a mensagem não confirma uma causa específica.',
    };
  return null;
}

@Injectable()
export class AssistenteInvestigacao {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conhecimento: AssistenteConhecimento,
  ) {}

  async responderGrupo(
    grupo: ContextoErros,
    provedor: 'claude' | 'gpt-institucional',
    credencial: { modelo: string; chave: string },
    contexto?: string | null,
  ): Promise<ResultadoAssistente> {
    const consultadoEm = new Date().toISOString();
    const base = {
      competencia: grupo.competencia,
      filial: grupo.filial,
      consultadoEm,
      [contextoConsulta]: grupo,
      fonte: 'Banco do Vale · grupo da consulta anterior',
    };
    const periodo = await this.prisma.periodo.findUnique({
      where: { periodo_id: grupo.periodoId },
      select: { ativo: true },
    });
    if (!periodo?.ativo)
      return {
        ...base,
        texto:
          'A competência do grupo consultado não está mais ativa. Não alterei o recorte nem escolhi outra competência.',
      };
    if (!grupo.funcionarioBaseIds.length)
      return {
        ...base,
        texto: grupo.total
          ? 'Não foi possível preservar os registros deste grupo. Consulte novamente o panorama de erros.'
          : 'A consulta anterior não encontrou funcionários com erro nos registros sem duplicidade.',
      };
    const runs = await this.prisma.execucao.findMany({
      where: {
        periodo_id: grupo.periodoId,
        filial: { ativa: true },
        ...(grupo.filialId ? { filial_id: grupo.filialId } : {}),
      },
      select: { execucao_id: true, filial_id: true },
      take: 2001,
    });
    if (runs.length > 2000)
      return {
        ...base,
        texto:
          'O limite de execuções impede verificar duplicidades com segurança. Não escolhi uma execução para diagnosticar.',
      };
    const permitidas = runs
      .filter(
        (r) =>
          grupo.execucaoIds.includes(r.execucao_id) &&
          runs.filter((x) => x.filial_id === r.filial_id).length === 1,
      )
      .map((r) => r.execucao_id);
    const pessoas = await this.prisma.execucao_funcionario_base.findMany({
      where: {
        execucao_id: { in: permitidas },
        execucao_funcionario_base_id: {
          in: grupo.funcionarioBaseIds.slice(0, 20),
        },
      },
      select: {
        execucao_funcionario_base_id: true,
        funcionario_id_rm: true,
        nome_funcionario: true,
        status: true,
        execucao: {
          select: {
            execucao_id: true,
            filial_id: true,
            filial: { select: { nome: true } },
          },
        },
      },
      orderBy: { execucao_funcionario_base_id: 'asc' },
      take: 20,
    });
    const casos: {
      referencia: string;
      pessoa: PessoaInvestigacao;
      dados: ResultadoFatos;
      leituraFalhou: boolean;
    }[] = [];
    for (let i = 0; i < pessoas.length; i += 2) {
      const lote = pessoas.slice(i, i + 2);
      const resultado = await Promise.allSettled(
        lote.map((p) =>
          this.analisar(
            p,
            {
              periodoId: grupo.periodoId,
              competencia: grupo.competencia,
              filialId: p.execucao.filial_id,
            },
            {
              competencia: grupo.competencia,
              consultadoEm,
              filial: p.execucao.filial.nome,
              fonte: 'Banco do Vale · investigação por funcionário',
            },
            provedor,
            credencial,
            contexto,
            false,
          ),
        ),
      );
      resultado.forEach((r, j) =>
        casos.push({
          referencia: 'Caso ' + (i + j + 1),
          pessoa: lote[j],
          leituraFalhou: r.status === 'rejected',
          dados:
            r.status === 'fulfilled'
              ? r.value
              : {
                  texto:
                    'Não foi possível consultar as evidências deste funcionário. Não há causa confirmada.',
                },
        }),
      );
    }
    const codigo = this.conhecimento.investigacao();
    const explicacoes = new Map<string, string>();
    let sinteseFalhou = false;
    if (casos.length)
      try {
        const texto = await consultarModelo(
          provedor,
          credencial,
          regrasFixas +
            '\n' +
            (contexto || promptSugerido) +
            '\nExplique os funcionários do grupo anterior usando exclusivamente fatos e código anexados. Retorne somente JSON {"casos":[{"referencia":"Caso 1","explicacao":"Evidência: ... Limitação: ... Próximo passo: ..."}]}. Use cada referência exatamente uma vez; não invente outras. Até 700 caracteres por caso. Não há identificação pessoal nos dados enviados. Não peça filtros ou identificação já resolvidos. Não transcreva fórmula nem código. Filas são da execução inteira. Logs são históricos: não confirmam causa atual. Com memórias existentes, não conclua ausência total de memória. Resultado zero, ausência e erro são diferentes. Explique somente os casos lidos; para leituraFalhou declare indisponibilidade. Oriente pela tela Processamentos; não execute reprocessamento.',
          JSON.stringify({
            casos: casos.map((c) => {
              const f = c.dados[fatosInternos];
              const resultados = (f?.resultados ?? []) as Record<
                string,
                unknown
              >[];
              return {
                referencia: c.referencia,
                leituraFalhou: c.leituraFalhou,
                fatos: f
                  ? {
                      statusFuncionario: f.statusFuncionario,
                      resultados: [...resultados]
                        .sort(
                          (a, b) =>
                            Number(b.status === 'ERRO') -
                            Number(a.status === 'ERRO'),
                        )
                        .slice(0, 12)
                        .map((r) => ({
                          formulaId: r.formulaId,
                          formula: r.formula,
                          status: r.status,
                          calculado: r.calculado,
                          versaoHistorica: r.versaoHistorica,
                          memoriasGravadas: r.memoriasGravadas,
                          variaveisHistoricasSemMemoria:
                            r.variaveisHistoricasSemMemoria,
                        })),
                      logsHistoricos: (
                        (f.logsHistoricos ?? []) as unknown[]
                      ).slice(0, 10),
                      limites: {
                        resultadosNaSintese: 12,
                        logsNaSintese: 10,
                        totalResultadosLidos: resultados.length,
                      },
                    }
                  : null,
              };
            }),
            codigo: codigo.trechos,
          }),
          4000,
        );
        const plano = JSON.parse(texto) as {
          casos?: { referencia?: unknown; explicacao?: unknown }[];
        };
        if (
          !plano ||
          !Array.isArray(plano.casos) ||
          plano.casos.length !== casos.length
        )
          throw new Error('Invalid group response');
        for (const item of plano.casos) {
          if (
            typeof item.referencia !== 'string' ||
            typeof item.explicacao !== 'string' ||
            !casos.some((c) => c.referencia === item.referencia) ||
            explicacoes.has(item.referencia)
          )
            throw new Error('Invalid case reference');
          explicacoes.set(item.referencia, item.explicacao.slice(0, 1600));
        }
      } catch {
        explicacoes.clear();
        sinteseFalhou = true;
      }
    const parcial =
      grupo.parcial ||
      casos.length !== grupo.total ||
      casos.some((c) => c.leituraFalhou || c.dados.tabela?.parcial);
    const links = [
      ...new Set(casos.map((c) => c.pessoa.execucao.execucao_id)),
    ].map((id) => ({
      texto: 'Abrir execução ' + id,
      url: '/processamento/' + id,
    }));
    return {
      ...base,
      texto:
        `Listei ${casos.length} ${casos.length === 1 ? 'registro de funcionário' : 'registros de funcionários'} do grupo consultado em ${grupo.competencia}. As evidências e os próximos passos estão na tabela.` +
        (parcial
          ? ' O detalhamento é parcial: limite de 20 registros, alteração do recorte, duplicidade ou falha de leitura; não escolhi outra execução para substituir registros.'
          : '') +
        (sinteseFalhou
          ? ' A síntese do provedor está indisponível; mantive os dados e as limitações verificáveis.'
          : ''),
      fonte:
        base.fonte +
        (codigo.fontes.length
          ? ' · ' + codigo.fontes.join(' · ')
          : ' · código indisponível'),
      detalhes:
        'Grupo preservado da consulta de ' +
        grupo.capturadoEm +
        '. Situações foram consultadas novamente e podem ter mudado desde o panorama. Diagnóstico limitado a 20 registros por resposta. Nomes e matrículas não foram enviados ao provedor. Código: pacote ' +
        codigo.estado.revisao +
        ', atualizado em ' +
        codigo.estado.atualizadoEm +
        '.\n' +
        casos
          .map(
            (c) =>
              c.referencia +
              ': ' +
              c.dados.texto +
              '\n' +
              (c.dados.detalhes ?? ''),
          )
          .join('\n\n'),
      tabela: {
        colunas: [
          'Matrícula',
          'Funcionário',
          'Filial',
          'Execução',
          'Estado atual',
          'Resultados com erro',
          'Resultados com valor calculado',
          'Evidência e orientação',
        ],
        linhas: casos.map((c) => [
          c.pessoa.funcionario_id_rm,
          c.pessoa.nome_funcionario,
          c.pessoa.execucao.filial.nome,
          c.pessoa.execucao.execucao_id,
          c.pessoa.status,
          c.leituraFalhou
            ? null
            : (c.dados.tabela?.linhas.filter((r) => r[3] === 'Erro').length ??
              0),
          c.leituraFalhou
            ? null
            : (c.dados.tabela?.linhas.filter((r) => r[4] !== null).length ?? 0),
          c.leituraFalhou
            ? c.dados.texto
            : evidenciaDoCaso(c.dados) +
              ' Interpretação e orientação da IA: ' +
              (explicacoes.get(c.referencia) ??
                c.dados.texto +
                  ' Causa atual não confirmada. Confira as evidências históricas nos detalhes.'),
        ]),
        parcial,
      },
      links,
    };
  }

  async responder(
    identificador: string | undefined,
    escopo: { periodoId: number; competencia: string; filialId?: number },
    provedor: 'claude' | 'gpt-institucional',
    credencial: { modelo: string; chave: string },
    contexto?: string | null,
  ): Promise<ResultadoAssistente> {
    const base = {
      competencia: escopo.competencia,
      consultadoEm: new Date().toISOString(),
      fonte: 'Banco do Vale · investigação de funcionário',
    };
    const termo = identificador?.trim();
    if (!termo)
      return {
        ...base,
        texto:
          'Qual funcionário deseja investigar? Informe o nome ou a matrícula. A competência será a ativa.',
      };
    const where = {
      execucao: {
        periodo_id: escopo.periodoId,
        ...(escopo.filialId ? { filial_id: escopo.filialId } : {}),
      },
      OR: [
        { funcionario_id_rm: termo },
        { nome_funcionario: { contains: termo } },
      ],
    };
    const candidatos = await this.prisma.execucao_funcionario_base.findMany({
      where,
      take: 6,
      select: {
        execucao_funcionario_base_id: true,
        funcionario_id_rm: true,
        nome_funcionario: true,
        status: true,
        execucao: {
          select: {
            execucao_id: true,
            filial_id: true,
            filial: { select: { nome: true } },
          },
        },
      },
    });
    if (!candidatos.length)
      return {
        ...base,
        texto:
          'Nenhum funcionário corresponde à identificação no recorte consultado. Confira a identificação e a filial da tela; isso não confirma falha na importação.',
        filial: escopo.filialId ? 'Filial do contexto' : 'Todas as filiais',
      };
    if (candidatos.length !== 1)
      return {
        ...base,
        texto:
          'Há mais de um registro correspondente. Informe a matrícula e a filial; não escolhi uma execução silenciosamente.',
        tabela: {
          colunas: ['Matrícula', 'Funcionário', 'Filial', 'Execução'],
          linhas: candidatos.map((c) => [
            c.funcionario_id_rm,
            c.nome_funcionario,
            c.execucao.filial.nome,
            c.execucao.execucao_id,
          ]),
          parcial: candidatos.length === 6,
        },
      };
    const pessoa = candidatos[0];
    const execucao = pessoa.execucao;
    const runs = await this.prisma.execucao.findMany({
      where: { periodo_id: escopo.periodoId, filial_id: execucao.filial_id },
      select: { execucao_id: true },
      take: 3,
    });
    const meta = {
      ...base,
      matricula: pessoa.funcionario_id_rm,
      filial: execucao.filial.nome,
      links: [
        {
          texto: 'Abrir execução',
          url: '/processamento/' + execucao.execucao_id,
        },
      ],
    };
    if (runs.length !== 1)
      return {
        ...meta,
        texto:
          'Existem execuções duplicadas nesta filial e competência. Resolva a duplicidade antes de atribuir uma causa ao funcionário; nenhuma execução foi escolhida para diagnóstico.',
      };
    return this.analisar(pessoa, escopo, meta, provedor, credencial, contexto);
  }

  private async analisar(
    pessoa: PessoaInvestigacao,
    escopo: { periodoId: number; competencia: string; filialId?: number },
    meta: Omit<ResultadoAssistente, 'texto'>,
    provedor: 'claude' | 'gpt-institucional',
    credencial: { modelo: string; chave: string },
    contexto?: string | null,
    sintetizar = true,
  ): Promise<ResultadoFatos> {
    const execucao = pessoa.execucao;
    const [resultados, logs, filas, formulasAtivas] = await Promise.all([
      this.prisma.execucao_funcionario.findMany({
        where: {
          execucao_id: execucao.execucao_id,
          execucao_funcionario_base_id: pessoa.execucao_funcionario_base_id,
        },
        take: 101,
        orderBy: { formula_id: 'asc' },
        select: {
          formula_id: true,
          status: true,
          valor_calculado: true,
          valor_final: true,
          ajuste_manual: true,
          formula_snapshot: true,
          formula: { select: { nome: true, versao: true } },
          _count: { select: { memoria_calculo: true } },
          memoria_calculo: {
            select: { variavel_codigo: true },
            take: 200,
            distinct: ['variavel_codigo'],
          },
        },
      }),
      this.prisma.log_execucao.findMany({
        where: {
          execucao_id: execucao.execucao_id,
          nivel: 'ERROR',
          mensagem: { contains: pessoa.funcionario_id_rm },
        },
        select: { mensagem: true, data_log: true },
        orderBy: { log_id: 'desc' },
        take: 101,
      }),
      this.prisma.execucao_queue.groupBy({
        by: ['status'],
        where: { execucao_id: execucao.execucao_id },
        _count: true,
      }),
      this.prisma.formula.count({
        where: { filial_id: execucao.filial_id, ativa: true },
      }),
    ]);
    const evidencias = resultados.slice(0, 100).map((r) => {
      const snapshot = lerSnapshotFormula(r.formula_snapshot);
      const gravados = r.memoria_calculo.map((m) => m.variavel_codigo);
      const necessarios = snapshot
        ? [...analisarExpressao(snapshot.expressao).codigos]
        : null;
      return {
        formulaId: r.formula_id,
        formula: snapshot?.nome ?? r.formula.nome,
        versaoHistorica: snapshot?.versao ?? null,
        versaoCadastro: r.formula.versao,
        status: r.status,
        situacao: situacaoValor(
          r.status,
          r.valor_calculado?.toString() ?? null,
        ),
        calculado: r.valor_calculado?.toString() ?? null,
        finalLocal: r.valor_final?.toString() ?? null,
        ajusteManual: r.ajuste_manual,
        memoriasGravadas: r._count.memoria_calculo,
        variaveisComMemoria: gravados,
        variaveisHistoricasSemMemoria:
          r.memoria_calculo.length >= 200
            ? null
            : (necessarios?.filter((c) => !gravados.includes(c)) ?? null),
      };
    });
    const historico = logs.slice(0, 100).flatMap((l) => {
      const seguro = resumirLogInvestigacao(
        l.mensagem,
        pessoa.funcionario_id_rm,
      );
      return seguro ? [{ ...seguro, data: l.data_log.toISOString() }] : [];
    });
    const codigo = this.conhecimento.investigacao();
    const fatos = {
      competencia: escopo.competencia,
      statusFuncionario: pessoa.status,
      filasDaExecucaoInteiraIncluindoHistorico: filas.map((f) => ({
        status: f.status,
        quantidade: f._count,
      })),
      formulasAtivasNoCadastroAtual: formulasAtivas,
      resultados: evidencias,
      logsHistoricos: historico,
      limites: {
        resultadosParciais: resultados.length > 100,
        logsParciais: logs.length > 100,
        logsNaoInterpretados: logs.slice(0, 100).length - historico.length,
      },
    };
    const resumo = `Estado do funcionário: ${pessoa.status ?? 'não informado'}. ${evidencias.filter((r) => r.calculado !== null).length} de ${evidencias.length} resultado(s) consultado(s) têm valor calculado; ${evidencias.filter((r) => r.status === 'ERRO').length} estão em erro. ${evidencias.reduce((n, r) => n + r.memoriasGravadas, 0)} memória(s) gravada(s) por resultado/fórmula.`;
    let explicacao = '';
    if (sintetizar)
      try {
        explicacao = await consultarModelo(
          provedor,
          credencial,
          regrasFixas +
            '\n' +
            (contexto || promptSugerido) +
            '\nExplique este caso em texto simples, sem Markdown, em no máximo 7 frases curtas, separando Evidências, Limitação ou hipótese e Próximo passo. A tabela já detalha as fórmulas: não repita todos os IDs e valores no texto. Use exclusivamente os fatos e o código fornecidos. Cite somente o caminho e a linha relevantes. Não transcreva código nem sintaxe de fórmulas. Filas são históricas e da execução inteira: não atribua suas falhas ao funcionário. O status ERRO do resultado por fórmula não equivale ao status da execução. Logs históricos não confirmam causa atual. Memórias são por fórmula e podem repetir variáveis. Variáveis sem memória não provam falha no RM. Cadastro atual não comprova vigência histórica. Oriente pela tela Processamentos, sem sugerir executar métodos internos ou pedir novamente filtros já resolvidos. Não prometa reprocessamento nem gere arquivos ou links. Não afirme ausência de valores se houver calculados. Identificação pessoal foi removida por minimização de dados.',
          JSON.stringify({ fatos, codigo: codigo.trechos }),
          1800,
        );
      } catch {
        explicacao =
          'A explicação pelo provedor está indisponível. Os registros consultados permanecem abaixo. Confira a evidência e o histórico na execução antes de confirmar a causa.';
      }
    return {
      [fatosInternos]: fatos,
      ...meta,
      texto: resumo + (explicacao ? '\n\n' + explicacao.slice(0, 6000) : ''),
      fonte:
        meta.fonte +
        (codigo.fontes.length
          ? ' · ' + codigo.fontes.join(' · ')
          : ' · código indisponível'),
      detalhes:
        'As memórias foram contadas por resultado/fórmula; podem repetir variáveis. Os valores são registros existentes, sem recalcular benefícios. ' +
        'Logs reconhecidos: ' +
        JSON.stringify(historico) +
        '\n' +
        (codigo.trechos.length
          ? 'Código consultado do pacote ' +
            codigo.estado.revisao +
            ', atualizado em ' +
            codigo.estado.atualizadoEm +
            '.'
          : 'O pacote de código não contém as fontes necessárias.') +
        (logs.length > 100 ? '\nLogs limitados aos 100 mais recentes.' : ''),
      tabela: {
        colunas: [
          'Fórmula',
          'Versão histórica',
          'Versão cadastro',
          'Estado',
          'Calculado',
          'Final local',
          'Ajuste manual',
          'Memórias gravadas',
          'Variáveis históricas sem memória',
        ],
        linhas: evidencias.map((r) => [
          r.formula,
          r.versaoHistorica,
          r.versaoCadastro,
          r.situacao,
          r.calculado,
          r.finalLocal,
          r.ajusteManual ? 'Sim' : 'Não',
          r.memoriasGravadas,
          r.variaveisHistoricasSemMemoria?.join(', ') ?? null,
        ]),
        parcial: resultados.length > 100,
      },
    };
  }
}
