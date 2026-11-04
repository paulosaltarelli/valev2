export type FuncionarioRm = {
  CODCOLIGADA: number;
  CODFILIAL: number;
  CIDADE: string;
  NOME: string;
  CHAPA: string;
  CARGO: string;
  DATAADMISSAO: string;
  CEP_FUNC: string;
  RUA_FUNC: string;
  NUMERO_FUNC: string;
  BAIRRO_FUNC: string;
  CIDADE_FUNC: string;
  ESTADO_FUNC: string;
  CEP_FILIAL: string;
  RUA_FILIAL: string;
  NUMERO_FILIAL: string;
  BAIRRO_FILIAL: string;
  CIDADE_FILIAL: string;
  ESTADO_FILIAL: string;
  KM?: string;
  CEP?: string;
  RUA?: string;
  NUMERO?: string;
  BAIRRO?: string;
  ESTADO?: string;
  PAIS?: string;
};

export type UpdateFuncionarioRmPayload = Partial<
  Pick<
    FuncionarioRm,
    | 'NOME'
    | 'CODCOLIGADA'
    | 'CODFILIAL'
    | 'CIDADE'
    | 'CHAPA'
    | 'CARGO'
    | 'DATAADMISSAO'
    | 'CEP_FUNC'
    | 'RUA_FUNC'
    | 'NUMERO_FUNC'
    | 'BAIRRO_FUNC'
    | 'CIDADE_FUNC'
    | 'ESTADO_FUNC'
    | 'CEP_FILIAL'
    | 'RUA_FILIAL'
    | 'NUMERO_FILIAL'
    | 'BAIRRO_FILIAL'
    | 'CIDADE_FILIAL'
    | 'ESTADO_FILIAL'
    | 'KM'
  >
>;
