import { createBrowserRouter, redirect, type LoaderFunctionArgs, Link } from "react-router";
import { safeReturn } from '../utils/safeReturn';
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

async function requireAuth({ request }: LoaderFunctionArgs) {
  try {
    await authApi.me();
    return null;
  } catch {
    const url = new URL(request.url);
    throw redirect(`/login?${new URLSearchParams({ retorno: url.pathname + url.search })}`);
  }
}

async function requireAdmin() {
  let me;
  try {
    me = await authApi.me();
  } catch {
    // se não conseguir carregar, deixa o loader principal lidar
    throw redirect("/login");
  }
  if (me.perfil !== 'admin') throw redirect('/acesso-restrito');
  return null;
}

async function redirectIfAuthed({ request }: LoaderFunctionArgs) {
  try {
    await authApi.me();
  } catch {
    // não autenticado -> deixa acessar /login
    return null;
  }

  // autenticado -> manda pra home
  throw redirect(safeReturn(new URL(request.url).searchParams.get('retorno')));
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
      { path: 'acesso-restrito', element: <section><h1>Acesso restrito</h1><p>Esta área exige perfil de administrador.</p><Link to="/processamento">Voltar à operação</Link></section> },
      {
        index: true,
        loader: () => {
          throw redirect("/processamento");
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
