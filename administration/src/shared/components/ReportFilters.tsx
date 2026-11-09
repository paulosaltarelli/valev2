import { useId, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";
export function ReportFilters({ summary, children }: { summary: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className="ve-mobile-filters">
    <button className="ve-filter-toggle" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      <Icon icon="tabler:adjustments-horizontal" width={20} aria-hidden="true" />
      <span><strong>Filtros</strong><small>{summary}</small></span>
      <Icon icon={expanded ? "tabler:chevron-up" : "tabler:chevron-down"} width={20} aria-hidden="true" />
    </button>
    <div id={id} className={expanded ? "ve-filter-content is-expanded" : "ve-filter-content"}>{children}</div>
  </div>;
}
