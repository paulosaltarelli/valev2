import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Footer } from "../shared/components/Footer";
import { Navbar } from "../shared/components/Navbar";
import { Sidebar } from "../shared/components/Sidebar";
import { useThemeContext } from "../contexts/ThemeContext/useThemeContext";
import "../components/Processamento/operacao.css";
import "./visual.css";

export function AdminLayout() {
  const { state } = useThemeContext();
  const location = useLocation();
  const isProcessing = location.pathname.startsWith("/processamento");
  useEffect(() => { const titles: Record<string,string> = { dashboard: "Visão geral", relatorios: "Relatórios financeiros", "falhas-por-causa": "Falhas por causa", "extrato-processamento": "Extrato de processamento", filial: "Filiais e regras", periodo: "Competências", usuarios: "Usuários e acesso", "gestao-km": "Gestão de KM" }; document.title = `${titles[location.pathname.split("/")[1]] ?? "Processamentos"} | Vale Expresso`; }, [location.pathname]);
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
          <div className={isProcessing ? undefined : "ve-page"}>
            <Outlet />
          </div>
        </div>
        <Footer />
      </main>
    </section>
  );
}
