import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { analisarExpressao } from 'src/helpers/calculator/formula-expression';
import { PrismaService } from 'src/prisma/prisma.service';

type DashSeverity = 'info' | 'warning' | 'danger';

type FinanceiroGranularity = 'day' | 'week' | 'month';

export type FinanceiroTimelineReport = {
  ok: true;
  range: { start: string; end: string; granularity: FinanceiroGranularity };
  filiaisOptions: Array<{ filialId: number; nome: string }>;
  totals: {
    pago: number;
    desconto: number;
    saldo: number;
    funcionarios: number;
  };
  series: Array<{
    filialId: number;
    filialNome: string;
    labels: string[];
    pago: number[];
    desconto: number[];
    saldo: number[];
  }>;
  extras: {
    topEventos: Array<{
      evento: string;
      pago: number;
      desconto: number;
      saldo: number;
    }>;
  };
};

export type DashIndicator = {
  id: string;
  title: string;
  severity: DashSeverity;
  running: boolean;
  value: number;
  subtitle?: string | null;
  details?: unknown;
};

export type DashSummary = {
  periodos: Array<{ periodoId: number; competencia: string; ativo: boolean }>;
  filiais: Array<{ filialId: number; nome: string; ativa: boolean }>;
  selectedPeriodoId: number | null;
  selectedFilialId: number | null;
  hasRunning: boolean;
  indicators: DashIndicator[];
  charts: {
    execucoesPorStatus: { labels: string[]; values: number[] };
    filiaisProcessadasVsPendentes: {
      labels: string[];
      processed: number[];
      pending: number[];
    };
    execucoesPorDia: { labels: string[]; values: number[] };
    impactoFinanceiroRm?: {
      totals: {
        totalPago: number;
        totalDescontado: number;
        saldoLiquido: number;
        funcionariosEnviados: number;
        mediaPagoPorFuncionario: number;
        mediaDescontoPorFuncionario: number;
      };
      porEvento: { labels: string[]; pago: number[]; desconto: number[] };
      porFilial?: { labels: string[]; pago: number[]; desconto: number[] };
    };
  };
};

@Injectable()
export class DashService {
  constructor(private readonly prisma: PrismaService) {}

  async getFailureReport(periodoId?: number) {
    const periodos = await this.prisma.periodo.findMany({
      orderBy: [{ ativo: 'desc' }, { data_inicio: 'desc' }],
      select: { periodo_id: true, competencia: true, ativo: true },
    });
    const periodo = periodoId ?? periodos[0]?.periodo_id ?? null;
    if (periodo !== null && !periodos.some((item) => item.periodo_id === periodo)) {
      throw new NotFoundException('Competência não encontrada.');
    }
    const executions = periodo === null ? [] : await this.prisma.execucao.findMany({
      where: { periodo_id: periodo },
      orderBy: { execucao_id: 'desc' },
      select: { execucao_id: true, filial_id: true, filial: { select: { nome: true } } },
    });
    const latest = new Map<number, (typeof executions)[number]>();
    for (const item of executions) {
      if (!latest.has(item.filial_id)) latest.set(item.filial_id, item);
    }
    const byId = new Map([...latest.values()].map((item) => [item.execucao_id, item]));
    const failures = byId.size === 0 ? [] : await this.prisma.execucao_funcionario_base.findMany({
      where: {
        execucao_id: { in: [...byId.keys()] },
        status: { in: ['ERRO_VARIAVEIS', 'ERRO_RESULTADOS', 'RESULTADOS_PARCIAL', 'ERRO_RM'] },
        execucao_queue: { none: { status: { in: ['PENDENTE', 'PROCESSANDO'] } } },
      },
      select: {
        execucao_id: true,
        funcionario_id_rm: true,
        status: true,
        execucao_queue: {
          where: { status: 'ERRO', last_error: { not: null } },
          orderBy: { queue_id: 'desc' },
          select: { tipo: true, last_error: true },
        },
        execucao_funcionario: {
          where: { status: 'ERRO' },
          select: { formula: { select: { nome: true } } },
        },
      },
    });
    const groups = new Map<string, {
      stage: string;
      cause: string;
      executions: Map<number, { filial: string; people: Set<string> }>;
    }>();
    for (const failure of failures) {
      const execution = byId.get(failure.execucao_id)!;
      let stage = 'Cálculo';
      let causes = [...new Set(failure.execucao_funcionario.map(({ formula }) => formula.nome))];
      if (failure.status === 'ERRO_VARIAVEIS') {
        stage = 'Variáveis';
        const error = failure.execucao_queue.find((job) => job.tipo === 'VARIAVEIS')?.last_error;
        const detail = (error ?? '').split(/\r?\n|\\n/u)
          .map((line) => /\[ERRO_VARIAVEIS\]\s+([\w.-]+)\s*\(([^)]*)\)/u.exec(line))
          .findLast((match) => match !== null);
        causes = [detail ? `${detail[1]} · ${detail[2]}` : 'Consulta de variáveis sem causa registrada'];
      } else if (failure.status === 'ERRO_RM') {
        stage = 'Envio ao RM';
        const error = failure.execucao_queue.find((job) => job.tipo === 'ENVIAR_RM')?.last_error ?? '';
        causes = [/timeout|ETIMEDOUT|tempo limite/iu.test(error) ? 'Tempo limite no RM'
          : /sessão|\b40[13]\b/iu.test(error) ? 'Sessão ou acesso ao RM' : 'Falha no envio ao RM'];
      } else if (!causes.length) {
        causes = ['Cálculo incompleto ou sem fórmula identificada'];
      }
      for (const cause of causes) {
        const key = JSON.stringify([stage, cause]);
        const group = groups.get(key) ?? { stage, cause, executions: new Map() };
        const affected = group.executions.get(execution.execucao_id) ?? {
          filial: execution.filial.nome,
          people: new Set<string>(),
        };
        affected.people.add(failure.funcionario_id_rm);
        group.executions.set(execution.execucao_id, affected);
        groups.set(key, group);
      }
    }
    return {
      periodos,
      periodo,
      groups: [...groups.entries()].map(([id, group]) => {
        const affected = [...group.executions.entries()].map(([execucaoId, item]) => ({
          execucaoId, filial: item.filial, count: item.people.size,
        })).sort((a, b) => b.count - a.count || a.filial.localeCompare(b.filial, 'pt-BR'));
        return { id, stage: group.stage, cause: group.cause, affected, count: affected.reduce((sum, item) => sum + item.count, 0) };
      }).sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause, 'pt-BR')),
    };
  }

  async getProcessamentoOptions(periodoId?: number) {
    const periodos = await this.prisma.periodo.findMany({
      where: { OR: [{ ativo: true }, { execucao: { some: {} } }] },
      orderBy: [{ ativo: 'desc' }, { data_inicio: 'desc' }, { periodo_id: 'desc' }],
      select: { periodo_id: true, competencia: true, ativo: true },
    });
    const periodo = periodoId ?? periodos[0]?.periodo_id ?? null;
    const execucoes = periodo === null ? [] : await this.prisma.execucao.findMany({
      where: { periodo_id: periodo },
      orderBy: [{ data_execucao: 'desc' }, { execucao_id: 'desc' }],
      select: {
        execucao_id: true,
        data_execucao: true,
        filial: { select: { filial_id: true, nome: true } },
      },
    });
    return { periodos, periodo, execucoes };
  }

  async getProcessamentoReport(id: number) {
    const formulaFields = { formula_id: true, nome: true, versao: true, tipo: true, expressao: true } as const;
    const execucao = await this.prisma.execucao.findUnique({
      where: { execucao_id: id },
      select: {
        periodo: { select: { competencia: true } },
        filial: { select: { nome: true, formula: { where: { ativa: true }, select: formulaFields } } },
        execucao_funcionario_base: {
          orderBy: [{ nome_funcionario: 'asc' }, { execucao_funcionario_base_id: 'asc' }],
          select: {
            execucao_funcionario_base_id: true,
            funcionario_id_rm: true,
            nome_funcionario: true,
            status: true,
            execucao_queue: {
              where: { tipo: 'VARIAVEIS' },
              orderBy: { queue_id: 'desc' },
              take: 1,
              select: { status: true, last_error: true },
            },
            execucao_funcionario: {
              select: { formula: { select: formulaFields }, valor_calculado: true, status: true },
            },
          },
        },
      },
    });
    if (!execucao) throw new NotFoundException('Execução não encontrada.');

    const bases = execucao.execucao_funcionario_base;
    const formulas = new Map(execucao.filial.formula.map((f) => [f.formula_id, f]));
    for (const base of bases) {
      for (const { formula } of base.execucao_funcionario) {
        formulas.set(formula.formula_id, formula);
      }
    }
    const dependencies = new Map([...formulas].map(([id, { expressao }]) =>
      [id, analisarExpressao(expressao).codigos]));
    const failures = new Map<string, string>();
    if (bases.some((b) => b.execucao_funcionario.some((r) => r.status === 'ERRO'))) {
      const logs = await this.prisma.log_execucao.findMany({
        where: {
          execucao_id: id,
          nivel: 'ERROR',
          OR: [
            { mensagem: { startsWith: 'Erro ao calcular fórmula ' } },
            { mensagem: { startsWith: 'Sem memoria_calculo para fórmula ' } },
          ],
        },
        orderBy: { log_id: 'asc' },
        select: { mensagem: true },
      });
      for (const { mensagem } of logs) {
        const calc = /^Erro ao calcular fórmula (\d+) para funcionário (.*?):\s*(.*)/u.exec(mensagem);
        const memoria = /^Sem memoria_calculo para fórmula (\d+) do funcionário (.*?)\. Rode/u.exec(mensagem);
        if (calc) failures.set(`${calc[1]}:${calc[2]}`, calc[3].replace(/^Erro ao calcular fórmula:\s*/u, '').slice(0, 140));
        if (memoria) failures.set(`${memoria[1]}:${memoria[2]}`, 'Variáveis sem memória de cálculo');
      }
    }

    const funcionarios = bases.map((base) => {
      const resultados = Object.fromEntries(base.execucao_funcionario.map((resultado) => {
        const formula = resultado.formula;
        return [formula.formula_id, resultado.status === 'ERRO'
          ? { valor: null, erro: failures.get(`${formula.formula_id}:${base.funcionario_id_rm}`) || 'Falha ao calcular a fórmula' }
          : { valor: resultado.valor_calculado?.toString() ?? null, erro: null }];
      }));

      const job = base.execucao_queue[0];
      let erroGeral: string | null = null;
      if (base.status === 'ERRO_VARIAVEIS' || job?.status === 'ERRO') {
        const failure = (job?.last_error ?? '').split(/\r?\n|\\n/u)
          .map((line) => /\[ERRO_VARIAVEIS\]\s+([\w.-]+)\s*\(.*?\):\s*(.*)/u.exec(line))
          .findLast((match) => match !== null);
        const code = failure?.[1];
        const message = !code ? 'Falha na consulta de variáveis' :
          failure?.[2].startsWith('Dado ausente ou inválido no RM')
            ? `${code}: sem valor válido no RM` : `Falha ao consultar ${code}`;
        let attributed = false;
        for (const [formulaId, codes] of dependencies) {
          const cell = resultados[formulaId];
          if (code && codes.has(code) && cell?.valor == null && !cell?.erro) {
            resultados[formulaId] = { valor: null, erro: message };
            attributed = true;
          }
        }
        if (!attributed) erroGeral = message;
      } else if (base.status === 'ERRO_RESULTADOS' && !base.execucao_funcionario.some((r) => r.status === 'ERRO')) {
        erroGeral = 'Falha no cálculo do funcionário';
      }
      return {
        id: base.execucao_funcionario_base_id,
        nome: base.nome_funcionario,
        matricula: base.funcionario_id_rm,
        erroGeral,
        resultados,
      };
    });

    return {
      filial: execucao.filial.nome,
      competencia: execucao.periodo.competencia,
      formulas: [...formulas.values()].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR') || b.versao - a.versao || a.formula_id - b.formula_id)
        .map(({ formula_id, nome, versao, tipo }) => ({ formula_id, nome, versao, tipo })),
      funcionarios,
    };
  }

  private parseEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '')
      return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  private parseCompetenciaMmYyyy(
    raw: string,
  ): { year: number; month: number } | null {
    const m = /^(\d{2})\/(\d{4})$/.exec(String(raw ?? '').trim());
    if (!m) return null;
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (!Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (month < 1 || month > 12) return null;
    return { year, month };
  }

  private formatCompetenciaMmYyyy(year: number, month: number): string {
    return `${String(month).padStart(2, '0')}/${String(year)}`;
  }

  private buildCompetenciaLabels(
    start: { year: number; month: number },
    end: { year: number; month: number },
  ): string[] {
    const labels: string[] = [];
    const d = new Date(start.year, start.month - 1, 1);
    const endD = new Date(end.year, end.month - 1, 1);
    while (d.getTime() <= endD.getTime()) {
      labels.push(
        this.formatCompetenciaMmYyyy(d.getFullYear(), d.getMonth() + 1),
      );
      d.setMonth(d.getMonth() + 1);
    }
    return labels;
  }

  async getFinanceiroTimeline(params: {
    startCompetencia: string;
    endCompetencia: string;
    filialIds: number[];
    granularity?: string;
  }): Promise<FinanceiroTimelineReport> {
    const startComp = this.parseCompetenciaMmYyyy(params.startCompetencia);
    const endComp = this.parseCompetenciaMmYyyy(params.endCompetencia);
    if (!startComp || !endComp) {
      throw new Error('Competência inválida. Use o formato MM/yyyy.');
    }

    const startMonthFirst = new Date(startComp.year, startComp.month - 1, 1);
    const endMonthFirst = new Date(endComp.year, endComp.month - 1, 1);
    if (endMonthFirst.getTime() < startMonthFirst.getTime()) {
      throw new Error('A competência final não pode ser menor que a inicial.');
    }

    const labels = this.buildCompetenciaLabels(startComp, endComp);
    if (labels.length > 36) {
      throw new Error('Intervalo máximo para relatório: 36 competências.');
    }

    // exclusivo = primeiro dia do mês seguinte à competência final
    const endMonthExclusive = new Date(endComp.year, endComp.month, 1);

    // Por competência, o bucket é sempre mensal.
    const granularity: FinanceiroGranularity = 'month';

    const filialIds = Array.isArray(params.filialIds) ? params.filialIds : [];
    const hasFilialFilter = filialIds.length > 0;

    const filiaisOptions = await this.prisma.filial.findMany({
      where: { ativa: true },
      orderBy: [{ nome: 'asc' }],
      select: { filial_id: true, nome: true },
    });

    const filialFilterSql = hasFilialFilter
      ? Prisma.sql` AND e.filial_id IN (${Prisma.join(filialIds)}) `
      : Prisma.empty;

    const totalsRows = await this.prisma.$queryRaw<
      Array<{
        pago: number | null;
        desconto: number | null;
        funcionarios: number | null;
      }>
    >(
      Prisma.sql`
      SELECT
        CAST(SUM(CASE WHEN fo.polaridade = '+' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as pago,
        CAST(SUM(CASE WHEN fo.polaridade = '-' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as desconto,
        COUNT(DISTINCT b.execucao_funcionario_base_id) as funcionarios
      FROM dbo.execucao_funcionario ef
      INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
      INNER JOIN dbo.periodo p ON p.periodo_id = e.periodo_id
      INNER JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
      INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
      WHERE p.data_inicio >= ${startMonthFirst}
        AND p.data_inicio < ${endMonthExclusive}
        ${filialFilterSql}
        AND b.status = 'ENVIADO_RM'
        AND fo.tipo = 'V'
        AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL;
    `,
    );

    const t = totalsRows?.[0] ?? { pago: 0, desconto: 0, funcionarios: 0 };
    const totals = {
      pago: Number(t.pago ?? 0),
      desconto: Number(t.desconto ?? 0),
      saldo: Number(t.pago ?? 0) - Number(t.desconto ?? 0),
      funcionarios: Number(t.funcionarios ?? 0),
    };

    const seriesRows = hasFilialFilter
      ? await this.prisma.$queryRaw<
          Array<{
            filial_id: number;
            filial_nome: string;
            bucket: string;
            pago: number | null;
            desconto: number | null;
          }>
        >(
          Prisma.sql`
          SELECT
            e.filial_id as filial_id,
            COALESCE(fi.nome, '—') as filial_nome,
            p.competencia as bucket,
            CAST(SUM(CASE WHEN fo.polaridade = '+' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as pago,
            CAST(SUM(CASE WHEN fo.polaridade = '-' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as desconto
          FROM dbo.execucao_funcionario ef
          INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
          INNER JOIN dbo.periodo p ON p.periodo_id = e.periodo_id
          INNER JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
          INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
          LEFT JOIN dbo.filial fi ON fi.filial_id = e.filial_id
          WHERE p.data_inicio >= ${startMonthFirst}
            AND p.data_inicio < ${endMonthExclusive}
            ${filialFilterSql}
            AND b.status = 'ENVIADO_RM'
            AND fo.tipo = 'V'
            AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL
          GROUP BY
            e.filial_id,
            COALESCE(fi.nome, '—'),
            p.competencia,
            DATEFROMPARTS(YEAR(p.data_inicio), MONTH(p.data_inicio), 1)
          ORDER BY
            DATEFROMPARTS(YEAR(p.data_inicio), MONTH(p.data_inicio), 1) ASC;
        `,
        )
      : await this.prisma.$queryRaw<
          Array<{
            filial_id: number;
            filial_nome: string;
            bucket: string;
            pago: number | null;
            desconto: number | null;
          }>
        >(
          Prisma.sql`
          SELECT
            0 as filial_id,
            'Todas as filiais' as filial_nome,
            p.competencia as bucket,
            CAST(SUM(CASE WHEN fo.polaridade = '+' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as pago,
            CAST(SUM(CASE WHEN fo.polaridade = '-' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as desconto
          FROM dbo.execucao_funcionario ef
          INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
          INNER JOIN dbo.periodo p ON p.periodo_id = e.periodo_id
          INNER JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
          INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
          WHERE p.data_inicio >= ${startMonthFirst}
            AND p.data_inicio < ${endMonthExclusive}
            AND b.status = 'ENVIADO_RM'
            AND fo.tipo = 'V'
            AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL
          GROUP BY
            p.competencia,
            DATEFROMPARTS(YEAR(p.data_inicio), MONTH(p.data_inicio), 1)
          ORDER BY
            DATEFROMPARTS(YEAR(p.data_inicio), MONTH(p.data_inicio), 1) ASC;
        `,
        );

    type SeriesAcc = {
      filialId: number;
      filialNome: string;
      map: Map<string, { pago: number; desconto: number }>;
    };

    const byFilial = new Map<number, SeriesAcc>();
    for (const r of seriesRows ?? []) {
      const filialId = Number(r.filial_id ?? 0);
      const filialNome = String(r.filial_nome ?? '').trim() || '—';
      const bucket = String(r.bucket ?? '').trim();
      if (!bucket) continue;
      const acc =
        byFilial.get(filialId) ??
        ({
          filialId,
          filialNome,
          map: new Map<string, { pago: number; desconto: number }>(),
        } as SeriesAcc);
      acc.map.set(bucket, {
        pago: Number(r.pago ?? 0),
        desconto: Number(r.desconto ?? 0),
      });
      byFilial.set(filialId, acc);
    }

    if (byFilial.size === 0) {
      byFilial.set(0, {
        filialId: 0,
        filialNome: hasFilialFilter
          ? 'Filiais selecionadas'
          : 'Todas as filiais',
        map: new Map(),
      });
    }

    const series = Array.from(byFilial.values()).map((s) => {
      const pagoArr: number[] = [];
      const descontoArr: number[] = [];
      const saldoArr: number[] = [];
      for (const lab of labels) {
        const v = s.map.get(lab) ?? { pago: 0, desconto: 0 };
        pagoArr.push(v.pago);
        descontoArr.push(v.desconto);
        saldoArr.push(v.pago - v.desconto);
      }
      return {
        filialId: s.filialId,
        filialNome: s.filialNome,
        labels,
        pago: pagoArr,
        desconto: descontoArr,
        saldo: saldoArr,
      };
    });

    const topEventosRows = await this.prisma.$queryRaw<
      Array<{ evento: string; pago: number | null; desconto: number | null }>
    >(
      Prisma.sql`
      SELECT TOP 12
        COALESCE(NULLIF(LTRIM(RTRIM(fo.codEvento)), ''), fo.nome) as evento,
        CAST(SUM(CASE WHEN fo.polaridade = '+' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as pago,
        CAST(SUM(CASE WHEN fo.polaridade = '-' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as desconto
      FROM dbo.execucao_funcionario ef
      INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
      INNER JOIN dbo.periodo p ON p.periodo_id = e.periodo_id
      INNER JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
      INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
      WHERE p.data_inicio >= ${startMonthFirst}
        AND p.data_inicio < ${endMonthExclusive}
        ${filialFilterSql}
        AND b.status = 'ENVIADO_RM'
        AND fo.tipo = 'V'
        AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL
      GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(fo.codEvento)), ''), fo.nome)
      ORDER BY (CAST(SUM(ABS(COALESCE(ef.valor_final, ef.valor_calculado))) AS decimal(18,2))) DESC;
    `,
    );

    return {
      ok: true,
      range: {
        start: params.startCompetencia,
        end: params.endCompetencia,
        granularity,
      },
      filiaisOptions: filiaisOptions.map((f) => ({
        filialId: f.filial_id,
        nome: f.nome,
      })),
      totals,
      series,
      extras: {
        topEventos: (topEventosRows ?? []).map((r) => {
          const pago = Number(r.pago ?? 0);
          const desconto = Number(r.desconto ?? 0);
          return {
            evento: String(r.evento ?? '').trim() || '—',
            pago,
            desconto,
            saldo: pago - desconto,
          };
        }),
      },
    };
  }

  private labelExecucaoStatus(status: string): string {
    switch (String(status ?? '').toUpperCase()) {
      case 'EM_PROCESSAMENTO':
        return 'Em processamento';
      case 'AGUARDANDO':
        return 'Aguardando';
      case 'FINALIZADA':
        return 'Finalizada';
      case 'CANCELADA':
        return 'Cancelada';
      case 'EM_VALIDACAO':
        return 'Em validação';
      default:
        return String(status ?? '').trim() || '—';
    }
  }

  private labelQueueTipo(tipo: string | null | undefined): string {
    switch (String(tipo ?? '').toUpperCase()) {
      case 'VARIAVEIS':
        return 'Variáveis';
      case 'VALORES':
        return 'Valores';
      case 'ENVIAR_RM':
        return 'Envio ao RM';
      default:
        return String(tipo ?? '').trim() || '—';
    }
  }

  private labelFuncBaseStatus(status: string | null | undefined): string {
    switch (String(status ?? '').toUpperCase()) {
      case 'ERRO_VARIAVEIS':
        return 'Erro nas variáveis';
      case 'ERRO_RESULTADOS':
        return 'Erro nos resultados';
      case 'ERRO_RM':
        return 'Erro ao enviar ao RM';
      default:
        return String(status ?? '').trim() || '—';
    }
  }

  async getSummary(
    periodoId?: number,
    filialId?: number,
  ): Promise<DashSummary> {
    const minR066 = this.parseEnvNumber('R066_MIN_VAL', 50);
    const maxR066 = this.parseEnvNumber('R066_MAX_VAL', 400);

    const periodos = await this.prisma.periodo.findMany({
      orderBy: [{ ativo: 'desc' }, { data_inicio: 'desc' }],
      select: { periodo_id: true, competencia: true, ativo: true },
    });

    const filiais = await this.prisma.filial.findMany({
      where: { ativa: true },
      orderBy: [{ nome: 'asc' }],
      select: { filial_id: true, nome: true, ativa: true },
    });

    let selectedPeriodoId: number | null = null;
    const pid = Number(periodoId);
    if (Number.isFinite(pid) && pid > 0) {
      selectedPeriodoId = pid;
    } else {
      selectedPeriodoId =
        periodos.find((p) => p.ativo)?.periodo_id ??
        periodos[0]?.periodo_id ??
        null;
    }

    let selectedFilialId: number | null = null;
    const fid = Number(filialId);
    if (Number.isFinite(fid) && fid > 0) {
      selectedFilialId = fid;
    }

    // hasRunning (agregado) — usado para polling adaptativo
    const runningRows = await this.prisma.$queryRaw<
      Array<{
        execucoes_em_processamento: number;
        execucao_queue_running: number;
        create_queue_running: number;
        geo_queue_running: number;
      }>
    >(
      Prisma.sql`
      SELECT
        (SELECT COUNT(1) FROM dbo.execucao WHERE status = 'EM_PROCESSAMENTO') as execucoes_em_processamento,
        (SELECT COUNT(1) FROM dbo.execucao_queue WHERE status IN ('PENDENTE','PROCESSANDO')) as execucao_queue_running,
        (SELECT COUNT(1) FROM dbo.execucao_create_queue WHERE status IN ('PENDENTE','PROCESSANDO')) as create_queue_running,
        (SELECT COUNT(1) FROM dbo.geo_queue WHERE status IN ('PENDENTE','PROCESSANDO')) as geo_queue_running;
    `,
    );

    const running = runningRows?.[0] ?? {
      execucoes_em_processamento: 0,
      execucao_queue_running: 0,
      create_queue_running: 0,
      geo_queue_running: 0,
    };
    const hasRunning =
      Number(running.execucoes_em_processamento ?? 0) +
        Number(running.execucao_queue_running ?? 0) +
        Number(running.create_queue_running ?? 0) +
        Number(running.geo_queue_running ?? 0) >
      0;

    // Se não houver período selecionado, devolve “vazio” mas consistente
    if (!selectedPeriodoId) {
      return {
        periodos: periodos.map((p) => ({
          periodoId: p.periodo_id,
          competencia: p.competencia,
          ativo: Boolean(p.ativo),
        })),
        filiais: filiais.map((f) => ({
          filialId: f.filial_id,
          nome: f.nome,
          ativa: Boolean(f.ativa),
        })),
        selectedPeriodoId: null,
        selectedFilialId,
        hasRunning,
        indicators: [],
        charts: {
          execucoesPorStatus: { labels: [], values: [] },
          filiaisProcessadasVsPendentes: {
            labels: [],
            processed: [],
            pending: [],
          },
          execucoesPorDia: { labels: [], values: [] },
        },
      };
    }

    const filialFilterSql = selectedFilialId
      ? Prisma.sql` AND e.filial_id = ${selectedFilialId} `
      : Prisma.empty;

    // Filiais pendentes (por período): “processou” = existe execucao FINALIZADA
    const filiaisPendentes = await this.prisma.$queryRaw<
      Array<{ filial_id: number; nome: string }>
    >(
      Prisma.sql`
      SELECT f.filial_id, f.nome
      FROM dbo.filial f
      WHERE f.ativa = 1
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.execucao e
          WHERE e.filial_id = f.filial_id
            AND e.periodo_id = ${selectedPeriodoId}
            AND e.status = 'FINALIZADA'
        )
      ORDER BY f.nome ASC;
    `,
    );

    const filiaisAtivasCount = await this.prisma.filial.count({
      where: { ativa: true },
    });
    const filiaisProcessadasCount = Math.max(
      0,
      filiaisAtivasCount - (filiaisPendentes?.length ?? 0),
    );

    // Erros não resolvidos (status em execucao_funcionario_base)
    const errosBaseAgg = await this.prisma.$queryRaw<
      Array<{ status: string; cnt: number }>
    >(
      Prisma.sql`
      SELECT b.status, COUNT(1) as cnt
      FROM dbo.execucao_funcionario_base b
      INNER JOIN dbo.execucao e ON e.execucao_id = b.execucao_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND b.status IN ('ERRO_VARIAVEIS','ERRO_RESULTADOS','ERRO_RM')
      GROUP BY b.status;
    `,
    );
    const errosBaseTotal = (errosBaseAgg ?? []).reduce(
      (acc, r) => acc + Number(r.cnt ?? 0),
      0,
    );

    const errosBaseSample = await this.prisma.$queryRaw<
      Array<{
        execucao_id: number;
        filial_id: number;
        filial_nome: string | null;
        funcionario_id_rm: string;
        nome_funcionario: string | null;
        status: string | null;
        updated_at: Date | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP 1000
        b.execucao_id,
        e.filial_id,
        f.nome as filial_nome,
        b.funcionario_id_rm,
        b.nome_funcionario,
        b.status,
        b.data_registro as updated_at
      FROM dbo.execucao_funcionario_base b
      INNER JOIN dbo.execucao e ON e.execucao_id = b.execucao_id
      LEFT JOIN dbo.filial f ON f.filial_id = e.filial_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND b.status IN ('ERRO_VARIAVEIS','ERRO_RESULTADOS','ERRO_RM')
      ORDER BY b.data_registro DESC;
    `,
    );

    // Fila de execução com erro (apenas execuções do período selecionado)
    const execucaoQueueErrorsAgg = await this.prisma.$queryRaw<
      Array<{ execucao_queue_erros: number }>
    >(
      Prisma.sql`
      SELECT COUNT(1) as execucao_queue_erros
      FROM dbo.execucao_queue q
      INNER JOIN dbo.execucao e ON e.execucao_id = q.execucao_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND q.last_error IS NOT NULL;
    `,
    );
    const execucaoQueueErrorsTotal = Number(
      execucaoQueueErrorsAgg?.[0]?.execucao_queue_erros ?? 0,
    );

    const execucaoQueueErrorsSample = await this.prisma.$queryRaw<
      Array<{
        execucao_id: number;
        filial_id: number;
        filial_nome: string | null;
        tipo: string | null;
        status: string | null;
        updated_at: Date | null;
        last_error: string | null;
        funcionario_id_rm: string | null;
        nome_funcionario: string | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP 1000
        q.execucao_id,
        e.filial_id,
        fi.nome as filial_nome,
        q.tipo,
        q.status,
        q.updated_at,
        q.last_error,
        fb.funcionario_id_rm,
        fb.nome_funcionario
      FROM dbo.execucao_queue q
      INNER JOIN dbo.execucao e ON e.execucao_id = q.execucao_id
      LEFT JOIN dbo.filial fi ON fi.filial_id = e.filial_id
      LEFT JOIN dbo.execucao_funcionario_base fb ON fb.execucao_funcionario_base_id = q.execucao_funcionario_base_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND q.last_error IS NOT NULL
      ORDER BY q.updated_at DESC;
    `,
    );

    // KM acima do limite (por período): b.km > filial.km_max
    const kmMaxAgg = await this.prisma.$queryRaw<Array<{ cnt: number }>>(
      Prisma.sql`
      SELECT COUNT(1) as cnt
      FROM dbo.execucao_funcionario_base b
      INNER JOIN dbo.execucao e ON e.execucao_id = b.execucao_id
      INNER JOIN dbo.filial f ON f.filial_id = e.filial_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND b.km IS NOT NULL
        AND f.km_max IS NOT NULL
        AND b.km > f.km_max;
    `,
    );
    const kmMaxTotal = Number(kmMaxAgg?.[0]?.cnt ?? 0);

    const kmMaxSample = await this.prisma.$queryRaw<
      Array<{
        execucao_id: number;
        filial_id: number;
        filial_nome: string | null;
        funcionario_id_rm: string;
        nome_funcionario: string | null;
        km: number | null;
        km_max: number | null;
        updated_at: Date | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP 1000
        b.execucao_id,
        e.filial_id,
        f.nome as filial_nome,
        b.funcionario_id_rm,
        b.nome_funcionario,
        CAST(b.km AS decimal(18,2)) as km,
        CAST(f.km_max AS decimal(18,2)) as km_max,
        b.data_registro as updated_at
      FROM dbo.execucao_funcionario_base b
      INNER JOIN dbo.execucao e ON e.execucao_id = b.execucao_id
      INNER JOIN dbo.filial f ON f.filial_id = e.filial_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND b.km IS NOT NULL
        AND f.km_max IS NOT NULL
        AND b.km > f.km_max
      ORDER BY (b.km - f.km_max) DESC, b.km DESC;
    `,
    );

    // GEO (não depende de período): erros nos últimos 7 dias
    const geoDays = 7;
    const geoErrorsAgg = await this.prisma.$queryRaw<
      Array<{ geo_erros: number }>
    >(
      Prisma.sql`
      SELECT COUNT(1) as geo_erros
      FROM dbo.geo_queue g
      WHERE g.last_error IS NOT NULL
        AND g.updated_at >= DATEADD(DAY, -${geoDays}, SYSDATETIME());
    `,
    );
    const geoErrorsTotal = Number(geoErrorsAgg?.[0]?.geo_erros ?? 0);

    const geoErrorsSample = await this.prisma.$queryRaw<
      Array<{
        geo_queue_id: number;
        filial_id: number;
        filial_nome: string | null;
        chapa: string;
        status: string;
        updated_at: Date;
        last_error: string | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP 20
        g.geo_queue_id,
        g.filial_id,
        f.nome as filial_nome,
        g.chapa,
        g.status,
        g.updated_at,
        g.last_error
      FROM dbo.geo_queue g
      LEFT JOIN dbo.filial f ON f.filial_id = g.filial_id
      WHERE g.last_error IS NOT NULL
        AND g.updated_at >= DATEADD(DAY, -${geoDays}, SYSDATETIME())
      ORDER BY g.updated_at DESC;
    `,
    );

    // Alertas R066 (tipo V) fora do range
    const r066Rows = await this.prisma.$queryRaw<
      Array<{
        execucao_id: number;
        filial_id: number;
        filial_nome: string | null;
        funcionario_id_rm: string;
        nome_funcionario: string | null;
        valor: number | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP 50
        e.execucao_id,
        e.filial_id,
        fi.nome as filial_nome,
        ef.funcionario_id_rm,
        fb.nome_funcionario,
        CAST(COALESCE(ef.valor_final, ef.valor_calculado) AS decimal(18,2)) as valor
      FROM dbo.execucao_funcionario ef
      INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
      INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
      LEFT JOIN dbo.execucao_funcionario_base fb ON fb.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
      LEFT JOIN dbo.filial fi ON fi.filial_id = e.filial_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND fo.codEvento = 'R066'
        AND fo.tipo = 'V'
        AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL
        AND (
          COALESCE(ef.valor_final, ef.valor_calculado) < ${minR066}
          OR COALESCE(ef.valor_final, ef.valor_calculado) > ${maxR066}
        )
      ORDER BY e.execucao_id DESC;
    `,
    );

    const r066Count = r066Rows?.length ?? 0;

    // Charts
    // Execuções por status (no período)
    const execPorStatus = await this.prisma.$queryRaw<
      Array<{ status: string; cnt: number }>
    >(
      Prisma.sql`
      SELECT status, COUNT(1) as cnt
      FROM dbo.execucao
      WHERE periodo_id = ${selectedPeriodoId}
        ${selectedFilialId ? Prisma.sql` AND filial_id = ${selectedFilialId} ` : Prisma.empty}
      GROUP BY status
      ORDER BY COUNT(1) DESC;
    `,
    );

    // Execuções por dia (dentro do intervalo do período)
    const periodoRange = await this.prisma.periodo.findUnique({
      where: { periodo_id: selectedPeriodoId },
      select: { data_inicio: true, data_fim: true },
    });

    const rangeStart = periodoRange?.data_inicio ?? new Date();
    const rangeEnd = periodoRange?.data_fim ?? new Date();

    const execPorDia = await this.prisma.$queryRaw<
      Array<{ dia: string; cnt: number }>
    >(
      Prisma.sql`
      SELECT
        CONVERT(varchar(10), e.data_execucao, 120) as dia,
        COUNT(1) as cnt
      FROM dbo.execucao e
      WHERE e.data_execucao >= ${rangeStart}
        AND e.data_execucao < DATEADD(DAY, 1, ${rangeEnd})
        AND e.periodo_id = ${selectedPeriodoId}
        ${selectedFilialId ? Prisma.sql` AND e.filial_id = ${selectedFilialId} ` : Prisma.empty}
      GROUP BY CONVERT(varchar(10), e.data_execucao, 120)
      ORDER BY dia ASC;
    `,
    );

    // Impacto financeiro (somente ENVIADO_RM, fórmulas tipo V)
    const impactoTotalsRows = await this.prisma.$queryRaw<
      Array<{
        total_pago: number | null;
        total_desconto: number | null;
        funcionarios_enviados: number | null;
      }>
    >(
      Prisma.sql`
      SELECT
        CAST(SUM(CASE WHEN fo.polaridade = '+' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as total_pago,
        CAST(SUM(CASE WHEN fo.polaridade = '-' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as total_desconto,
        COUNT(DISTINCT b.execucao_funcionario_base_id) as funcionarios_enviados
      FROM dbo.execucao_funcionario ef
      INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
      INNER JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
      INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND b.status = 'ENVIADO_RM'
        AND fo.tipo = 'V'
        AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL;
    `,
    );

    const tot = impactoTotalsRows?.[0] ?? {
      total_pago: 0,
      total_desconto: 0,
      funcionarios_enviados: 0,
    };
    const totalPago = Number(tot.total_pago ?? 0);
    const totalDescontado = Number(tot.total_desconto ?? 0);
    const funcionariosEnviados = Number(tot.funcionarios_enviados ?? 0);
    const saldoLiquido = totalPago - totalDescontado;
    const mediaPagoPorFuncionario =
      funcionariosEnviados > 0 ? totalPago / funcionariosEnviados : 0;
    const mediaDescontoPorFuncionario =
      funcionariosEnviados > 0 ? totalDescontado / funcionariosEnviados : 0;

    const impactoPorEventoRows = await this.prisma.$queryRaw<
      Array<{
        evento: string;
        pago: number | null;
        desconto: number | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP 12
        COALESCE(NULLIF(LTRIM(RTRIM(fo.codEvento)), ''), fo.nome) as evento,
        CAST(SUM(CASE WHEN fo.polaridade = '+' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as pago,
        CAST(SUM(CASE WHEN fo.polaridade = '-' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as desconto
      FROM dbo.execucao_funcionario ef
      INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
      INNER JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
      INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND b.status = 'ENVIADO_RM'
        AND fo.tipo = 'V'
        AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL
      GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(fo.codEvento)), ''), fo.nome)
      ORDER BY (CAST(SUM(ABS(COALESCE(ef.valor_final, ef.valor_calculado))) AS decimal(18,2))) DESC;
    `,
    );

    const impactoPorFilialRows = selectedFilialId
      ? []
      : await this.prisma.$queryRaw<
          Array<{
            filial_nome: string;
            pago: number | null;
            desconto: number | null;
          }>
        >(
          Prisma.sql`
          SELECT TOP 12
            fi.nome as filial_nome,
            CAST(SUM(CASE WHEN fo.polaridade = '+' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as pago,
            CAST(SUM(CASE WHEN fo.polaridade = '-' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as desconto
          FROM dbo.execucao_funcionario ef
          INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
          INNER JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
          INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
          LEFT JOIN dbo.filial fi ON fi.filial_id = e.filial_id
          WHERE e.periodo_id = ${selectedPeriodoId}
            AND b.status = 'ENVIADO_RM'
            AND fo.tipo = 'V'
            AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL
          GROUP BY fi.nome
          ORDER BY (CAST(SUM(ABS(COALESCE(ef.valor_final, ef.valor_calculado))) AS decimal(18,2))) DESC;
        `,
        );

    const impactoExecucoesSample = await this.prisma.$queryRaw<
      Array<{
        execucao_id: number;
        filial_id: number;
        filial_nome: string | null;
        pago: number | null;
        desconto: number | null;
        funcionarios: number | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP 20
        e.execucao_id,
        e.filial_id,
        fi.nome as filial_nome,
        CAST(SUM(CASE WHEN fo.polaridade = '+' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as pago,
        CAST(SUM(CASE WHEN fo.polaridade = '-' THEN COALESCE(ef.valor_final, ef.valor_calculado) ELSE 0 END) AS decimal(18,2)) as desconto,
        COUNT(DISTINCT b.execucao_funcionario_base_id) as funcionarios
      FROM dbo.execucao_funcionario ef
      INNER JOIN dbo.execucao e ON e.execucao_id = ef.execucao_id
      INNER JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id = ef.execucao_funcionario_base_id
      INNER JOIN dbo.formula fo ON fo.formula_id = ef.formula_id
      LEFT JOIN dbo.filial fi ON fi.filial_id = e.filial_id
      WHERE e.periodo_id = ${selectedPeriodoId}
        ${filialFilterSql}
        AND b.status = 'ENVIADO_RM'
        AND fo.tipo = 'V'
        AND COALESCE(ef.valor_final, ef.valor_calculado) IS NOT NULL
      GROUP BY e.execucao_id, e.filial_id, fi.nome
      ORDER BY (CAST(SUM(ABS(COALESCE(ef.valor_final, ef.valor_calculado))) AS decimal(18,2))) DESC;
    `,
    );

    const indicators: DashIndicator[] = [
      {
        id: 'filiais_pendentes_periodo',
        title: 'Filiais pendentes no período',
        severity: (filiaisPendentes?.length ?? 0) > 0 ? 'warning' : 'info',
        running: false,
        value: filiaisPendentes?.length ?? 0,
        subtitle: `Processadas: ${filiaisProcessadasCount} / Total ativas: ${filiaisAtivasCount}`,
        details: (filiaisPendentes ?? []).map((f) => ({
          filialId: f.filial_id,
          nome: f.nome,
        })),
      },
      {
        id: 'erros_nao_resolvidos',
        title: 'Erros do período',
        severity:
          errosBaseTotal > 0 || execucaoQueueErrorsTotal > 0
            ? 'danger'
            : 'info',
        running: false,
        value: errosBaseTotal + execucaoQueueErrorsTotal,
        subtitle: `Funcionários com erro: ${errosBaseTotal} • Fila de execução: ${execucaoQueueErrorsTotal}`,
        details: {
          basesByStatus: (errosBaseAgg ?? []).map((r) => ({
            status: this.labelFuncBaseStatus(r.status),
            cnt: Number(r.cnt ?? 0),
          })),
          basesSample: (errosBaseSample ?? []).map((r) => ({
            execucaoId: r.execucao_id,
            filialId: r.filial_id,
            filialNome: r.filial_nome ?? null,
            chapa: r.funcionario_id_rm,
            nome: r.nome_funcionario ?? null,
            status: this.labelFuncBaseStatus(r.status),
            updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
          })),
          execucaoQueueSample: (execucaoQueueErrorsSample ?? []).map((q) => ({
            execucaoId: q.execucao_id,
            filialId: q.filial_id,
            filialNome: q.filial_nome ?? null,
            tipo: this.labelQueueTipo(q.tipo),
            status: this.labelExecucaoStatus(q.status ?? ''),
            updatedAt: q.updated_at ? q.updated_at.toISOString() : null,
            chapa: q.funcionario_id_rm ?? null,
            nome: q.nome_funcionario ?? null,
            message: String(q.last_error ?? '').trim(),
          })),
        },
      },
      {
        id: 'km_max_acima_limite',
        title: 'KM acima do limite',
        severity: kmMaxTotal > 0 ? 'warning' : 'info',
        running: false,
        value: kmMaxTotal,
        subtitle: selectedFilialId
          ? 'Funcionários acima do km_max (filial selecionada)'
          : 'Funcionários acima do km_max (todas as filiais)',
        details: (kmMaxSample ?? []).map((r) => ({
          execucaoId: r.execucao_id,
          filialId: r.filial_id,
          filialNome: r.filial_nome ?? null,
          chapa: r.funcionario_id_rm,
          nome: r.nome_funcionario ?? null,
          km: r.km,
          kmMax: r.km_max,
          updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
        })),
      },
      {
        id: 'alerta_r066_fora_faixa',
        title: 'Evento R066 fora da faixa',
        severity: r066Count > 0 ? 'danger' : 'info',
        running: false,
        value: r066Count,
        subtitle: `Faixa: ${minR066} – ${maxR066}`,
        details: (r066Rows ?? []).map((r) => ({
          execucaoId: r.execucao_id,
          filialId: r.filial_id,
          filialNome: r.filial_nome ?? null,
          chapa: r.funcionario_id_rm,
          nome: r.nome_funcionario ?? null,
          valor: r.valor,
          min: minR066,
          max: maxR066,
        })),
      },
      {
        id: 'geo_erros_ultimos_dias',
        title: 'GEO — erros recentes (7 dias)',
        severity: geoErrorsTotal > 0 ? 'warning' : 'info',
        running: false,
        value: geoErrorsTotal,
        subtitle: 'Lista dos registros com erro nos últimos 7 dias',
        details: {
          days: geoDays,
          sample: (geoErrorsSample ?? []).map((g) => ({
            geoQueueId: g.geo_queue_id,
            filialId: g.filial_id,
            filialNome: g.filial_nome ?? null,
            chapa: g.chapa,
            status: String(g.status ?? '').trim(),
            updatedAt: g.updated_at ? g.updated_at.toISOString() : null,
            message: String(g.last_error ?? '').trim(),
          })),
        },
      },
      {
        id: 'impacto_financeiro_rm',
        title: 'Impacto financeiro (RM enviado)',
        severity: 'info',
        running: false,
        value: funcionariosEnviados,
        subtitle: selectedFilialId
          ? 'Somente funcionários enviados ao RM (filial selecionada)'
          : 'Somente funcionários enviados ao RM (todas as filiais)',
        details: {
          totals: {
            totalPago,
            totalDescontado,
            saldoLiquido,
            funcionariosEnviados,
            mediaPagoPorFuncionario,
            mediaDescontoPorFuncionario,
          },
          porEvento: (impactoPorEventoRows ?? []).map((r) => ({
            label: String(r.evento ?? '').trim() || '—',
            pago: Number(r.pago ?? 0),
            desconto: Number(r.desconto ?? 0),
          })),
          porFilial: selectedFilialId
            ? undefined
            : (impactoPorFilialRows ?? []).map((r) => ({
                label: String(r.filial_nome ?? '').trim() || '—',
                pago: Number(r.pago ?? 0),
                desconto: Number(r.desconto ?? 0),
              })),
          execucoes: (impactoExecucoesSample ?? []).map((r) => ({
            execucaoId: r.execucao_id,
            filialId: r.filial_id,
            filialNome: r.filial_nome ?? null,
            pago: Number(r.pago ?? 0),
            desconto: Number(r.desconto ?? 0),
            saldo: Number(r.pago ?? 0) - Number(r.desconto ?? 0),
            funcionarios: Number(r.funcionarios ?? 0),
          })),
        },
      },
      {
        id: 'processamentos_rodando',
        title: 'Atividades em andamento',
        severity: hasRunning ? 'warning' : 'info',
        running: hasRunning,
        value:
          Number(running.execucoes_em_processamento ?? 0) +
          Number(running.execucao_queue_running ?? 0) +
          Number(running.create_queue_running ?? 0) +
          Number(running.geo_queue_running ?? 0),
        subtitle: `Execuções em andamento: ${Number(
          running.execucoes_em_processamento ?? 0,
        )} • Fila de execução: ${Number(
          running.execucao_queue_running ?? 0,
        )} • Fila de criação: ${Number(
          running.create_queue_running ?? 0,
        )} • GEO: ${Number(running.geo_queue_running ?? 0)}`,
        details: running,
      },
    ];

    return {
      periodos: periodos.map((p) => ({
        periodoId: p.periodo_id,
        competencia: p.competencia,
        ativo: Boolean(p.ativo),
      })),
      filiais: filiais.map((f) => ({
        filialId: f.filial_id,
        nome: f.nome,
        ativa: Boolean(f.ativa),
      })),
      selectedPeriodoId,
      selectedFilialId,
      hasRunning,
      indicators,
      charts: {
        execucoesPorStatus: {
          labels: (execPorStatus ?? []).map((r) =>
            this.labelExecucaoStatus(r.status),
          ),
          values: (execPorStatus ?? []).map((r) => Number(r.cnt ?? 0)),
        },
        filiaisProcessadasVsPendentes: {
          labels: ['Total'],
          processed: [filiaisProcessadasCount],
          pending: [filiaisPendentes?.length ?? 0],
        },
        execucoesPorDia: {
          labels: (execPorDia ?? []).map((r) => r.dia),
          values: (execPorDia ?? []).map((r) => Number(r.cnt ?? 0)),
        },
        impactoFinanceiroRm: {
          totals: {
            totalPago,
            totalDescontado,
            saldoLiquido,
            funcionariosEnviados,
            mediaPagoPorFuncionario,
            mediaDescontoPorFuncionario,
          },
          porEvento: {
            labels: (impactoPorEventoRows ?? []).map((r) =>
              String(r.evento ?? '').trim(),
            ),
            pago: (impactoPorEventoRows ?? []).map((r) => Number(r.pago ?? 0)),
            desconto: (impactoPorEventoRows ?? []).map((r) =>
              Number(r.desconto ?? 0),
            ),
          },
          porFilial: selectedFilialId
            ? undefined
            : {
                labels: (impactoPorFilialRows ?? []).map((r) =>
                  String(r.filial_nome ?? '').trim(),
                ),
                pago: (impactoPorFilialRows ?? []).map((r) =>
                  Number(r.pago ?? 0),
                ),
                desconto: (impactoPorFilialRows ?? []).map((r) =>
                  Number(r.desconto ?? 0),
                ),
              },
        },
      },
    };
  }
}
