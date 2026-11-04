import { createBrowserRouter, redirect } from "react-router";
import { AdminLayout } from "../layouts/AdminLayout";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { authApi } from "../shared/lib/http";
import { FilialPage } from "../pages/FilialPage";
import { FilialVariaveisPage } from "../components/Filiais/FilialVariaveisPage";
import { UsuariosPage } from "../pages/UsuariosPage";
import { FilialFormulasPage } from "../components/Filiais/FilialFormulasPage";
import { PeriodoPage } from "../pages/PeriodoPage";
import { ProcessamentoPage } from "../pages/ProcessamentoPage";
import { ProcessamentoDetalhesPage } from "../components/Processamento/ProcessamentoDetalhesPage";
import { GestaoKmPage } from "../pages/GestaoKmPage";
import { RelatoriosPage } from "../pages/RelatoriosPage";

async function requireAuth() {
  try {
    await authApi.me();
    return null;
  } catch {
    throw redirect("/login");
  }
}

async function requireAdmin() {
  try {
    const me = await authApi.me();
    if (me.perfil !== "admin") throw redirect("/dashboard");
    return null;
  } catch {
    // se não conseguir carregar, deixa o loader principal lidar
    throw redirect("/login");
  }
}

async function redirectIfAuthed() {
  try {
    await authApi.me();
  } catch {
    // não autenticado -> deixa acessar /login
    return null;
  }

  // autenticado -> manda pra home
  throw redirect("/");
}

export const router = createBrowserRouter([
  {
    path: "/login",
    loader: redirectIfAuthed,
    element: <LoginPage />,
  },
  {
    path: "/",
    loader: requireAuth,
    element: <AdminLayout />,
    children: [
      {
        index: true,
        loader: () => {
          throw redirect("/dashboard");
        },
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "usuarios",
        loader: requireAdmin,
        element: <UsuariosPage />,
      },
      {
        path: "filial",
        loader: requireAdmin,
        element: <FilialPage />,
      },
      {
        path: "filial/variaveis/:filialId",
        loader: requireAdmin,
        element: <FilialVariaveisPage />,
      },
      {
        path: "filial/formulas/:filialId",
        loader: requireAdmin,
        element: <FilialFormulasPage />,
      },
      {
        path: "periodo",
        loader: requireAdmin,
        element: <PeriodoPage />,
      },
      {
        path: "processamento",
        element: <ProcessamentoPage />,
      },
      {
        path: "processamento/:execucaoId",
        element: <ProcessamentoDetalhesPage />,
      },
      {
        path: "gestao-km",
        element: <GestaoKmPage />,
      },
      {
        path: "relatorios",
        element: <RelatoriosPage />,
      },
    ],
  },
]);
