import { http } from "../../shared/lib/http";

export type DashSeverity = "info" | "warning" | "danger";

export type DashIndicator = {
  id: string;
  title: string;
  severity: DashSeverity;
  running: boolean;
  value: number;
  subtitle?: string | null;
  details?: unknown;
};

export type DashSummary = {
  periodos: Array<{ periodoId: number; competencia: string; ativo: boolean }>;
  filiais: Array<{ filialId: number; nome: string; ativa: boolean }>;
  selectedPeriodoId: number | null;
  selectedFilialId: number | null;
  hasRunning: boolean;
  indicators: DashIndicator[];
  charts: {
    execucoesPorStatus: { labels: string[]; values: number[] };
    filiaisProcessadasVsPendentes: {
      labels: string[];
      processed: number[];
      pending: number[];
    };
    execucoesPorDia: { labels: string[]; values: number[] };
    impactoFinanceiroRm?: {
      totals: {
        totalPago: number;
        totalDescontado: number;
        saldoLiquido: number;
        funcionariosEnviados: number;
        mediaPagoPorFuncionario: number;
        mediaDescontoPorFuncionario: number;
      };
      porEvento: { labels: string[]; pago: number[]; desconto: number[] };
      porFilial?: { labels: string[]; pago: number[]; desconto: number[] };
    };
  };
};

export class DashApi {
  public static async getSummary(
    periodoId?: number,
    filialId?: number,
    includeDetails = true,
  ): Promise<DashSummary> {
    const params: Record<string, string> = {};
    if (periodoId && Number.isFinite(periodoId) && periodoId > 0) {
      params.periodoId = String(periodoId);
    }
    if (filialId && Number.isFinite(filialId) && filialId > 0) {
      params.filialId = String(filialId);
    }

    if (!includeDetails) params.includeDetails = "0";
    const resp = await http.get("/dash/summary", { params });
    return resp.data as DashSummary;
  }
}

