import { NavLink } from 'react-router';
export function AnalysisNav() {
 return <nav className="ve-analysis-nav op-segments mb-3" aria-label="Relatórios de análise">
  <NavLink to="/extrato-processamento">Valores por funcionário</NavLink>
  <NavLink to="/relatorios">Evolução financeira</NavLink>
 </nav>;
}
