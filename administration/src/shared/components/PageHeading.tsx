import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router";

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
  const isRegistration = ["filial", "periodo", "usuarios"].includes(useLocation().pathname.split("/")[1]);
  return (
    <>
    <header className="op-page-head ve-heading">
      <div>
        <p className="op-eyebrow">{area}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </header>
    {isRegistration && (
      <nav className="ve-analysis-nav op-segments" aria-label="Cadastros">
        <NavLink to="/filial">Filiais e regras</NavLink>
        <NavLink to="/periodo">Competências</NavLink>
        <NavLink to="/usuarios">Usuários e acesso</NavLink>
      </nav>
    )}
    </>
  );
}
