import type { ReactNode } from "react";

export function PageHeading({
  area,
  title,
  description,
  actions,
  context,
}: {
  area: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  context?: string;
}) {
  return (
    <header className="op-page-head ve-heading">
      <div>
        <p className="op-eyebrow">{area}</p>
        <h1>{title}</h1>
        {context && <p className="ve-heading-context">{context}</p>}
        {description && <details className="ve-page-help"><summary aria-label={`Sobre ${title}`} title="Sobre esta tela">ⓘ</summary><p>{description}</p></details>}
      </div>
      {actions}
    </header>
  );
}
