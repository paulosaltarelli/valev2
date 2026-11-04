export type Formula = {
  formula_id: number;
  filial_id: number;
  expressao: string;
  versao: number;
  ativa: boolean;
  data_inicio_vigencia: Date;
  data_fim_vigencia: Date | null;
  data_criacao: Date;
  nome: string;
  codEvento: string | null;
  tipo: string | null;
  polaridade: string;
};

export type UpdateFormulaPayload = Partial<
  Pick<Formula, 'expressao' | 'versao' | 'ativa' | 'data_inicio_vigencia' | 'data_fim_vigencia' | 'nome' | 'codEvento' | 'tipo' | 'polaridade'>
>;