import { createBrowserRouter, redirect, type LoaderFunctionArgs, Link } from "react-router";
import { safeReturn } from '../utils/safeReturn';
import { AdminLayout } from "../layouts/AdminLayout";
import { PageHeading } from "../shared/components/PageHeading";
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
import { ExtratoProcessamentoPage } from "../pages/ExtratoProcessamentoPage";
import { FalhasPage } from "../pages/FalhasPage";
import { FechamentoPage } from "../pages/FechamentoPage";
import { VariacaoPage } from "../pages/VariacaoPage";

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
      {
        path: "acesso-restrito",
        element: (
          <PageHeading
            area="Conta"
            title="Acesso restrito"
            description="Esta área exige perfil de administrador."
            actions={<Link to="/processamento" className="btn btn-primary">Voltar à operação</Link>}
          />
        ),
      },
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
      {
        path: "extrato-processamento",
        element: <ExtratoProcessamentoPage />,
      },
      {
        path: "falhas-por-causa",
        element: <FalhasPage />,
      },
      { path: 'fechamento', element: <FechamentoPage /> },
      { path: 'variacao-competencias', element: <VariacaoPage /> },
    ],
  },
]);
