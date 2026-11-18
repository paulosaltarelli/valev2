export type CreateVariavelDto = {
  nome: string;
  codigo: string;
  tipo: string;
  sql_codigo_rm?: string | null;
  chapas_por_chamada?: number | null;
  valor_fixo?: number | null;
};
