import api from "./Api";
export type Etapa = "VARIAVEIS" | "VALORES" | "ENVIAR_RM";
export type QueueAction = "pausar" | "retomar" | "cancelar";
export type PeriodoOperacao = {
  periodo_id: number;
  competencia: string;
  ativo: boolean;
};
export type OperationRow = {
  id: number;
  filialId: number;
  filial: string;
  periodoId: number;
  createdAt: string;
  latest: boolean;
  total: number;
  variaveis: number;
  valores: number;
  rm: number;
  conferidos: number;
  errors: number;
  processing: number;
  pending: number;
  controleFila?: "PAUSADA" | "CANCELADA" | null;
  nextRunAt: string | null;
  lastActivityAt?: string | null;
  etapas: string[];
  situacao: string;
};
export type OperationSummary = {
  periodos: PeriodoOperacao[];
  periodo: PeriodoOperacao | null;
  rows: OperationRow[];
  updatedAt: string;
};
export type ResultRow = {
  execucao_funcionario_id: number;
  revisao: number;
  conferido_revisao: number | null;
  enviado_revisao: number | null;
  status: string;
  valor_calculado: string | null;
  valor_final: string | null;
  ajuste_manual: boolean;
  metadados_rm_id: number | null;
  formula: {
    nome: string;
    codEvento: string;
    tipo?: string;
    expressao?: string;
    versao?: number;
    snapshot_origem?: string;
  };
};
export type BaseRow = {
  execucao_funcionario_base_id: number;
  nome_funcionario: string;
  funcionario_id_rm: string;
  cargo: string;
  status: string;
  km: string | null;
  execucao_funcionario: ResultRow[];
};
export type QueueRow = {
  queue_id: number;
  execucao_funcionario_base_id: number;
  tipo: string;
  status: string;
  tentativas: number;
  next_run_at: string | null;
  updated_at: string;
  execucao_funcionario_base: {
    nome_funcionario: string;
    funcionario_id_rm: string;
  };
};
export type OperationDetail = {
  execucao: {
    execucao_id: number;
    filial: { nome: string; filial_id: number };
    periodo: PeriodoOperacao;
    data_execucao: string;
  };
  bases: BaseRow[];
  total: number;
  page: number;
  pageSize: number;
  queue: QueueRow[];
  updatedAt: string;
};
export type ResultDetail = ResultRow & {
  execucao_funcionario_base: {
    nome_funcionario: string;
    funcionario_id_rm: string;
    status: string;
  };
  formulaUtilizada: ResultRow["formula"] | null;
  memoria_calculo: Array<{
    memoria_id: number;
    variavel_codigo: string;
    variavel_nome: string;
    valor: string;
    origem: string;
    detalhe: string;
    data_registro: string;
  }>;
  historico: Array<{
    id: number;
    revisao: number;
    tipo: string;
    usuario_id: number | null;
    registrado_em: string;
    detalhe: Record<string, unknown>;
  }>;
  ajuste_manual_fk: Array<{
    ajuste_id: number;
    motivo: string;
    valor_anterior: string;
    valor_novo: string;
    data_ajuste: string;
    usuario: { nome: string };
  }>;
};
export type OperationRequest = {
  etapa: Etapa;
  execucaoIds: number[];
  baseIds?: number[];
  recalcular?: boolean;
};
export type OperationPreview = {
  id: string;
  etapa: Etapa;
  recalcular: boolean;
  expiraEm: string;
  elegiveis: number;
  excluidos: number;
  items: Array<{
    baseId: number;
    execucaoId: number;
    nome: string;
    chapa: string;
    filial: string;
    competencia: string;
    reason: string;
    eventos: Array<{
      id: number;
      revisao: number;
      nome: string;
      evento: string;
      tipo: string;
      valor: string;
      operacao: string;
    }>;
  }>;
};
export const OperacaoApi = {
  controlQueue: (id: number, action: QueueAction) =>
    api.post(`/operacao/${id}/fila/${action}`) as Promise<{ message: string }>,
  employeeVariables: (id: number, base: number) =>
    api.get(`/operacao/${id}/pessoas/${base}/variaveis?incluirFalhas=1`) as Promise<{
      results: Array<{
        formula: { nome: string };
        memoria_calculo: ResultDetail["memoria_calculo"];
      }>;
      error: string | null;
    }>,
  sendScope: (execucaoIds: number[], baseIds?: number[]) =>
    api.post("/operacao/escopo-envio", { execucaoIds, baseIds }) as Promise<{
      eligible: number;
      excluded: Record<string, number>;
    }>,
  execute: (pedido: OperationRequest) => api.post("/operacao/executar", pedido) as Promise<{ status: boolean; message: string }>,
  summary: (periodo?: string) =>
    api.get(
      `/operacao${periodo ? `?periodo=${encodeURIComponent(periodo)}` : ""}`,
    ) as Promise<OperationSummary>,
  detail: (id: number, page: number, search: string, filter: string) =>
    api.get(
      `/operacao/${id}/pessoas?${new URLSearchParams({ pagina: String(page), busca: search, filtro: filter })}`,
    ) as Promise<OperationDetail>,
  result: (id: number, resultId: number) =>
    api.get(`/operacao/${id}/resultado/${resultId}`) as Promise<ResultDetail>,
  review: (id: number, resultId: number, revisao: number) =>
    api.post(`/operacao/${id}/resultado/${resultId}/conferir`, { revisao }),
  adjust: (
    id: number,
    resultId: number,
    revisao: number,
    valor: number,
    motivo: string,
  ) =>
    api.post(`/operacao/${id}/resultado/${resultId}/ajustar`, {
      revisao,
      valor,
      motivo,
    }),
  preview: (pedido: OperationRequest) =>
    api.post("/operacao/previa", pedido) as Promise<OperationPreview>,
  confirm: (id: string) =>
    api.post("/operacao/confirmar", { id }) as Promise<{
      status: boolean;
      message: string;
    }>,
};
