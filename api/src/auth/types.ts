export type JwtPayload = {
  sub: string;
  sessionId: string;
  username: string;
  userData?: unknown;
  usuarioId: number;
  perfil: 'admin' | 'operator';
};
