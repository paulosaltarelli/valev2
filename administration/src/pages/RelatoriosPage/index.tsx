import { FinanceiroTimelineReport } from "../../components/Relatorios/FinanceiroTimelineReport";
import { PageHeading } from "../../shared/components/PageHeading";

export function RelatoriosPage() {
  return (
    <>
      <PageHeading
        area="Análise"
        title="Relatórios financeiros"
        description="Compare competências e consulte a evolução dos eventos por filial."
      />
      <FinanceiroTimelineReport />
    </>
  );
}
