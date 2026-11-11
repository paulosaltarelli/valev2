export type Celula = string | number | null;
export type ResultadoAssistente = {
  texto: string;
  detalhes?: string;
  competencia?: string;
  filial?: string;
  matricula?: string;
  fonte?: string;
  consultadoEm?: string;
  tabela?: { colunas: string[]; linhas: Celula[][]; parcial: boolean };
  grafico?: { rotulo: string; valor: number; moeda?: boolean }[];
  links?: { texto: string; url: string }[];
};
