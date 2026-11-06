import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../app/providers/authContext";

import { isAxiosError } from "axios";
import { safeReturn } from "../../utils/safeReturn";
import logoFullNegativo from "../../assets/images/Logo-Full-Negativo-2.png";
import { useBlockUi } from "../../app/providers/blockUiContext";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = "Entrar | Vale Expresso"; }, []);
  const { signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { show: blockUiShow, hide: blockUiHide } = useBlockUi();

  return (
    <div className="auth bg-base d-flex flex-column justify-content-center align-items-center h-100">
      <div className="d-flex flex-column justify-content-center px-3 py-32">
        <div className="d-flex justify-content-center align-items-center flex-column card card-body">
          <div>
            <Link to="/" className="mb-40 max-w-290-px d-flex justify-content-center align-items-center">
              <img
                src={logoFullNegativo}
                alt="Vale Expresso"
              />
              {/* <img
                src={logoFullNegativoWhite}
                className="dark-logo"
                alt="Vale Expresso"
                style={{ display: state.theme === "light" ? "none" : "block" }}
              /> */}
            </Link>
            <h4 className="mb-12">Entrar</h4>
            <p className="mb-32 text-secondary-light text-lg">
              Faça login para acessar o painel
            </p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setBusy(true);
              blockUiShow("Entrando...");
              try {
                await signIn(username, password);
                navigate(safeReturn(params.get("retorno")), { replace: true });
              } catch (e) {
                setError(isAxiosError(e) && !e.response ? 'Sem conexão com o servidor. Tente novamente.' : isAxiosError(e) && e.response?.status === 401 ? 'Usuário ou senha inválidos.' : 'Não foi possível autenticar no RM. Tente novamente em instantes.');
              } finally {
                setBusy(false);
                blockUiHide();
              }
            }}
          >
            {params.get("motivo") === "sessao" && <p role="status">Sua sessão expirou. Entre novamente para retomar a tela anterior. As ações pendentes precisarão de nova revisão.</p>}
            <label htmlFor="login-usuario" className="form-label">Usuário RM</label>
            <div className="icon-field mb-16">
              <span className="icon top-50 translate-middle-y">
                <Icon icon="mage:email" />
              </span>
              <input
                type="text"
                id="login-usuario"
                required
                className="form-control h-56-px bg-neutral-50 radius-12"
                placeholder="Usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <label htmlFor="your-password" className="form-label">Senha</label>
            <div className="position-relative mb-20">
              <div className="icon-field">
                <span className="icon top-50 translate-middle-y">
                  <Icon icon="solar:lock-password-outline" />
                </span>
                <input
                  type="password"
                  required
                  className="form-control h-56-px bg-neutral-50 radius-12"
                  id="your-password"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary text-sm btn-sm px-12 py-16 w-100 radius-12 mt-32"
              disabled={busy || !username || !password}
            >
              Entrar
            </button>

            {error ? (
              <div role="alert" className="mt-3 text-danger small">{error}</div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
