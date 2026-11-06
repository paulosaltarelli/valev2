import { Icon } from "@iconify/react";
import { Link } from "react-router";
// import { useAuth } from "../../app/providers/authContext";
// import { useState } from "react";
import { ThemeToggleButton } from "../../helper/ThemeToggleButton.tsx";
import { useThemeContext } from "../../contexts/ThemeContext/useThemeContext.ts";
import { ThemeActionsTypes } from "../../contexts/ThemeContext/themeActions.ts";
import { useNavigate } from "react-router";
import { useAuth } from "../../app/providers/authContext.ts";
import { useAppContext } from "../../contexts/AppContext/useAppContext.ts";

import avatar from "../../assets/images/avatar.png";
export function Navbar() {
  const navigate = useNavigate();
  const { signOut, isLoading, user } = useAuth();
  const { state, dispatch } = useThemeContext();
  const { state: appState } = useAppContext();

  const handleToggleSidebar = () => {
    console.log("dispatching handleToggleSidebar");
    dispatch({ type: ThemeActionsTypes.TOGGLE_SIDEBAR });
  };

  const handleToggleMobileMenu = () => {
    dispatch({ type: ThemeActionsTypes.TOGGLE_MOBILE_MENU });
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="navbar-header">
      <div className="row align-items-center justify-content-between">
        <div className="col-auto">
          <div className="d-flex flex-wrap align-items-center gap-4">
            <button
              type="button"
              className="sidebar-toggle"
              aria-label="Recolher ou expandir menu"
              aria-expanded={!state.sidebarActive}
              onClick={handleToggleSidebar}
            >
              {state.sidebarActive ? (
                <Icon
                  icon="iconoir:arrow-right"
                  className="icon text-2xl non-active"
                />
              ) : (
                <Icon
                  icon="heroicons:bars-3-solid"
                  className="icon text-2xl non-active "
                />
              )}
            </button>
            <button
              onClick={handleToggleMobileMenu}
              type="button"
              className="sidebar-mobile-toggle"
              aria-label="Abrir menu de navegação"
              aria-expanded={state.mobileMenu}
            >
              <Icon icon="heroicons:bars-3-solid" className="icon" />
            </button>
            {/* <form className="navbar-search">
              <input type="text" name="search" placeholder="Search" />
              <Icon icon="ion:search-outline" className="icon" />
            </form> */}
          </div>
        </div>
        <div className="col-auto">
          <div className="d-flex flex-wrap align-items-center gap-3">
            {/* ThemeToggleButton */}
            <ThemeToggleButton />
            <div className="dropdown">
              <button
                className="d-flex justify-content-center align-items-center rounded-circle"
                type="button"
                data-bs-toggle="dropdown"
                aria-label="Abrir menu da conta"
              >
                <img
                  src={avatar}
                  alt=""
                  className="w-40-px h-40-px object-fit-cover rounded-circle border-1 border-neutral-600"
                />
              </button>
              <div className="dropdown-menu to-top dropdown-menu-sm">
                <div className="py-12 px-16 radius-8 bg-primary-50 mb-16 d-flex align-items-center justify-content-between gap-2">
                  <div>
                    <h6 className="text-lg text-primary-light fw-semibold mb-2">
                      {isLoading
                        ? "Carregando..."
                        : appState.user.name || user?.name || "—"}
                    </h6>
                    {/* <span className="text-secondary-light fw-medium text-sm">
                      Vale Expresso
                    </span> */}
                  </div>
                  <button type="button" className="hover-text-danger" aria-label="Fechar menu da conta">
                    <Icon icon="radix-icons:cross-1" className="icon text-xl" />
                  </button>
                </div>
                <ul className="to-top-list">
                  {/* <li>
                    <Link
                      className="dropdown-item text-black px-0 py-8 hover-bg-transparent hover-text-primary d-flex align-items-center gap-3"
                      to="/view-profile"
                    >
                      <Icon icon="solar:user-linear" className="icon text-xl" />{" "}
                      My Profile
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="dropdown-item text-black px-0 py-8 hover-bg-transparent hover-text-primary d-flex align-items-center gap-3"
                      to="/email"
                    >
                      <Icon
                        icon="tabler:message-check"
                        className="icon text-xl"
                      />{" "}
                      Inbox
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="dropdown-item text-black px-0 py-8 hover-bg-transparent hover-text-primary d-flex align-items-center gap-3"
                      to="/company"
                    >
                      <Icon
                        icon="icon-park-outline:setting-two"
                        className="icon text-xl"
                      />
                      Setting
                    </Link>
                  </li> */}
                  <li>
                    <Link
                      className="dropdown-item text-black px-0 py-8 hover-bg-transparent hover-text-danger d-flex align-items-center gap-3"
                      to="#"
                      onClick={handleLogout}
                    >
                      <Icon icon="lucide:power" className="icon text-xl" /> Sair
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            {/* Profile dropdown end */}
          </div>
        </div>
      </div>
    </div>
  );
}
