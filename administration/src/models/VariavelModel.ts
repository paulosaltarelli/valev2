export type Variavel = {
  variavel_id: number;
  filial_id: number;
  nome: string;
  codigo: string;
  tipo: string;
  // Observação: na prática pode vir nulo/vazio e, no form, a gente alterna entre SQL ou valor fixo
  sql_codigo_rm: string | null;
  valor_fixo: number | null;
  ativa: boolean;
};

export type UpdateVariavelPayload = Partial<
  Pick<Variavel, 'nome' | 'codigo' | 'tipo' | 'sql_codigo_rm' | 'valor_fixo'>
>;