export type FilialRm = {
  CODCOLIGADA: number;
  CODFILIAL: number;
  NOMEFANTASIA: string;
  CIDADE: string;
  CEP: string;
  RUA: string;
  NUMERO: string;
  BAIRRO: string;
  ESTADO: string;
  PAIS: string;
};

export type UpdateFuncionarioRmPayload = Partial<
  Pick<
    FilialRm,
    | 'NOMEFANTASIA'
    | 'CODCOLIGADA'
    | 'CODFILIAL'
    | 'CIDADE'
    | 'CEP'
    | 'RUA'
    | 'NUMERO'
    | 'BAIRRO'
    | 'ESTADO'
    | 'PAIS'
  >
>;
