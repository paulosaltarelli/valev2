import axios from "axios";

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // envia/recebe cookies HttpOnly
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
    console.log("login", resp);
    const u = resp.data.user as any;
    return {
      username: u?.username ?? username,
      name: u?.name ?? u?.data?.NOME ?? u?.data?.name ?? "",
      perfil: u?.perfil ?? u?.data?.perfil ?? undefined,
    };
  },
  async me(): Promise<RmUser> {
    const resp = await http.get("/auth/me");
    console.log("me", resp);
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
