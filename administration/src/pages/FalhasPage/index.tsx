import { ReportIndicators } from "../../shared/components/ReportIndicators";
import { ReportFilters } from "../../shared/components/ReportFilters";
import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { QueryNotice, useOperationQuery } from "../../components/Processamento/OperationCommon";
import { PageHeading } from "../../shared/components/PageHeading";

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
  groups.sort((a,b) => b.count - a.count);
  const returnTo = `/falhas-por-causa?periodo=${current?.periodo ?? ""}`;

  return (
    <div className="op-page">
      <PageHeading area="Processamentos" title="Erros por causa"
        description="Veja as falhas que exigem ação e abra a execução afetada." />
      <Link className="d-inline-block mb-3" to={`/processamento?periodo=${current?.periodo ?? periodo}`}>← Voltar a Processamentos</Link>
      <ReportFilters summary={(current?.periodos.find(p => p.periodo_id === current.periodo)?.competencia ?? "Carregando…") + " · " + (stage || "Todas as etapas")}>
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
      </ReportFilters>
      <QueryNotice {...query} />
      {current && <ReportIndicators selected={stage} onSelect={setStage} items={[
        {key:'',label:'Todas as causas',value:current.groups.length,total:current.groups.length,tone:'danger'},
        ...['Variáveis','Cálculo','Envio ao RM'].map(key=>({key,label:key,value:current.groups.filter(g=>g.stage===key).length,total:current.groups.length,tone:'danger' as const}))
      ]}/>}
      {current && <details className="mb-3"><summary>{groups.length} causas · Como ler</summary><p className="op-muted">Ordenado por pessoas afetadas. As barras comparam cada causa à maior deste recorte. Uma pessoa pode aparecer em várias causas; não some as linhas.</p></details>}
      {current && (groups.length ? (
        <div className="op-table-wrap">
          <div className="op-scroll" tabIndex={0} role="region" aria-label="Causas de falhas">
            <table className="op-table">
              <thead><tr>
                <th scope="col">Causa</th><th scope="col">Etapa</th><th scope="col">Funcionários afetados</th>
                <th scope="col">Filiais afetadas</th>
              </tr></thead>
              <tbody>{groups.map((group) => (
                <tr key={group.id}>
                  <th scope="row">{group.stage === "Variáveis" ? "Variável com falha" : group.stage === "Cálculo" ? "Falha no cálculo" : "Falha no envio"}<small className="op-muted">{group.cause}</small>{group.affected.length===1 && <Link className="vrg-error-link" to={`/processamento/${group.affected[0].execucaoId}?${new URLSearchParams({filtro:group.stage==="Cálculo"?"formulas_pendentes":"pendencias",retorno:returnTo})}`}>Ver funcionários ↗</Link>}</th>
                  <td>{group.stage}</td>
                  <td><strong className="op-danger">{group.count}</strong><span className="ve-impact-track" aria-hidden="true"><span style={{width: `${groups[0]?.count ? group.count / groups[0].count * 100 : 0}%`}} /></span></td>
                  <td>
                    <details>
                      <summary>{group.affected.length} {group.affected.length === 1 ? "filial" : "filiais"}</summary>
                      <ul className="mt-2 mb-0 ps-3">
                        {group.affected.map((item) => (
                          <li key={item.execucaoId}>
                            <Link to={`/processamento/${item.execucaoId}?${new URLSearchParams({ filtro: group.stage === "Cálculo" ? "formulas_pendentes" : "pendencias", retorno: returnTo })}`}>
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
