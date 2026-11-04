import { useEffect } from "react";
import { NavLink, Link, useLocation } from "react-router";
import { Icon } from "@iconify/react";
import { useThemeContext } from "../../contexts/ThemeContext/useThemeContext";
import { ThemeActionsTypes } from "../../contexts/ThemeContext/themeActions";
import expressoLogo from "../../assets/images/expresso.png";
import expressoLogoWhite from "../../assets/images/expresso_w.png";
import expressoLogoIcon from "../../assets/images/expresso.png";
import { useAppContext } from "../../contexts/AppContext/useAppContext";

export function Sidebar() {
  const { state, dispatch } = useThemeContext();
  const { state: appState } = useAppContext();
  const location = useLocation(); // Hook to get the current route
  const isOperator = appState.user.perfil === "operator";
  useEffect(() => {
    const handleDropdownClick = (
      event: React.MouseEvent<HTMLAnchorElement>,
    ) => {
      event.preventDefault();
      const clickedLink = event.currentTarget;
      const clickedDropdown = clickedLink.closest(".dropdown");

      if (!clickedDropdown) return;

      const isActive = clickedDropdown.classList.contains("open");

      // Close all dropdowns
      const allDropdowns = document.querySelectorAll(".sidebar-menu .dropdown");
      allDropdowns.forEach((dropdown) => {
        dropdown.classList.remove("open");
        const submenu = dropdown.querySelector(".sidebar-submenu");
        if (submenu) {
          (submenu as HTMLElement).style.maxHeight = "0px"; // Collapse submenu
        }
      });

      // Toggle the clicked dropdown
      if (!isActive) {
        clickedDropdown.classList.add("open");
        const submenu = clickedDropdown.querySelector(".sidebar-submenu");
        if (submenu) {
          (submenu as HTMLElement).style.maxHeight =
            `${submenu.scrollHeight}px`; // Expand submenu
        }
      }
    };

    // Attach click event listeners to all dropdown triggers
    const dropdownTriggers = document.querySelectorAll(
      ".sidebar-menu .dropdown > a, .sidebar-menu .dropdown > Link",
    );

    dropdownTriggers.forEach((trigger) => {
      trigger.addEventListener(
        "click",
        handleDropdownClick as unknown as EventListener,
      );
    });

    const openActiveDropdown = () => {
      const allDropdowns = document.querySelectorAll(".sidebar-menu .dropdown");
      allDropdowns.forEach((dropdown) => {
        const submenuLinks = dropdown.querySelectorAll(".sidebar-submenu li a");
        submenuLinks.forEach((link) => {
          if (
            link.getAttribute("href") === location.pathname ||
            link.getAttribute("to") === location.pathname
          ) {
            dropdown.classList.add("open");
            const submenu = dropdown.querySelector(".sidebar-submenu");
            if (submenu) {
              (submenu as HTMLElement).style.maxHeight =
                `${submenu.scrollHeight}px`; // Expand submenu
            }
          }
        });
      });
    };

    // Open the submenu that contains the active route
    openActiveDropdown();

    // Cleanup event listeners on unmount
    return () => {
      dropdownTriggers.forEach((trigger) => {
        trigger.removeEventListener(
          "click",
          handleDropdownClick as unknown as EventListener,
        );
      });
    };
  }, [location.pathname]);

  const handleToggleMobileMenu = () => {
    dispatch({ type: ThemeActionsTypes.TOGGLE_MOBILE_MENU });
  };
  return (
    // <aside className="border-end bg-white" style={{ width: 280 }}>
    //   <div className="px-3 py-3 border-bottom fw-semibold">Menu</div>
    //   <nav className="p-2">
    //     <div className="nav nav-pills flex-column gap-1">
    //       <NavLink to="/dashboard" className={navLinkClass} end>
    //         Dashboard
    //       </NavLink>
    //       <NavLink to="/usuarios" className={navLinkClass}>
    //         Usuários
    //       </NavLink>
    //     </div>
    //   </nav>
    // </aside>
    <aside
      className={
        state.sidebarActive
          ? "sidebar active "
          : state.mobileMenu
            ? "sidebar sidebar-open"
            : "sidebar"
      }
    >
      <button
        onClick={handleToggleMobileMenu}
        type="button"
        className="sidebar-close-btn"
      >
        <Icon icon="radix-icons:cross-2" />
      </button>
      <div>
        <Link to="/" className="sidebar-logo">
          <img src={expressoLogo} alt="Vale Expresso" className="light-logo" />
          <img
            src={expressoLogoWhite}
            alt="Vale Expresso"
            className="dark-logo"
          />
          <img
            src={expressoLogoIcon}
            alt="Vale Expresso"
            className="logo-icon"
          />
        </Link>
      </div>
      <div className="sidebar-menu-area">
        <ul className="sidebar-menu" id="sidebar-menu">
          <li className="sidebar-menu-group-title">Vale Expresso</li>
          <li>
            <NavLink
              to="/dashboard"
              className={(navData) => (navData.isActive ? "active-page" : "")}
            >
              <Icon icon="mdi:home" className="menu-icon" />
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/processamento"
              className={(navData) => (navData.isActive ? "active-page" : "")}
            >
              <Icon
                icon="solar:double-alt-arrow-right-bold"
                className="menu-icon"
              />
              <span>Processamentos</span>
            </NavLink>
          </li>

          {/* Settings Dropdown */}
          {!isOperator && (
            <>
              <li>
                <NavLink
                  to="/filial"
                  className={(navData) =>
                    navData.isActive ? "active-page" : ""
                  }
                >
                  <Icon icon="mdi:store" className="menu-icon" />
                  <span>Filiais</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/usuarios"
                  className={(navData) =>
                    navData.isActive ? "active-page" : ""
                  }
                >
                  <Icon icon="solar:user-linear" className="menu-icon" />
                  <span>Usuários</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/periodo"
                  className={(navData) =>
                    navData.isActive ? "active-page" : ""
                  }
                >
                  <Icon icon="mdi:calendar" className="menu-icon" />
                  <span>Períodos</span>
                </NavLink>
              </li>
            </>
          )}
          <li>
            <NavLink
              to="/gestao-km"
              className={(navData) => (navData.isActive ? "active-page" : "")}
            >
              <Icon
                icon="solar:map-point-wave-bold-duotone"
                className="menu-icon"
              />
              <span>Gestão de Km</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/relatorios"
              className={(navData) => (navData.isActive ? "active-page" : "")}
            >
              <Icon icon="solar:chart-2-bold-duotone" className="menu-icon" />
              <span>Relatórios</span>
            </NavLink>
          </li>
        </ul>
      </div>
    </aside>
  );
}
