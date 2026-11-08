import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { QueryNotice, useOperationQuery } from "../../components/Processamento/OperationCommon";
import { PageHeading } from "../../shared/components/PageHeading";
import { AnalysisNav } from "../../shared/components/AnalysisNav";
import { http } from "../../shared/lib/http";

type FailureReport = {
  periodo: number | null;
  periodos: { periodo_id: number; competencia: string; ativo: boolean }[];
  groups: {
    id: string;
    stage: string;
    cause: string;
    count: number;
    affected: { execucaoId: number; filial: string; count: number }[];
  }[];
};

export function FalhasPage() {
  const [params, setParams] = useSearchParams();
  const periodo = params.get("periodo") ?? "";
  const [stage, setStage] = useState("");
  const fetcher = useCallback(async () => {
    const { data } = await http.get<FailureReport>("/dash/reports/falhas", {
      params: { periodoId: periodo || undefined },
    });
    return data;
  }, [periodo]);
  const query = useOperationQuery(fetcher);
  const data = query.data;
  const current = data && (!periodo || String(data.periodo) === periodo) ? data : undefined;
  const groups = current?.groups.filter((group) => !stage || group.stage === stage) ?? [];
  const returnTo = `/falhas-por-causa?periodo=${current?.periodo ?? ""}`;

  return (
    <div className="op-page">
      <PageHeading area="Análise" title="Falhas por causa"
        description="Veja as falhas que exigem ação e abra a execução afetada." />
      <AnalysisNav />
      <section className="op-context mb-3" aria-label="Filtros das falhas">
        <label>
          Competência
          <select value={periodo || data?.periodo || ""} disabled={!data?.periodos.length}
            onChange={(event) => setParams({ periodo: event.target.value })}>
            {!data?.periodos.length && <option value="">Nenhuma disponível</option>}
            {data?.periodos.map((item) => (
              <option value={item.periodo_id} key={item.periodo_id}>{item.competencia}{item.ativo ? " · Ativa" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          Etapa
          <select value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="">Todas</option>
            <option>Variáveis</option>
            <option>Cálculo</option>
            <option>Envio ao RM</option>
          </select>
        </label>
      </section>
      <QueryNotice {...query} />
      {current && (groups.length ? (
        <div className="op-table-wrap">
          <div className="op-scroll">
            <table className="op-table">
              <thead><tr>
                <th scope="col">Causa</th><th scope="col">Etapa</th><th scope="col">Funcionários afetados</th>
                <th scope="col">Filiais afetadas</th>
              </tr></thead>
              <tbody>{groups.map((group) => (
                <tr key={group.id}>
                  <th scope="row">{group.cause}</th>
                  <td>{group.stage}</td>
                  <td>{group.count}</td>
                  <td>
                    <details>
                      <summary>{group.affected.length} {group.affected.length === 1 ? "filial" : "filiais"}</summary>
                      <ul className="mt-2 mb-0 ps-3">
                        {group.affected.map((item) => (
                          <li key={item.execucaoId}>
                            <Link to={`/processamento/${item.execucaoId}?${new URLSearchParams({ aba: "pendencias", retorno: returnTo })}`}>
                              {item.filial} · {item.count}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <p>Nenhuma falha que exige ação neste recorte.</p>)}
    </div>
  );
}
