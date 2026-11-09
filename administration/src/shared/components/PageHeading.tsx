import type { ReactNode } from "react";

export function PageHeading({
  area,
  title,
  description,
  actions,
}: {
  area: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="op-page-head ve-heading">
      <div>
        <p className="op-eyebrow">{area}</p>
        <h1>{title}</h1>
        {description && <details className="ve-page-help"><summary aria-label={`Sobre ${title}`} title="Sobre esta tela">ⓘ</summary><p>{description}</p></details>}
      </div>
      {actions}
    </header>
  );
}
