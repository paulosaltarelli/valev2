import { useCallback, useState } from "react";
import { Link } from "react-router";
import {
  dateTime,
  QueryNotice,
  situacoes,
  useOperationQuery,
} from "../../components/Processamento/OperationCommon";
import { OperacaoApi } from "../../utils/api/operacaoApi";
import { ExecucaoApi } from "../../utils/api/execucaoApi";

export function OperationalOverview({ activePeriodIds, branches }: {
  activePeriodIds: number[];
  branches: { filialId: number; nome: string; ativa: boolean }[];
}) {
  const [view, setView] = useState<"falhas" | "envio" | "faltantes">("falhas");
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
  const attention = rows.filter((row) => row.latest && row.errors > 0);
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
  const links = view === "envio" ? ready : attention;

  return (
    <section className="card ve-operation-overview mb-3" aria-labelledby="ve-operation-heading">
      <div className="card-body">
        <div className="ve-operation-head">
          <div>
            <h2 id="ve-operation-heading">Situação dos processamentos</h2>
            <p className="op-muted mb-0">
              {activePeriodIds.length === 1 ? "1 competência ativa" : `${activePeriodIds.length} competências ativas`}
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
            <div className="ve-metrics ve-overview-actions" role="group" aria-label="Filtrar próximas ações">
              {([
                ["falhas", "Falhas a resolver", attention.length],
                ["envio", "Prontos para enviar ao RM", ready.length],
                ["faltantes", "Filiais sem execução", missing.length],
              ] as const).map(([id, label, count]) => (
                <button className="btn btn-outline-primary" key={id} type="button" aria-pressed={view === id}
                  aria-controls="overview-actions" onClick={() => setView(id)}>
                  {label}<strong>{count}</strong>
                </button>
              ))}
            </div>
            <div id="overview-actions">
              {view === "falhas" && <Link className="op-back mb-2" to="/falhas-por-causa">Abrir Falhas por causa</Link>}
              {view === "faltantes" ? (missing.length ? (
                <ul className="ve-operation-list" aria-label="Filiais sem execução">
                  {missing.map(({ filialId, nome, periodo }) => (
                    <li key={`${periodo.periodo_id}:${filialId}`}>
                      <span>{nome} · {periodo.competencia}</span>
                      <Link to={`/processamento?periodo=${periodo.periodo_id}`}>Abrir competência</Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="mb-0">Nenhuma filial ativa sem execução ou agendamento.</p>) : links.length > 0 ? (
              <ul className="ve-operation-list" aria-label={view === "falhas" ? "Falhas a resolver" : "Prontos para envio"}>
                {links.map((row) => {
                  const situation = situacoes[row.situacao] ?? situacoes.inicio;
                  const details = new URLSearchParams({ aba: situation.tab, retorno: `/processamento?periodo=${row.periodoId}` });
                  return (
                    <li key={row.id}>
                      <div>
                        <Link to={`/processamento/${row.id}?${details}`}>{row.filial}</Link>
                        <span className="op-muted"> · {row.competencia} · #{row.id}{row.latest ? "" : " · anterior"}</span>
                        {row.errors > 0 && <small>{row.errors} pessoas exigem ação</small>}
                        {row.nextRunAt && <small>Próxima tentativa: {dateTime(row.nextRunAt)}</small>}
                      </div>
                      <span className={`op-status op-${situation.tone}`}>{situation.label}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mb-0">Nenhuma execução neste recorte.</p>}
            </div>
            <h3 className="ve-section-title">Andamento da fila</h3>
            {running.length || creating.length ? <ul className="ve-operation-list" aria-label="Execuções na fila">
              {creating.map((item) => <li key={`criacao-${item.queueId}`}>
                <div>
                  <Link to={`/processamento?periodo=${item.periodoId}`}>
                    {branches.find((branch) => branch.filialId === item.filialId)?.nome ?? `Filial #${item.filialId}`}
                  </Link>
                  <small>{activePeriods.get(item.periodoId)} · Criação da execução</small>
                  {item.nextRunAt && <small>Próxima tentativa {dateTime(item.nextRunAt)}</small>}
                </div>
                <span>{item.status === "PROCESSANDO" ? "Em andamento" : "Na fila"}</span>
              </li>)}
              {running.map((row) => <li key={row.id}>
                <div>
                  <Link to={`/processamento/${row.id}?aba=acompanhamento`}>{row.filial}</Link>
                  <small>{row.competencia} · {row.etapas.map((stage) => stage === "VARIAVEIS" ? "Variáveis" : stage === "VALORES" ? "Cálculo" : "Envio ao RM").join(", ")}</small>
                  {row.nextRunAt && <small>Próxima tentativa {dateTime(row.nextRunAt)}</small>}
                </div>
                <span>{row.processing} em andamento · {row.pending} na fila</span>
              </li>)}
            </ul> : <p className="mb-0">Nenhum processamento em andamento.</p>}
          </>
        )}
      </div>
    </section>
  );
}
