import { http } from "../../shared/lib/http";

export type FinanceiroGranularity = "day" | "week" | "month";

export type FinanceiroTimelineReport = {
  ok: true;
  range: { start: string; end: string; granularity: FinanceiroGranularity };
  filiaisOptions: Array<{ filialId: number; nome: string }>;
  totals: { pago: number; desconto: number; saldo: number; funcionarios: number };
  series: Array<{
    filialId: number;
    filialNome: string;
    labels: string[];
    pago: number[];
    desconto: number[];
    saldo: number[];
  }>;
  extras: {
    topEventos: Array<{ evento: string; pago: number; desconto: number; saldo: number }>;
  };
};

export class RelatoriosApi {
  public static async getFinanceiroTimeline(params: {
    startCompetencia: string; // MM/yyyy
    endCompetencia: string; // MM/yyyy
    filialIds?: number[];
    granularity?: "auto" | FinanceiroGranularity; // mantido por compatibilidade
  }): Promise<FinanceiroTimelineReport> {
    const q: Record<string, string> = {
      startCompetencia: params.startCompetencia,
      endCompetencia: params.endCompetencia,
      granularity: params.granularity ?? "auto",
    };
    if (params.filialIds && params.filialIds.length > 0) {
      q.filialIds = params.filialIds.join(",");
    }

    const resp = await http.get("/dash/reports/financeiro/timeline", { params: q });
    return resp.data as FinanceiroTimelineReport;
  }
}

