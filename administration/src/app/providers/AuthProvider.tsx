import {
  type ReactNode,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from "react";
import { authApi, type RmUser } from "../../shared/lib/http";
import { AuthContext, type AuthContextValue } from "./authContext";
import { useAppContext } from "../../contexts/AppContext/useAppContext";
import { AppActionsTypes } from "../../contexts/AppContext/appActions";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RmUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { dispatch: appDispatch } = useAppContext();

  // Reidrata o usuário no refresh (sessão fica em cookie HttpOnly; state do React não).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await authApi.me();
        if (!cancelled)
          setUser({ username: me.username, name: me.name, perfil: me.perfil });
      } catch {
        // Sem sessão válida -> mantém user null (o router já redireciona pro /login)
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      appDispatch({
        type: AppActionsTypes.SET_USER,
        payload: {
          username: user.username,
          name: user.name,
          perfil: user.perfil ?? '',
        },
      });
    } else {
      appDispatch({ type: AppActionsTypes.CLEAR_USER });
    }
  }, [user, appDispatch]);

  const signIn = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    const me = await authApi.login(username, password);
    setUser({ username: me.username, name: me.name, perfil: me.perfil });
    setIsLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    await authApi.logout();
    setUser(null);
    setIsLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: Boolean(user),
      user,
      signIn,
      signOut,
    }),
    [isLoading, signIn, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
