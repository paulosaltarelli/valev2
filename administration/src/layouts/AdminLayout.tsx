import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Footer } from "../shared/components/Footer";
import { Navbar } from "../shared/components/Navbar";
import { Sidebar } from "../shared/components/Sidebar";
import { useThemeContext } from "../contexts/ThemeContext/useThemeContext";

export function AdminLayout() {
  const { state } = useThemeContext();
  const location = useLocation();
  useEffect(() => { const titles: Record<string,string> = { dashboard: "Visão geral", relatorios: "Relatórios financeiros", filial: "Filiais e regras", periodo: "Competências", usuarios: "Usuários e acesso", "gestao-km": "Gestão de KM" }; document.title = `${titles[location.pathname.split("/")[1]] ?? "Processamentos"} | Vale Expresso`; }, [location.pathname]);
  return (
    <section className={state.mobileMenu ? "overlay active" : "overlay "}>
      <a href="#conteudo-principal" className="visually-hidden-focusable">Ir para o conteúdo principal</a>
      <Sidebar />
      <main
        className={
          state.sidebarActive ? "dashboard-main active" : "dashboard-main"
        }
      >
        <Navbar />
        <div className="dashboard-main-body" id="conteudo-principal" tabIndex={-1}>
          <Outlet />
        </div>
        <Footer />
      </main>
    </section>
  );
}
