import { http } from '../../shared/lib/http';
export type ReportOptions = {
  periodos: { periodo_id: number; competencia: string; ativo: boolean; data_inicio: string }[];
  filiais: { filial_id: number; nome: string; ativa: boolean }[];
};
export type ClosingCounts = { total: number; completos: number; parciais: number; semCalculo: number; comErro: number; aguardandoEnvio: number; enviados: number };
export type ClosingReport = ReportOptions & {
  periodo: number | null; updatedAt: string;
  rows: { filialId: number; filial: string; ativa: boolean; execucaoId: number | null; situacao: string; counts: ClosingCounts | null }[];
};
export type VariationRow = {
  key: string; nome: string; matricula: string; formula: string; tipo: string | null;
  anterior: string | null; atual: string | null; diferenca: string | null; percentual: string | null;
  situacao: string; observacao: string;
};
export type VariationReport = {
  periodo: string; anterior: string; filial: string; execucaoAtual: number | null; execucaoAnterior: number | null;
  rows: VariationRow[]; updatedAt: string;
};
export const OperationalReportsApi = {
  options: async () => (await http.get<ReportOptions>('/dash/reports/operacionais/opcoes')).data,
  closing: async (periodoId?: string) => (await http.get<ClosingReport>('/dash/reports/fechamento', {params:{periodoId:periodoId || undefined}})).data,
  variation: async (periodoId: number, anteriorId: number, filialId: number) =>
    (await http.get<VariationReport>('/dash/reports/variacao', {params:{periodoId,anteriorId,filialId}})).data,
};
