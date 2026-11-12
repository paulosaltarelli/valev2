export type Celula = string | number | null;
// Metadados somente do servidor: símbolos não são serializados na resposta HTTP.
export const contextoConsulta = Symbol('contexto-consulta-assistente');
export const respostaParaModelo = Symbol('resposta-para-modelo');
export type ContextoErros = {
  tipo: 'funcionarios_com_erro';
  periodoId: number;
  competencia: string;
  filialId?: number;
  filial: string;
  execucaoIds: number[];
  funcionarioBaseIds: number[];
  total: number;
  parcial: boolean;
  capturadoEm: string;
};
export type TurnoAssistente = {
  pergunta: string;
  resposta: string;
  em?: string;
  contexto?: ContextoErros;
  respostaModelo?: string;
};
export type ResultadoAssistente = {
  apresentacao?: {
    titulo?: string;
    grafico?: 'barras' | 'linha';
    dimensao?: string;
    metrica?: string | null;
  };
  [contextoConsulta]?: ContextoErros;
  [respostaParaModelo]?: string;
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
