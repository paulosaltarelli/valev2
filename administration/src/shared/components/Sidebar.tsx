import { useEffect, useState } from "react";
import { useLocation, NavLink, Link } from "react-router";
import { Icon } from "@iconify/react";
import { useThemeContext } from "../../contexts/ThemeContext/useThemeContext";
import { ThemeActionsTypes } from "../../contexts/ThemeContext/themeActions";
import { useAppContext } from "../../contexts/AppContext/useAppContext";
import expressoLogo from "../../assets/images/expresso.png";
import expressoLogoWhite from "../../assets/images/expresso_w.png";

const navigation = [
  {
    label: "Operação",
    links: [
      ["/dashboard", "Visão geral", "mdi:home-outline"],
      ["/processamento", "Processamentos", "mdi:clipboard-list-outline"],
      ["/gestao-km", "Gestão de KM", "mdi:map-marker-distance"],
    ],
  },
  {
    label: "Análise",
    links: [
        ["/fechamento", "Fechamento por filial", "mdi:clipboard-check-outline"],
        ["/variacao-competencias", "Variação entre competências", "mdi:compare-horizontal"],
      ["/relatorios", "Relatórios financeiros", "mdi:chart-box-outline"],
      ["/extrato-processamento", "Extrato de processamento", "mdi:table-large"],
      ["/falhas-por-causa", "Falhas por causa", "mdi:alert-circle-outline"],
    ],
  },
  {
    label: "Regras e cadastros",
    adminOnly: true,
    links: [
      ["/filial", "Filiais e regras", "mdi:store-outline"],
      ["/periodo", "Competências", "mdi:calendar-month-outline"],
    ],
  },
  { label: 'Administração', adminOnly: true, links: [['/usuarios', 'Usuários e acesso', 'mdi:account-outline']] },
];

export function Sidebar() {
  const { state, dispatch } = useThemeContext();
  const { state: appState } = useAppContext();
  const pathname = useLocation().pathname;
  const analysisActive = navigation[1].links.some(([path]) => pathname === path || pathname.startsWith(path + "/"));
  const [analysisOpen, setAnalysisOpen] = useState(analysisActive);
  useEffect(() => { if (analysisActive) setAnalysisOpen(true); }, [pathname, analysisActive]);
  const closeMobileMenu = () => {
    if (state.mobileMenu) dispatch({ type: ThemeActionsTypes.TOGGLE_MOBILE_MENU });
  };

  return (
    <aside
      className={`sidebar${state.sidebarActive ? " active" : ""}${state.mobileMenu ? " sidebar-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") closeMobileMenu();
      }}
    >
      <button
        onClick={closeMobileMenu}
        type="button"
        className="sidebar-close-btn"
        aria-label="Fechar menu"
      >
        <Icon icon="radix-icons:cross-2" aria-hidden="true" />
      </button>
      <div>
        <Link to="/" className="sidebar-logo" aria-label="Vale Expresso, início" onClick={closeMobileMenu}>
          <img src={expressoLogo} alt="" className="light-logo" />
          <img src={expressoLogoWhite} alt="" className="dark-logo" />
          <img src={expressoLogo} alt="" className="logo-icon" />
        </Link>
      </div>
      <nav className="sidebar-menu-area" aria-label="Menu principal">
        <ul className="sidebar-menu" id="sidebar-menu">
          {navigation
            .filter((group) => !group.adminOnly || appState.user.perfil === "admin")
            .flatMap(({ label, links }) => label === "Análise" ? [
              <li key="analysis-toggle"><button type="button" className={`ve-analysis-toggle${analysisActive ? " is-current" : ""}`} aria-expanded={analysisOpen} aria-controls="analysis-menu" title="Análise" onClick={() => setAnalysisOpen((open) => !open)}><Icon icon="mdi:chart-box-outline" className="menu-icon" aria-hidden="true" /><span>Análise</span><Icon icon={analysisOpen ? "mdi:chevron-up" : "mdi:chevron-down"} className="ve-menu-chevron" aria-hidden="true" /></button><ul id="analysis-menu" className="ve-analysis-submenu" hidden={!analysisOpen}>{links.map(([path, name, icon]) => <li key={path}><NavLink to={path} title={name} onClick={closeMobileMenu} className={({isActive}) => isActive ? "active-page" : ""}><Icon icon={icon} className="menu-icon" aria-hidden="true" /><span>{name}</span></NavLink></li>)}</ul></li>,
            ] : [
              <li key={label} className="sidebar-menu-group-title">{label}</li>,
              ...links.map(([path, name, icon]) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    title={name}
                    aria-label={name}
                    onClick={closeMobileMenu}
                    className={({ isActive }) => isActive ? "active-page" : ""}
                  >
                    <Icon icon={icon} className="menu-icon" aria-hidden="true" />
                    <span>{name}</span>
                  </NavLink>
                </li>
              )),
            ])}
        </ul>
      </nav>
    </aside>
  );
}
