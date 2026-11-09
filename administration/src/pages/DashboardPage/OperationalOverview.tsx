import { useCallback } from "react";
import { Link } from "react-router";
import {
  QueryNotice,
  StageCount,
  useOperationQuery,
} from "../../components/Processamento/OperationCommon";
import { OperacaoApi } from "../../utils/api/operacaoApi";
import { ExecucaoApi } from "../../utils/api/execucaoApi";

export function OperationalOverview({ activePeriodIds, branches }: {
  activePeriodIds: number[];
  branches: { filialId: number; nome: string; ativa: boolean }[];
}) {
  const periodKey = activePeriodIds.join(",");
  const fetcher = useCallback(async () => {
    if (!periodKey) return { summaries: [], creation: [] };
    const [summaries, creation] = await Promise.all([
      Promise.all(periodKey.split(",").map((id) => OperacaoApi.summary(id))),
      ExecucaoApi.getCreateQueueItems(),
    ]);
    return { summaries, creation };
  }, [periodKey]);
  const query = useOperationQuery(fetcher);
  const rows = (query.data?.summaries ?? []).flatMap((summary) =>
    summary.periodo?.ativo ? summary.rows.map((row) => ({
      ...row,
      competencia: summary.periodo!.competencia,
    })) : [],
  );
  const attention = rows.filter((row) => row.latest && row.errors > 0).sort((a, b) => b.errors - a.errors || a.filial.localeCompare(b.filial));
  const running = rows.filter((row) => row.processing > 0 || row.pending > 0);
  const ready = rows.filter((row) => row.latest && row.situacao === "envio");
  const occupied = new Set(rows.map((row) => `${row.periodoId}:${row.filialId}`));
  const activePeriods = new Map((query.data?.summaries ?? []).flatMap(({ periodo }) =>
    periodo?.ativo ? [[periodo.periodo_id, periodo.competencia] as const] : []));
  const creating = (query.data?.creation ?? []).filter((item) => activePeriods.has(item.periodoId) &&
    !occupied.has(`${item.periodoId}:${item.filialId}`));
  const queued = new Set(creating.map((item) => `${item.periodoId}:${item.filialId}`));
  const missing = (query.data?.summaries ?? []).flatMap(({ periodo }) =>
    periodo?.ativo ? branches.filter((branch) => {
      const key = `${periodo.periodo_id}:${branch.filialId}`;
      return branch.ativa && !occupied.has(key) && !queued.has(key);
    }).map((branch) => ({ ...branch, periodo })) : [],
  );
  const totals = rows.filter((row) => row.latest).reduce((sum, row) => ({
    variables: sum.variables + row.progresso.variaveisCalculadas,
    expectedVariables: sum.expectedVariables + row.progresso.variaveisPrevistas,
    formulas: sum.formulas + row.progresso.formulasCalculadas,
    expectedFormulas: sum.expectedFormulas + row.progresso.formulasPrevistas,
    rm: sum.rm + row.rm,
    employees: sum.employees + row.total,
  }), { variables: 0, expectedVariables: 0, formulas: 0, expectedFormulas: 0, rm: 0, employees: 0 });

  return (
    <section className="card ve-operation-overview mb-3" aria-labelledby="ve-operation-heading">
      <div className="card-body">
        <div className="ve-operation-head">
          <div>
            <h2 id="ve-operation-heading">Situação das competências ativas</h2>
            <p className="op-muted mb-0">
              {activePeriodIds.length === 1 ? "1 competência ativa" : `${activePeriodIds.length} competências ativas`}
              {activePeriods.size > 0 && ` · ${[...activePeriods.values()].join(", ")}`}
            </p>
          </div>
          <Link className="btn btn-primary" to="/processamento">
            Abrir Processamentos
          </Link>
        </div>
        <QueryNotice {...query} />
        {!activePeriodIds.length && <p className="mb-0 mt-2">Nenhuma competência ativa cadastrada.</p>}
        {query.data && activePeriodIds.length > 0 && (
          <>
            <div className="op-summary mt-3" aria-label="Progresso nas competências ativas">
              <StageCount label="Variáveis calculadas" value={totals.variables} total={totals.expectedVariables} unit="variáveis" />
              <StageCount label="Fórmulas calculadas" value={totals.formulas} total={totals.expectedFormulas} unit="fórmulas" />
              <StageCount label="Enviados ao RM" value={totals.rm} total={totals.employees} />
            </div>
            <div className="ve-home-alerts mt-3" aria-label="Alertas e próximas ações">
              {attention.length > 0 && <div className="ve-home-alert ve-home-alert-danger">
                <div><strong>Falhas para resolver</strong><p>{attention.length} {attention.length === 1 ? "filial" : "filiais"} · por competência</p></div>
                <Link className="btn btn-outline-primary" to="/falhas-por-causa">Ver falhas</Link>
              </div>}
              {creating.some(item => item.status === "ERRO") && <div className="ve-home-alert ve-home-alert-danger">
                <div><strong>Falha na criação</strong><p>Execuções não criadas.</p></div>
                <Link className="btn btn-outline-primary" to="/processamento">Ver pendências</Link>
              </div>}
              {ready.length > 0 && <div className="ve-home-alert ve-home-alert-success">
                <div><strong>Pronto para envio</strong><p>{ready.length} {ready.length === 1 ? "filial" : "filiais"} · por competência</p></div>
                <Link className="btn btn-outline-primary" to="/processamento?situacao=envio">Conferir envio</Link>
              </div>}
              {missing.length > 0 && <div className="ve-home-alert ve-home-alert-warning">
                <div><strong>Sem execução</strong><p>{missing.length} {missing.length === 1 ? "filial" : "filiais"} · por competência</p></div>
                <Link className="btn btn-outline-primary" to="/processamento">Iniciar</Link>
              </div>}
              <div className="ve-home-alert">
                <div><strong>{running.length || creating.some(item => item.status !== "ERRO") ? "Processamento em andamento" : "Fila de cálculo encerrada"}</strong>
                  <p>{running.length || creating.some(item => item.status !== "ERRO") ? "Tarefas em execução ou aguardando." : attention.length || creating.some(item => item.status === "ERRO") ? "Há pendências para resolver." : "Sem tarefas de cálculo na fila."}</p></div>
                <Link className="btn btn-outline-primary" to="/processamento">Acompanhar</Link>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
