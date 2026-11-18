import { Link, useSearchParams } from "react-router";
import { FinanceiroTimelineReport } from "../../components/Relatorios/FinanceiroTimelineReport";
import { PageHeading } from "../../shared/components/PageHeading";
import { AnalysisNav } from "../../shared/components/AnalysisNav";

export function RelatoriosPage() {
  const [params] = useSearchParams();
  return (
    <>
      <PageHeading
        area="Análise"
        title="Evolução financeira"
        actions={<Link className="btn btn-outline-primary" to={`/variacao-competencias?${params}`}>Comparar competências</Link>}
        description="Compare competências e consulte a evolução dos eventos por filial."
      />
      <AnalysisNav />
      <FinanceiroTimelineReport />
    </>
  );
}
