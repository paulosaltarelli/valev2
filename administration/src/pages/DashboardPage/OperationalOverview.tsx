import { useCallback } from "react";
import { Link } from "react-router";
import {
  dateTime,
  QueryNotice,
  situacoes,
  useOperationQuery,
} from "../../components/Processamento/OperationCommon";
import { OperacaoApi } from "../../utils/api/operacaoApi";

export function OperationalOverview({ activePeriodIds }: { activePeriodIds: number[] }) {
  const periodKey = activePeriodIds.join(",");
  const fetcher = useCallback(async () => {
    if (!periodKey) return [];
    return Promise.all(periodKey.split(",").map((id) => OperacaoApi.summary(id)));
  }, [periodKey]);
  const query = useOperationQuery(fetcher);
  const rows = (query.data ?? []).flatMap((summary) =>
    summary.periodo?.ativo ? summary.rows.map((row) => ({
      ...row,
      competencia: summary.periodo!.competencia,
    })) : [],
  );
  const attention = rows.filter((row) => row.latest && row.errors > 0);
  const running = rows.filter((row) => row.processing > 0 || row.pending > 0);
  const ready = rows.filter((row) => row.latest && row.situacao === "envio");
  const sent = rows.filter((row) => row.latest && row.situacao === "enviado");
  const next = rows.filter((row) => row.latest && row.situacao === "inicio");
  const priorities = [...new Map(
    [...attention, ...running, ...ready, ...next].map((row) => [row.id, row]),
  ).values()];

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
          <Link className="btn btn-outline-primary" to="/processamento">
            Abrir Processamentos
          </Link>
        </div>
        <QueryNotice {...query} />
        {!activePeriodIds.length && <p className="mb-0 mt-2">Nenhuma competência ativa cadastrada.</p>}
        {query.data && activePeriodIds.length > 0 && (
          <>
            <dl className="ve-operation-counts">
              <div><dt>Exigem ação</dt><dd>{attention.length}</dd></div>
              <div><dt>Na fila ou rodando</dt><dd>{running.length}</dd></div>
              <div><dt>Prontas para envio</dt><dd>{ready.length}</dd></div>
              <div><dt>Enviadas ao RM</dt><dd>{sent.length}</dd></div>
            </dl>
            {priorities.length > 0 ? (
              <ul className="ve-operation-list" aria-label="Execuções que precisam ser acompanhadas">
                {priorities.slice(0, 6).map((row) => {
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
            ) : <p className="mb-0">{rows.length ? "Nenhuma execução exige acompanhamento no momento." : "Nenhuma execução nas competências ativas."}</p>}
            {priorities.length > 6 && <p className="op-muted mt-2 mb-0">
              Mostrando 6 de {priorities.length} execuções para acompanhar. Veja as demais em Processamentos.
            </p>}
          </>
        )}
      </div>
    </section>
  );
}
