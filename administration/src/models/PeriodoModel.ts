export type Periodo = {
  periodo_id: number;
  data_inicio: Date;
  data_fim: Date;
  competencia: string;
  data_criacao: Date;
  ativo: boolean;
};

export type UpdatePeriodoPayload = Partial<
  Pick<Periodo, 'data_inicio' | 'data_fim' | 'competencia' | 'ativo'>
>;