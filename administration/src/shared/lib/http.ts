import axios from "axios";

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // envia/recebe cookies HttpOnly
});

http.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !String(error.config?.url ?? '').startsWith('/auth/') && window.location.pathname !== '/login') {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?${new URLSearchParams({ retorno: next, motivo: 'sessao' })}`);
  }
  return Promise.reject(error);
});

export type RmUser = {
  username: string;
  name: string;
  perfil?: "admin" | "operator";
};

export type AuthUser = {
  username: string;
  user: RmUser;
};

export const authApi = {
  async login(username: string, password: string): Promise<RmUser> {
    const resp = await http.post("/auth/login", { username, password });
    const u = resp.data.user as any;
    return {
      username: u?.username ?? username,
      name: u?.name ?? u?.data?.NOME ?? u?.data?.name ?? "",
      perfil: u?.perfil ?? u?.data?.perfil ?? undefined,
    };
  },
  async me(): Promise<RmUser> {
    const resp = await http.get("/auth/me");
    const u = resp.data.user as any;
    return {
      username: u?.username ?? "",
      name: u?.name ?? u?.data?.NOME ?? u?.data?.name ?? "",
      perfil: u?.perfil ?? u?.data?.perfil ?? undefined,
    };
  },
  async logout(): Promise<void> {
    await http.post("/auth/logout");
  },
};
