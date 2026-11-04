export type Usuario = {
  usuario_id: number;
  rm_user_id: string;
  login: string;
  nome: string;
  perfil: string;
  ativo: boolean;
  data_ultimo_login: Date;
  data_criacao: Date;
};

export type UpdateUsuarioPayload = Partial<
  Pick<Usuario, 'nome' | 'login' | 'perfil' | 'ativo' | 'data_ultimo_login'>
>;