import { NavLink, useLocation } from 'react-router';

export function AnalysisNav() {
  const { pathname } = useLocation();
  return <details className="ve-analysis-switch" key={pathname}><summary>Trocar relatório</summary><nav className="ve-analysis-nav op-segments" aria-label="Relatórios de análise">
    <NavLink to="/fechamento">Fechamento por filial</NavLink>
    <NavLink to="/extrato-processamento">Valores por funcionário</NavLink>
    <NavLink to="/falhas-por-causa">Falhas por causa</NavLink>
    <NavLink to="/variacao-competencias">Variação entre competências</NavLink>
    <NavLink to="/relatorios">Evolução financeira</NavLink>
  </nav></details>;
}
