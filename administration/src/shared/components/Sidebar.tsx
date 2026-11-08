import { Link, useLocation } from "react-router";
import { Icon } from "@iconify/react";
import { useThemeContext } from "../../contexts/ThemeContext/useThemeContext";
import { ThemeActionsTypes } from "../../contexts/ThemeContext/themeActions";
import { useAppContext } from "../../contexts/AppContext/useAppContext";
import expressoLogo from "../../assets/images/expresso.png";
import expressoLogoWhite from "../../assets/images/expresso_w.png";

const navigation = [
  { path: "/dashboard", label: "Visão geral", icon: "mdi:home-outline", sections: ["dashboard"] },
  { path: "/processamento", label: "Processamentos", icon: "mdi:clipboard-list-outline", sections: ["processamento"] },
  { path: "/gestao-km", label: "Gestão de KM", icon: "mdi:map-marker-distance", sections: ["gestao-km"] },
  { path: "/fechamento", label: "Análise", icon: "mdi:chart-box-outline", sections: ["fechamento", "variacao-competencias", "relatorios", "extrato-processamento", "falhas-por-causa"] },
  { path: "/filial", label: "Cadastros", icon: "mdi:store-outline", sections: ["filial", "periodo", "usuarios"], adminOnly: true },
];

export function Sidebar() {
  const { state, dispatch } = useThemeContext();
  const { state: appState } = useAppContext();
  const section = useLocation().pathname.split("/")[1];
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
            .filter((item) => !item.adminOnly || appState.user.perfil === "admin")
            .map(({ path, label, icon, sections }) => (
                <li key={path}>
                  <Link
                    to={path}
                    title={label}
                    aria-label={label}
                    aria-current={sections.includes(section) ? "location" : undefined}
                    onClick={closeMobileMenu}
                    className={sections.includes(section) ? "active-page" : ""}
                  >
                    <Icon icon={icon} className="menu-icon" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}
        </ul>
      </nav>
    </aside>
  );
}
