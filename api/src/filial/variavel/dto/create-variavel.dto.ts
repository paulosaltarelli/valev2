export type CreateVariavelDto = {
  nome: string;
  codigo: string;
  tipo: string;
  sql_codigo_rm?: string | null;
  valor_fixo?: number | null;
};
