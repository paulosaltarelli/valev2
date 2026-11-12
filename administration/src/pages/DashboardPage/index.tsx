import { PageHeading } from "../../shared/components/PageHeading";
import { QueryNotice, useOperationQuery } from "../../components/Processamento/OperationCommon";
import { OperationalReportsApi } from "../../utils/api/operationalReportsApi";
import { OperationalOverview } from "./OperationalOverview";
export function DashboardPage() {
 const query=useOperationQuery(OperationalReportsApi.options);
 return <div className="op-page"><PageHeading area="Operação diária" title="Visão geral" description="Ações e andamento das competências ativas."/>
  <QueryNotice {...query}/>
  {query.data && <OperationalOverview activePeriodIds={query.data.periodos.filter(p=>p.ativo).map(p=>p.periodo_id)} branches={query.data.filiais.map(f=>({filialId:f.filial_id,nome:f.nome,ativa:f.ativa}))}/>}
 </div>;
}
