import type { Formula } from "./FormulaModel";

export type Filial = {
  filial_id: number;
  codcoligada: number;
  codfilial: number;
  nome: string;
  ativa: boolean;
  sql_codigo_rm: string;
  formula?: Formula[] | null;
  km_max: number;
};

export type UpdateFilialPayload = Partial<
  Pick<Filial, 'nome' | 'codcoligada' | 'codfilial' | 'ativa' | 'sql_codigo_rm' | 'km_max'>
>;


