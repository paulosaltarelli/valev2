import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { analisarExpressao } from '../helpers/calculator/formula-expression';
import { lerSnapshotFormula } from '../dash/operational-reports';
import { classificarLog, situacaoValor } from './assistente-consultas';
import { AssistenteConhecimento } from './assistente-conhecimento';
import { consultarModelo } from './assistente-intencao';
import { promptSugerido, regrasFixas } from './assistente-prompt';
import type { ResultadoAssistente } from './assistente-tipos';

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
  if (calculo?.[2] === matricula)
    return {
      tipo: 'Log histórico',
      codigo: calculo[1],
      evidencia:
        'A calculadora rejeitou o cálculo desta fórmula. O detalhe técnico não foi exposto automaticamente.',
    };
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
      filas: filas.map((f) => ({ status: f.status, quantidade: f._count })),
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
    let explicacao: string;
    try {
      explicacao = await consultarModelo(
        provedor,
        credencial,
        regrasFixas +
          '\n' +
          (contexto || promptSugerido) +
          '\nExplique este caso com as seções Evidências, Limitação ou hipótese e Próximo passo, em até 1800 caracteres. Use exclusivamente os fatos estruturados e o código fornecido. Não transcreva código nem sintaxe de fórmulas. Cite caminhos e linhas do código quando sustentarem a regra. Logs são históricos: não confirme causa atual apenas com eles. Memórias são por fórmula e podem repetir uma variável. Variáveis sem memória não provam falha na consulta ao RM. Cadastro atual não comprova vigência histórica. Não prometa reprocessamento nem gere arquivos ou links. Não afirme ausência de valores se houver resultados calculados. Identificação pessoal foi removida por minimização de dados.',
        JSON.stringify({ fatos, codigo: codigo.trechos }),
        1800,
      );
    } catch {
      explicacao =
        'A explicação pelo provedor está indisponível. Os registros consultados permanecem abaixo. Confira a evidência e o histórico na execução antes de confirmar a causa.';
    }
    return {
      ...meta,
      texto: resumo + '\n\n' + explicacao.slice(0, 6000),
      fonte:
        base.fonte +
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
