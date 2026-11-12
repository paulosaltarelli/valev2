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
    id: "analysis",
    icon: "mdi:chart-box-outline",
    links: [
      ["/relatorios", "Evolução financeira", "mdi:chart-box-outline"],
      ["/extrato-processamento", "Valores por funcionário", "mdi:table-large"],
    ],
  },
  {
    label: "Regras e cadastros",
    id: "registration",
    icon: "mdi:store-outline",
    adminOnly: true,
    links: [
      ["/filial", "Filiais e regras", "mdi:store-outline"],
      ["/periodo", "Competências", "mdi:calendar-month-outline"],
    ],
  },
  {
    label: "Administração",
    adminOnly: true,
    links: [
      ["/usuarios", "Usuários e acesso", "mdi:account-outline"],
      ["/configuracao-ia", "Configuração do Vale IA", "mdi:cog-outline"],
    ],
  },
];

export function Sidebar() {
  const { state, dispatch } = useThemeContext();
  const { state: appState } = useAppContext();
  const locationPath = useLocation().pathname;
  const pathname = locationPath === "/variacao-competencias" ? "/relatorios" : locationPath;
  const activeGroup = navigation.find((group) => group.id && group.links.some(([path]) => pathname === path || pathname.startsWith(path + "/")))?.id;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => activeGroup ? { [activeGroup]: true } : {});
  useEffect(() => {
    if (activeGroup) setOpenGroups((open) => ({ ...open, [activeGroup]: true }));
  }, [pathname, activeGroup]);
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
            .flatMap(({ label, links, id, icon }) => {
              const items = links.map(([path, name, linkIcon]) => (
                <li key={path}>
                  <NavLink to={path} title={name} aria-label={name} onClick={closeMobileMenu}
                    className={({ isActive }) => isActive ? "active-page" : ""}>
                    <Icon icon={linkIcon} className="menu-icon" aria-hidden="true" />
                    <span>{name}</span>
                  </NavLink>
                </li>
              ));
              if (!id) return [<li key={label} className="sidebar-menu-group-title">{label}</li>, ...items];
              const expanded = !!openGroups[id];
              return [
                <li key={id}>
                  <button type="button" className={`ve-analysis-toggle${activeGroup === id ? " is-current" : ""}`}
                    aria-expanded={expanded} aria-controls={`${id}-menu`} title={label}
                    onClick={() => setOpenGroups((open) => ({ ...open, [id]: !open[id] }))}>
                    <Icon icon={icon!} className="menu-icon" aria-hidden="true" />
                    <span>{label}</span>
                    <Icon icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"} className="ve-menu-chevron" aria-hidden="true" />
                  </button>
                  <ul id={`${id}-menu`} className="ve-analysis-submenu" hidden={!expanded}>{items}</ul>
                </li>,
              ];
            })}
        </ul>
      </nav>
    </aside>
  );
}
