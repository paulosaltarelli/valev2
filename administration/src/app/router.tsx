import { createBrowserRouter, redirect, type LoaderFunctionArgs, Link } from "react-router";
import { safeReturn } from '../utils/safeReturn';
import { AdminLayout } from "../layouts/AdminLayout";
import { PageHeading } from "../shared/components/PageHeading";
import { LoginPage } from "../pages/LoginPage";
import { authApi } from "../shared/lib/http";

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
        lazy: async () => ({ Component: (await import("../pages/DashboardPage")).DashboardPage }),
      },
      {
        path: "usuarios",
        loader: requireAdmin,
        lazy: async () => ({ Component: (await import("../pages/UsuariosPage")).UsuariosPage }),
      },
      {
        path: "configuracao-ia",
        loader: requireAdmin,
        lazy: async () => ({ Component: (await import("../pages/AssistenteConfiguracaoPage")).AssistenteConfiguracaoPage }),
      },
      {
        path: "filial",
        loader: requireAdmin,
        lazy: async () => ({ Component: (await import("../pages/FilialPage")).FilialPage }),
      },
      {
        path: "filial/variaveis/:filialId",
        loader: requireAdmin,
        lazy: async () => ({ Component: (await import("../components/Filiais/FilialVariaveisPage")).FilialVariaveisPage }),
      },
      {
        path: "filial/formulas/:filialId",
        loader: requireAdmin,
        lazy: async () => ({ Component: (await import("../components/Filiais/FilialFormulasPage")).FilialFormulasPage }),
      },
      {
        path: "periodo",
        loader: requireAdmin,
        lazy: async () => ({ Component: (await import("../pages/PeriodoPage")).PeriodoPage }),
      },
      {
        path: "processamento",
        lazy: async () => ({ Component: (await import("../pages/ProcessamentoPage")).ProcessamentoPage }),
      },
      {
        path: "processamento/:execucaoId",
        lazy: async () => ({ Component: (await import("../components/Processamento/ProcessamentoDetalhesPage")).ProcessamentoDetalhesPage }),
      },
      {
        path: "gestao-km",
        lazy: async () => ({ Component: (await import("../pages/GestaoKmPage")).GestaoKmPage }),
      },
      {
        path: "relatorios",
        lazy: async () => ({ Component: (await import("../pages/RelatoriosPage")).RelatoriosPage }),
      },
      {
        path: "extrato-processamento",
        lazy: async () => ({ Component: (await import("../pages/ExtratoProcessamentoPage")).ExtratoProcessamentoPage }),
      },
      {
        path: "falhas-por-causa",
        lazy: async () => ({ Component: (await import("../pages/FalhasPage")).FalhasPage }),
      },
      { path: 'fechamento', loader: ({request}) => {
        const params = new URL(request.url).searchParams;
        params.set('detalhes', '1');
        throw redirect(`/processamento?${params}`);
      } },
      { path: 'variacao-competencias', lazy: async () => ({ Component: (await import("../pages/VariacaoPage")).VariacaoPage }) },
    ],
  },
]);
