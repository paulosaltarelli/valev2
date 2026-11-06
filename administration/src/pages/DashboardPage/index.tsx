import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Modal, Spinner, Table } from "react-bootstrap";
import { Icon } from "@iconify/react";
import Select, { type SingleValue } from "../../shared/components/Select";
import {
  DashApi,
  type DashIndicator,
  type DashSummary,
} from "../../utils/api/dashApi";
import { Button } from "../../components/utils/Button";
import { Link, useNavigate } from "react-router";
import ReactECharts from "echarts-for-react";
import { useHtmlTheme } from "../../hooks/useHtmlTheme";
import { useAdaptivePolling } from "../../hooks/useAdaptivePolling";
import { Limited } from "../../components/utils/Limited";
import { FunctionsHelper } from "../../utils/functionsHelper";

import styles from "./styles.module.css";

type PeriodoOption = { label: string; value: number };
type FilialOption = { label: string; value: number | null };

type FilialPendenteRow = { filialId: number; nome: string };
type BaseErroRow = {
  execucaoId: number;
  filialId: number;
  filialNome: string | null;
  chapa: string;
  nome: string | null;
  status: string | null;
  updatedAt: string | null;
};
type ExecucaoQueueErroRow = {
  execucaoId: number;
  filialId: number;
  filialNome: string | null;
  tipo: string | null;
  status: string | null;
  updatedAt: string | null;
  chapa: string | null;
  nome: string | null;
  message: string;
};
type GeoErroRow = {
  geoQueueId: number;
  filialId: number;
  filialNome: string | null;
  chapa: string;
  status: string;
  updatedAt: string | null;
  message: string;
};

type ErrosDetails = {
  basesSample?: BaseErroRow[];
  execucaoQueueSample?: ExecucaoQueueErroRow[];
};

type GeoDetails = { days?: number; sample?: GeoErroRow[] };

type R066Row = {
  execucaoId: number;
  filialId: number;
  filialNome: string | null;
  chapa: string;
  nome: string | null;
  valor: number | null;
};

type KmMaxRow = {
  execucaoId: number;
  filialId: number;
  filialNome: string | null;
  chapa: string;
  nome: string | null;
  km: number | null;
  kmMax: number | null;
  updatedAt: string | null;
};

type ImpactoEventoRow = { label: string; pago: number; desconto: number };
type ImpactoExecucaoRow = {
  execucaoId: number;
  filialId: number;
  filialNome: string | null;
  pago: number;
  desconto: number;
  saldo: number;
  funcionarios: number;
};
type ImpactoDetails = {
  totals?: {
    totalPago?: number;
    totalDescontado?: number;
    saldoLiquido?: number;
    funcionariosEnviados?: number;
    mediaPagoPorFuncionario?: number;
    mediaDescontoPorFuncionario?: number;
  };
  porEvento?: ImpactoEventoRow[];
  porFilial?: ImpactoEventoRow[];
  execucoes?: ImpactoExecucaoRow[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return String(v);
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asFiliaisPendentesDetails(details: unknown): FilialPendenteRow[] {
  if (!Array.isArray(details)) return [];
  return details
    .map((row) => {
      if (!isRecord(row)) return null;
      const filialId = Number(row.filialId);
      const nome = toStringOrNull(row.nome);
      if (!Number.isFinite(filialId) || filialId <= 0 || !nome) return null;
      return { filialId, nome };
    })
    .filter(Boolean) as FilialPendenteRow[];
}

function asErrosDetails(details: unknown): ErrosDetails {
  if (!isRecord(details)) return {};
  const bases = Array.isArray(details.basesSample) ? details.basesSample : [];
  const execQueue = Array.isArray(details.execucaoQueueSample)
    ? details.execucaoQueueSample
    : [];

  const basesSample: BaseErroRow[] = bases
    .map((row) => {
      if (!isRecord(row)) return null;
      const execucaoId = Number(row.execucaoId);
      const filialId = Number(row.filialId);
      const chapa = toStringOrNull(row.chapa) ?? "";
      if (!Number.isFinite(execucaoId) || execucaoId <= 0) return null;
      if (!Number.isFinite(filialId) || filialId <= 0) return null;
      if (!chapa) return null;
      return {
        execucaoId,
        filialId,
        filialNome: toStringOrNull(row.filialNome),
        chapa,
        nome: toStringOrNull(row.nome),
        status: toStringOrNull(row.status),
        updatedAt: toStringOrNull(row.updatedAt),
      };
    })
    .filter(Boolean) as BaseErroRow[];

  const execucaoQueueSample: ExecucaoQueueErroRow[] = execQueue
    .map((row) => {
      if (!isRecord(row)) return null;
      const execucaoId = Number(row.execucaoId);
      const filialId = Number(row.filialId);
      if (!Number.isFinite(execucaoId) || execucaoId <= 0) return null;
      if (!Number.isFinite(filialId) || filialId <= 0) return null;
      return {
        execucaoId,
        filialId,
        filialNome: toStringOrNull(row.filialNome),
        tipo: toStringOrNull(row.tipo),
        status: toStringOrNull(row.status),
        updatedAt: toStringOrNull(row.updatedAt),
        chapa: toStringOrNull(row.chapa),
        nome: toStringOrNull(row.nome),
        message: String(row.message ?? "").trim(),
      };
    })
    .filter(Boolean) as ExecucaoQueueErroRow[];

  return { basesSample, execucaoQueueSample };
}

function asR066Details(details: unknown): R066Row[] {
  if (!Array.isArray(details)) return [];
  return details
    .map((row) => {
      if (!isRecord(row)) return null;
      const execucaoId = Number(row.execucaoId);
      const filialId = Number(row.filialId);
      const chapa = toStringOrNull(row.chapa) ?? "";
      if (!Number.isFinite(execucaoId) || execucaoId <= 0) return null;
      if (!Number.isFinite(filialId) || filialId <= 0) return null;
      if (!chapa) return null;
      return {
        execucaoId,
        filialId,
        filialNome: toStringOrNull(row.filialNome),
        chapa,
        nome: toStringOrNull(row.nome),
        valor: toNumberOrNull(row.valor),
      };
    })
    .filter(Boolean) as R066Row[];
}

function asKmMaxDetails(details: unknown): KmMaxRow[] {
  if (!Array.isArray(details)) return [];
  console.log("details", details);
  return details
    .map((row) => {
      if (!isRecord(row)) return null;
      const execucaoId = Number(row.execucaoId);
      const filialId = Number(row.filialId);
      const chapa = toStringOrNull(row.chapa) ?? "";
      if (!Number.isFinite(execucaoId) || execucaoId <= 0) return null;
      if (!Number.isFinite(filialId) || filialId <= 0) return null;
      if (!chapa) return null;
      return {
        execucaoId,
        filialId,
        filialNome: toStringOrNull(row.filialNome),
        chapa,
        nome: toStringOrNull(row.nome),
        km: toNumberOrNull(row.km),
        kmMax: toNumberOrNull(row.kmMax),
        updatedAt: toStringOrNull(row.updatedAt),
      };
    })
    .filter(Boolean) as KmMaxRow[];
}

function asGeoDetails(details: unknown): GeoDetails {
  if (!isRecord(details)) return {};
  const sampleRaw = Array.isArray(details.sample) ? details.sample : [];
  const sample: GeoErroRow[] = sampleRaw
    .map((row) => {
      if (!isRecord(row)) return null;
      const geoQueueId = Number(row.geoQueueId);
      const filialId = Number(row.filialId);
      const chapa = toStringOrNull(row.chapa) ?? "";
      const status = toStringOrNull(row.status) ?? "";
      if (!Number.isFinite(geoQueueId) || geoQueueId <= 0) return null;
      if (!Number.isFinite(filialId) || filialId <= 0) return null;
      if (!chapa || !status) return null;
      return {
        geoQueueId,
        filialId,
        filialNome: toStringOrNull(row.filialNome),
        chapa,
        status,
        updatedAt: toStringOrNull(row.updatedAt),
        message: String(row.message ?? "").trim(),
      };
    })
    .filter(Boolean) as GeoErroRow[];

  const days = Number(details.days);
  return {
    days: Number.isFinite(days) && days > 0 ? days : undefined,
    sample,
  };
}

function asImpactoDetails(details: unknown): ImpactoDetails {
  if (!isRecord(details)) return {};
  const totals = isRecord(details.totals) ? details.totals : {};
  const porEventoRaw = Array.isArray(details.porEvento)
    ? details.porEvento
    : [];
  const porFilialRaw = Array.isArray(details.porFilial)
    ? details.porFilial
    : [];
  const execucoesRaw = Array.isArray(details.execucoes)
    ? details.execucoes
    : [];

  const porEvento: ImpactoEventoRow[] = porEventoRaw
    .map((row) => {
      if (!isRecord(row)) return null;
      const label = toStringOrNull(row.label) ?? "—";
      const pago = toNumberOrNull(row.pago) ?? 0;
      const desconto = toNumberOrNull(row.desconto) ?? 0;
      return { label, pago, desconto };
    })
    .filter(Boolean) as ImpactoEventoRow[];

  const porFilial: ImpactoEventoRow[] = porFilialRaw
    .map((row) => {
      if (!isRecord(row)) return null;
      const label = toStringOrNull(row.label) ?? "—";
      const pago = toNumberOrNull(row.pago) ?? 0;
      const desconto = toNumberOrNull(row.desconto) ?? 0;
      return { label, pago, desconto };
    })
    .filter(Boolean) as ImpactoEventoRow[];

  const execucoes: ImpactoExecucaoRow[] = execucoesRaw
    .map((row) => {
      if (!isRecord(row)) return null;
      const execucaoId = Number(row.execucaoId);
      const filialId = Number(row.filialId);
      if (!Number.isFinite(execucaoId) || execucaoId <= 0) return null;
      if (!Number.isFinite(filialId) || filialId <= 0) return null;
      return {
        execucaoId,
        filialId,
        filialNome: toStringOrNull(row.filialNome),
        pago: toNumberOrNull(row.pago) ?? 0,
        desconto: toNumberOrNull(row.desconto) ?? 0,
        saldo: toNumberOrNull(row.saldo) ?? 0,
        funcionarios: toNumberOrNull(row.funcionarios) ?? 0,
      };
    })
    .filter(Boolean) as ImpactoExecucaoRow[];

  return {
    totals: {
      totalPago: toNumberOrNull(totals.totalPago) ?? 0,
      totalDescontado: toNumberOrNull(totals.totalDescontado) ?? 0,
      saldoLiquido: toNumberOrNull(totals.saldoLiquido) ?? 0,
      funcionariosEnviados: toNumberOrNull(totals.funcionariosEnviados) ?? 0,
      mediaPagoPorFuncionario:
        toNumberOrNull(totals.mediaPagoPorFuncionario) ?? 0,
      mediaDescontoPorFuncionario:
        toNumberOrNull(totals.mediaDescontoPorFuncionario) ?? 0,
    },
    porEvento,
    porFilial,
    execucoes,
  };
}

function severityToBootstrapVariant(sev: DashIndicator["severity"]) {
  switch (sev) {
    case "danger":
      return "danger";
    case "warning":
      return "warning";
    default:
      return "primary";
  }
}

function severityToBgClass(sev: DashIndicator["severity"]) {
  switch (sev) {
    case "danger":
      return "bg-danger bg-opacity-10 border-danger";
    case "warning":
      return "bg-warning bg-opacity-10 border-warning";
    default:
      return "bg-primary bg-opacity-10 border-primary";
  }
}

function severityLabelPtBr(sev: DashIndicator["severity"]) {
  switch (sev) {
    case "danger":
      return "Crítico";
    case "warning":
      return "Atenção";
    default:
      return "OK";
  }
}

function statusBadge(text: string | null | undefined) {
  const t = String(text ?? "").trim();
  if (!t || t === "—") return <span className="text-secondary">—</span>;
  const upper = t.toUpperCase();
  const bg =
    upper.includes("ERRO") ||
    upper.includes("CRÍTICO") ||
    upper.includes("CRITICO")
      ? "danger"
      : upper.includes("ANDAMENTO") || upper.includes("PROCESS")
        ? "warning"
        : "secondary";
  return (
    <Badge bg={bg} className="fw-semibold">
      {t}
    </Badge>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashSummary | null>(null);
  const [selectedPeriodoId, setSelectedPeriodoId] = useState<number | null>(
    null,
  );
  const [selectedFilialId, setSelectedFilialId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const htmlTheme = useHtmlTheme();

  // Hook simples para permitir (no futuro) que o próprio Dashboard marque “estou processando”
  // e acelere o polling sem depender do backend.
  const [localRunning] = useState(false);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [activeIndicatorId, setActiveIndicatorId] = useState<string | null>(
    null,
  );

  const fetchSummary = useCallback(
    async (pid?: number | null, fid?: number | null) => {
      setError(null);
      const data = await DashApi.getSummary(pid ?? undefined, fid ?? undefined);
      setSummary(data);
      setSelectedPeriodoId(data.selectedPeriodoId);
      setSelectedFilialId(data.selectedFilialId);
      return data;
    },
    [],
  );

  // Carga inicial
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchSummary(null, null);
        if (!alive) return;
        setSummary(data);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchSummary]);

  const anyIndicatorRunning = (summary?.indicators ?? []).some((i) =>
    Boolean(i.running),
  );
  const isRunning =
    Boolean(summary?.hasRunning) || anyIndicatorRunning || localRunning;

  // Polling adaptativo (20s se tiver rodando, senão 60s) — em hook reutilizável
  useAdaptivePolling({
    enabled: Boolean(summary),
    isRunning,
    onTick: async () => {
      await fetchSummary(selectedPeriodoId, selectedFilialId);
    },
    fastMs: 20_000,
    slowMs: 60_000,
  });

  const periodoOptions: PeriodoOption[] = useMemo(() => {
    const parseCompetenciaToKey = (competencia: unknown): number => {
      const c = String(competencia ?? "").trim();
      // Formato esperado: MM/YYYY
      let m = c.match(/^(\d{2})\/(\d{4})$/);
      if (m) {
        const mm = Number(m[1]);
        const yyyy = Number(m[2]);
        if (mm >= 1 && mm <= 12 && Number.isFinite(yyyy)) return yyyy * 12 + mm;
      }
      // Fallback comum: YYYY-MM
      m = c.match(/^(\d{4})-(\d{2})$/);
      if (m) {
        const yyyy = Number(m[1]);
        const mm = Number(m[2]);
        if (mm >= 1 && mm <= 12 && Number.isFinite(yyyy)) return yyyy * 12 + mm;
      }
      return Number.MAX_SAFE_INTEGER;
    };

    return (summary?.periodos ?? [])
      .slice()
      .sort((a, b) => {
        const ka = parseCompetenciaToKey(a.competencia);
        const kb = parseCompetenciaToKey(b.competencia);
        if (ka !== kb) return kb - ka; // <-- decrescente
        // desempate
        const ca = String(a.competencia ?? "");
        const cb = String(b.competencia ?? "");
        const byComp = cb.localeCompare(ca);
        if (byComp !== 0) return byComp;
        return Number(b.periodoId) - Number(a.periodoId);
      })
      .map((p) => ({
        value: p.periodoId,
        label: `${p.competencia}${p.ativo ? "" : "(inativo)"}`,
      }));
  }, [summary?.periodos]);

  const selectedPeriodoOption = useMemo(() => {
    if (!selectedPeriodoId) return null;
    return periodoOptions.find((o) => o.value === selectedPeriodoId) ?? null;
  }, [periodoOptions, selectedPeriodoId]);

  const filialOptions: FilialOption[] = useMemo(() => {
    const opts: FilialOption[] = [{ label: "Todas as filiais", value: null }];
    for (const f of summary?.filiais ?? []) {
      opts.push({ label: f.nome, value: f.filialId });
    }
    return opts;
  }, [summary?.filiais]);

  const selectedFilialOption = useMemo(() => {
    return filialOptions.find((o) => o.value === selectedFilialId) ?? null;
  }, [filialOptions, selectedFilialId]);

  const indicatorsById = useMemo(() => {
    const map = new Map<string, DashIndicator>();
    for (const i of summary?.indicators ?? []) map.set(i.id, i);
    return map;
  }, [summary?.indicators]);

  const filiaisPendentes = indicatorsById.get("filiais_pendentes_periodo");
  const errosNaoResolvidos = indicatorsById.get("erros_nao_resolvidos");
  const alertaR066 = indicatorsById.get("alerta_r066_fora_faixa");
  const geoErros = indicatorsById.get("geo_erros_ultimos_dias");
  const kmMaxAcimaLimite = indicatorsById.get("km_max_acima_limite");
  const rodando = indicatorsById.get("processamentos_rodando");
  const impactoRm = indicatorsById.get("impacto_financeiro_rm");

  const brl = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      }),
    [],
  );

  const pieOption = useMemo(() => {
    const labels = summary?.charts.execucoesPorStatus.labels ?? [];
    const values = summary?.charts.execucoesPorStatus.values ?? [];

    const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();
    const isFinalizada = (l: string) => norm(l) === "FINALIZADA";
    const otherLabels = labels.filter((l) => !isFinalizada(l));
    const redShade = (idxAmongOthers: number, totalOthers: number) => {
      if (totalOthers <= 1) return "#ef4444";
      const lightness = 38 + (idxAmongOthers * (72 - 38)) / (totalOthers - 1);
      return `hsl(0 85% ${lightness}%)`;
    };
    let otherIdx = 0;

    return {
      tooltip: { trigger: "item" },
      legend: { top: 0, left: "center" },
      series: [
        {
          name: "Execuções",
          type: "pie",
          radius: ["45%", "70%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: "bold" } },
          data: labels.map((l, idx) => {
            const value = values[idx] ?? 0;
            if (isFinalizada(l)) {
              return { name: l, value, itemStyle: { color: "#22c55e" } };
            }
            const color = redShade(otherIdx++, otherLabels.length);
            return { name: l, value, itemStyle: { color } };
          }),
        },
      ],
    };
  }, [
    summary?.charts.execucoesPorStatus.labels,
    summary?.charts.execucoesPorStatus.values,
  ]);

  const barOption = useMemo(() => {
    const processed =
      summary?.charts.filiaisProcessadasVsPendentes.processed?.[0] ?? 0;
    const pending =
      summary?.charts.filiaisProcessadasVsPendentes.pending?.[0] ?? 0;
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0 },
      xAxis: { type: "category", data: ["Filiais"] },
      yAxis: { type: "value" },
      series: [
        { name: "Processadas", type: "bar", stack: "total", data: [processed], itemStyle: { color: "#22c55e" } },
        { name: "Pendentes", type: "bar", stack: "total", data: [pending], itemStyle: { color: "#ef4444" } },
      ],
    };
  }, [
    summary?.charts.filiaisProcessadasVsPendentes.processed,
    summary?.charts.filiaisProcessadasVsPendentes.pending,
  ]);

  const impactoEventoOption = useMemo(() => {
    const labels = summary?.charts.impactoFinanceiroRm?.porEvento.labels ?? [];
    const pago = summary?.charts.impactoFinanceiroRm?.porEvento.pago ?? [];
    const desconto =
      summary?.charts.impactoFinanceiroRm?.porEvento.desconto ?? [];
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v: number) => brl.format(Number(v ?? 0)),
      },
      legend: { top: 0 },
      grid: { left: 10, right: 10, bottom: 10, top: 30, containLabel: true },
      xAxis: { type: "value" },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: { width: 120, overflow: "truncate" },
      },
      series: [
        {
          name: "Pago ao funcionário",
          type: "bar",
          stack: "total",
          data: pago,
          itemStyle: { color: "#458eff" },
        },
        {
          name: "Desconto (economia)",
          type: "bar",
          stack: "total",
          data: desconto,
          itemStyle: { color: "#22c55e" },
        },
      ],
    };
  }, [brl, summary?.charts.impactoFinanceiroRm?.porEvento]);

  const impactoFilialOption = useMemo(() => {
    const labels = summary?.charts.impactoFinanceiroRm?.porFilial?.labels ?? [];
    const pago = summary?.charts.impactoFinanceiroRm?.porFilial?.pago ?? [];
    const desconto =
      summary?.charts.impactoFinanceiroRm?.porFilial?.desconto ?? [];
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v: number) => brl.format(Number(v ?? 0)),
      },
      legend: { top: 0 },
      grid: { left: 10, right: 10, bottom: 10, top: 30, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { interval: 0, rotate: 25 },
      },
      yAxis: { type: "value" },
      series: [
        {
          name: "Pago ao funcionário",
          type: "bar",
          stack: "total",
          data: pago,
          itemStyle: { color: "#458eff" },
        },
        {
          name: "Desconto (economia)",
          type: "bar",
          stack: "total",
          data: desconto,
          itemStyle: { color: "#22c55e" },
        },
      ],
    };
  }, [brl, summary?.charts.impactoFinanceiroRm?.porFilial]);

  const handlePeriodoChange = async (opt: SingleValue<PeriodoOption>) => {
    const pid = opt?.value ?? null;
    setSelectedPeriodoId(pid);
    try {
      setLoading(true);
      await fetchSummary(pid, selectedFilialId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleFilialChange = async (opt: SingleValue<FilialOption>) => {
    const fid = opt?.value ?? null;
    setSelectedFilialId(fid);
    try {
      setLoading(true);
      await fetchSummary(selectedPeriodoId, fid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const openDetails = (id: string) => {
    setActiveIndicatorId(id);
    setShowDetailsModal(true);
  };

  const activeIndicator = activeIndicatorId
    ? indicatorsById.get(activeIndicatorId)
    : null;
  const activeDetails: unknown = activeIndicator?.details ?? null;

  return (
    <div className="card">
      <div className="card-body">
        <div className={styles.dashHeaderContainer}>
          <div className="d-flex align-items-center justify-content-between  flex-wrap gap-2 mb-3">
            <div className="d-flex align-items-center gap-2">
              <h1 className="h4 m-0 p-0 d-flex align-items-center gap-2">
                Dashboard
                {/* {isRunning && (
                <Badge bg="warning" className="fw-semibold">
                  Atualização rápida
                </Badge>
              )} */}
              </h1>
            </div>

            <div className="d-flex align-items-center gap-2 flex-wrap">
              <div style={{ minWidth: 240 }}>
                <Select
                  value={selectedPeriodoOption}
                  options={periodoOptions}
                  placeholder="Selecione o período"
                  onChange={handlePeriodoChange}
                  isClearable={false}
                />
              </div>
              <div style={{ minWidth: 260 }}>
                <Select
                  value={selectedFilialOption}
                  options={filialOptions}
                  placeholder="Todas as filiais"
                  onChange={handleFilialChange}
                  isClearable={false}
                />
              </div>
              <Button
                variant="outline-secondary"
                onClick={async () => {
                  try {
                    setLoading(true);
                    await fetchSummary(selectedPeriodoId, selectedFilialId);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <Icon icon="solar:refresh-linear" width={20} height={20} />
                <span className="ms-1">Atualizar</span>
              </Button>
            </div>
          </div>
          {/* <hr className="mb-1" /> */}
        </div>

        {error && (
          <Alert variant="danger" className="mb-3">
            <div className="d-flex align-items-center gap-2">
              <Icon icon="solar:danger-circle-linear" width={20} height={20} />
              <span>Erro ao carregar o painel: {error}</span>
            </div>
          </Alert>
        )}

        {loading && !summary ? (
          <div className="d-flex align-items-center gap-2 text-secondary">
            <Spinner animation="border" size="sm" />
            <span>Carregando indicadores…</span>
          </div>
        ) : (
          <>
            <div className="row g-3 mb-3">
              {[filiaisPendentes, errosNaoResolvidos, alertaR066, rodando]
                .filter(Boolean)
                .map((ind) => {
                  const i = ind as DashIndicator;
                  return (
                    <div className="col-12 col-md-6 col-xl-3" key={i.id}>
                      <div
                        className={`card h-100 border ${severityToBgClass(i.severity)}`}
                      >
                        <div className="card-body">
                          <div className="d-flex align-items-start justify-content-between gap-2">
                            <div>
                              <div className="text-secondary small">
                                {i.title}
                              </div>
                              <div className="d-flex align-items-end gap-2 mt-1">
                                <div className="h3 m-0">{i.value}</div>
                                {i.running && (
                                  <Badge bg="warning" className="fw-semibold">
                                    em andamento
                                  </Badge>
                                )}
                              </div>
                              {i.subtitle && (
                                <div className="text-secondary small mt-1">
                                  <Limited limit={60} tooltip>
                                    {i.subtitle}
                                  </Limited>
                                </div>
                              )}
                            </div>

                            <Badge
                              bg={severityToBootstrapVariant(i.severity)}
                              className="fw-semibold"
                            >
                              {severityLabelPtBr(i.severity)}
                            </Badge>
                          </div>

                          <div className="mt-2 d-flex justify-content-end">
                            {i.id !== "processamentos_rodando" && (
                              <Button
                                variant="link"
                                className="p-0 text-decoration-none"
                                onClick={() => openDetails(i.id)}
                              >
                                Ver detalhes
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="row g-3">
              <div className="col-12 col-xl-6">
                <div className="card h-100">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <h2 className="h6 m-0">Ações rápidas</h2>
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <Link
                        to={`/processamento?periodo=${selectedPeriodoId ?? ""}&filial=${selectedFilialId ?? ""}`}
                        className="text-decoration-none"
                      >
                        <div className="d-flex align-items-center justify-content-between p-2 border rounded">
                          <div className="d-flex align-items-center gap-2">
                            <Icon
                              icon="solar:diagram-up-bold-duotone"
                              width={20}
                              height={20}
                            />
                            <span>Ir para Processamentos</span>
                          </div>
                          <Icon
                            icon="solar:alt-arrow-right-linear"
                            width={18}
                            height={18}
                          />
                        </div>
                      </Link>
                      <Link to="/gestao-km" className="text-decoration-none">
                        <div className="d-flex align-items-center justify-content-between p-2 border rounded">
                          <div className="d-flex align-items-center gap-2">
                            <Icon
                              icon="solar:map-point-bold-duotone"
                              width={20}
                              height={20}
                            />
                            <span>Ir para Gestão de Km</span>
                          </div>
                          <Icon
                            icon="solar:alt-arrow-right-linear"
                            width={18}
                            height={18}
                          />
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-xl-6">
                <div className="card h-100">
                  <div className="card-body">
                    <h2 className="h6 m-0 mb-2">Resumo</h2>
                    <div className="text-secondary small mb-2">
                      Selecione o período para ver pendências e alertas.
                    </div>
                    <div className="d-flex flex-column gap-2">
                      {(summary?.indicators ?? []).map((i) => (
                        <div
                          className="d-flex align-items-center justify-content-between border rounded p-2"
                          key={i.id}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-semibold">{i.title}</span>
                            {i.subtitle ? (
                              <span className="text-secondary small">
                                — {i.subtitle}
                              </span>
                            ) : null}
                          </div>
                          <Badge
                            bg={severityToBootstrapVariant(i.severity)}
                            className="fw-semibold"
                          >
                            {i.value}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-xl-4">
                <div className="card h-100">
                  <div className="card-body">
                    <h2 className="h6 m-0 mb-2">Execuções por status</h2>
                    <div style={{ height: 280 }}>
                      <ReactECharts
                        option={pieOption}
                        style={{ height: "100%", width: "100%" }}
                        theme={htmlTheme === "dark" ? "dark" : undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-xl-4">
                <div className="card h-100">
                  <div className="card-body">
                    <h2 className="h6 m-0 mb-2">
                      Filiais processadas vs pendentes
                    </h2>
                    <div style={{ height: 280 }}>
                      <ReactECharts
                        option={barOption}
                        style={{ height: "100%", width: "100%" }}
                        theme={htmlTheme === "dark" ? "dark" : undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-xl-4">
                <div
                  className={`card h-100 border ${
                    kmMaxAcimaLimite
                      ? severityToBgClass(kmMaxAcimaLimite.severity)
                      : ""
                  }`}
                >
                  <div className="card-body">
                    <div className="d-flex align-items-start justify-content-between gap-2">
                      <div>
                        <div className="text-secondary small">
                          {kmMaxAcimaLimite?.title ?? "KM acima do limite"}
                        </div>
                        <div className="d-flex align-items-end gap-2 mt-1">
                          <div className="h3 m-0">
                            {kmMaxAcimaLimite?.value ?? 0}
                          </div>
                        </div>
                        {kmMaxAcimaLimite?.subtitle && (
                          <div className="text-secondary small mt-1">
                            <Limited limit={60} tooltip>
                              {kmMaxAcimaLimite.subtitle}
                            </Limited>
                          </div>
                        )}
                      </div>

                      <Badge
                        bg={severityToBootstrapVariant(
                          kmMaxAcimaLimite?.severity ?? "info",
                        )}
                        className="fw-semibold"
                      >
                        {severityLabelPtBr(kmMaxAcimaLimite?.severity ?? "info")}
                      </Badge>
                    </div>

                    <div className="mt-2 d-flex justify-content-end">
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        disabled={!kmMaxAcimaLimite}
                        onClick={() => kmMaxAcimaLimite && openDetails(kmMaxAcimaLimite.id)}
                      >
                        Ver detalhes
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12">
                <div className="card">
                  <div className="card-body">
                    <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                      <div>
                        <h2 className="h6 m-0">
                          Impacto financeiro (enviado ao RM)
                        </h2>
                        <div className="text-secondary small mt-1">
                          Considera apenas fórmulas do tipo{" "}
                          <strong>Valor (V)</strong> e funcionários com status{" "}
                          <strong>Enviado para RM</strong>.
                        </div>
                      </div>
                      {impactoRm && (
                        <Button
                          variant="outline-secondary"
                          onClick={() => openDetails("impacto_financeiro_rm")}
                        >
                          Ver detalhes
                        </Button>
                      )}
                    </div>

                    {summary?.charts.impactoFinanceiroRm ? (
                      <>
                        <div className="row g-3 mb-3">
                          <div className="col-12 col-md-4">
                            <div className="border rounded p-3 h-100">
                              <div className="d-flex align-items-center justify-content-between">
                                <div className="text-secondary small">
                                  Pago ao funcionário (+)
                                </div>
                                <Badge bg="primary" className="fw-semibold">
                                  Pago
                                </Badge>
                              </div>
                              <div className="h4 m-0 mt-1">
                                {brl.format(
                                  summary.charts.impactoFinanceiroRm.totals
                                    .totalPago ?? 0,
                                )}
                              </div>
                              <div className="text-secondary small mt-1">
                                Média por funcionário:{" "}
                                <span className="fw-semibold">
                                  {brl.format(
                                    summary.charts.impactoFinanceiroRm.totals
                                      .mediaPagoPorFuncionario ?? 0,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="col-12 col-md-4">
                            <div className="border rounded p-3 h-100">
                              <div className="d-flex align-items-center justify-content-between">
                                <div className="text-secondary small">
                                  Desconto do funcionário (-) (economia)
                                </div>
                                <Badge bg="success" className="fw-semibold">
                                  Economia
                                </Badge>
                              </div>
                              <div className="h4 m-0 mt-1">
                                {brl.format(
                                  summary.charts.impactoFinanceiroRm.totals
                                    .totalDescontado ?? 0,
                                )}
                              </div>
                              <div className="text-secondary small mt-1">
                                Média por funcionário:{" "}
                                <span className="fw-semibold">
                                  {brl.format(
                                    summary.charts.impactoFinanceiroRm.totals
                                      .mediaDescontoPorFuncionario ?? 0,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="col-12 col-md-4">
                            <div className="border rounded p-3 h-100">
                              <div className="d-flex align-items-center justify-content-between">
                                <div className="text-secondary small">
                                  Saldo líquido
                                </div>
                                <Badge bg="secondary" className="fw-semibold">
                                  Saldo
                                </Badge>
                              </div>
                              <div className="h4 m-0 mt-1">
                                {brl.format(
                                  summary.charts.impactoFinanceiroRm.totals
                                    .saldoLiquido ?? 0,
                                )}
                              </div>
                              <div className="text-secondary small mt-1">
                                Funcionários enviados:{" "}
                                <span className="fw-semibold">
                                  {summary.charts.impactoFinanceiroRm.totals
                                    .funcionariosEnviados ?? 0}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="row g-3">
                          <div className="col-12 col-xl-6">
                            <div className="border rounded p-2 h-100">
                              <div className="d-flex align-items-center justify-content-between px-1 pt-1">
                                <div className="fw-semibold">
                                  Por evento (top 12)
                                </div>
                                <span className="text-secondary small">
                                  Comparativo
                                </span>
                              </div>
                              <div style={{ height: 320 }}>
                                <ReactECharts
                                  option={impactoEventoOption}
                                  style={{ height: "100%", width: "100%" }}
                                  theme={
                                    htmlTheme === "dark" ? "dark" : undefined
                                  }
                                />
                              </div>
                            </div>
                          </div>
                          <div className="col-12 col-xl-6">
                            <div className="border rounded p-2 h-100">
                              <div className="d-flex align-items-center justify-content-between px-1 pt-1">
                                <div className="fw-semibold">
                                  Por filial (top 12)
                                </div>
                                <span className="text-secondary small">
                                  {selectedFilialId
                                    ? "Disponível em 'Todas as filiais'"
                                    : "Pago vs Desconto"}
                                </span>
                              </div>
                              <div style={{ height: 320 }}>
                                {selectedFilialId ? (
                                  <div className="h-100 d-flex align-items-center justify-content-center text-secondary">
                                    Selecione{" "}
                                    <strong>“Todas as filiais”</strong> para ver
                                    este gráfico.
                                  </div>
                                ) : (
                                  <ReactECharts
                                    option={impactoFilialOption}
                                    style={{ height: "100%", width: "100%" }}
                                    theme={
                                      htmlTheme === "dark" ? "dark" : undefined
                                    }
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-secondary">
                        Sem dados suficientes para calcular o impacto financeiro
                        neste período.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-12">
                <div className="card">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <div>
                        <h2 className="h6 m-0">GEO</h2>
                        <div className="text-secondary small mt-1">
                          {geoErros?.subtitle ??
                            "Indicadores e detalhes do GEO (em breve)."}
                        </div>
                      </div>

                      <div className="d-flex align-items-center gap-2">
                        <Badge
                          bg={severityToBootstrapVariant(
                            geoErros?.severity ?? "info",
                          )}
                          className="fw-semibold"
                        >
                          {geoErros ? `${geoErros.value} erros (7 dias)` : "—"}
                        </Badge>
                        {geoErros && (
                          <Button
                            variant="outline-secondary"
                            onClick={() =>
                              openDetails("geo_erros_ultimos_dias")
                            }
                          >
                            Ver detalhes
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Modal
              show={showDetailsModal}
              onHide={() => setShowDetailsModal(false)}
              size="xl"
              centered
            >
              <Modal.Header closeButton>
                <Modal.Title>
                  {activeIndicator?.title ?? "Detalhes"}
                </Modal.Title>
              </Modal.Header>
              <Modal.Body>
                {!activeIndicator ? (
                  <div className="text-secondary">
                    Nenhum detalhe disponível.
                  </div>
                ) : activeIndicatorId === "filiais_pendentes_periodo" ? (
                  <>
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <div className="text-secondary small">
                        Filiais que ainda não finalizaram o período selecionado.
                      </div>
                      <Link
                        to={`/processamento?periodo=${selectedPeriodoId ?? ""}&filial=${selectedFilialId ?? ""}`}
                        className="text-decoration-none"
                      >
                        Ir para Processamentos
                      </Link>
                    </div>
                    <Table
                      responsive
                      striped
                      bordered
                      hover
                      size="sm"
                      className="table striped-table align-middle table-responsive table-bordered table-hover mb-0 fs-10 w-100"
                    >
                      <thead>
                        <tr>
                          <th>Filial</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asFiliaisPendentesDetails(activeDetails).map((f) => (
                          <tr key={String(f.filialId)}>
                            <td>{f.nome}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </>
                ) : activeIndicatorId === "erros_nao_resolvidos" ? (
                  <>
                    {(() => {
                      const d = asErrosDetails(activeDetails);
                      return (
                        <>
                          <div className="mb-3">
                            <div className="d-flex align-items-center justify-content-between gap-2">
                              <h3 className="h6 m-0">Funcionários com erro</h3>
                              <Link
                                to={`/processamento?periodo=${selectedPeriodoId ?? ""}&filial=${selectedFilialId ?? ""}`}
                                className="text-decoration-none"
                              >
                                Ir para Processamentos
                              </Link>
                            </div>
                            <div className="text-secondary small">
                              Amostra dos últimos registros com erro no período
                              selecionado.
                            </div>
                            <Table
                              responsive
                              striped
                              bordered
                              hover
                              size="sm"
                              className="mt-2 table striped-table align-middle table-responsive table-bordered table-hover mb-0 fs-10 w-100"
                            >
                              <thead>
                                <tr>
                                  <th>Processamento</th>
                                  <th>Filial</th>
                                  <th>Chapa</th>
                                  <th>Nome</th>
                                  <th>Status</th>
                                  <th className="text-center">Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(d.basesSample ?? []).map((r, idx) => (
                                  <tr key={`${r.execucaoId}-${idx}`}>
                                    <td className="text-nowrap">
                                      #{r.execucaoId}
                                    </td>
                                    <td>{r.filialNome ?? r.filialId}</td>
                                    <td>{r.chapa}</td>
                                    <td>{r.nome ?? "—"}</td>
                                    <td>{statusBadge(r.status)}</td>
                                    <td className="text-center text-nowrap">
                                      <Button
                                        variant="outline-primary"
                                        size="sm"
                                        tooltip="Abrir processamento"
                                        className="px-2 py-1"
                                        onClick={() =>
                                          navigate(
                                            `/processamento/${r.execucaoId}`,
                                          )
                                        }
                                      >
                                        <Icon
                                          icon="solar:eye-bold"
                                          width={16}
                                          height={16}
                                        />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>

                          <div>
                            <h3 className="h6 m-0">
                              Fila de execução com erro
                            </h3>
                            <div className="text-secondary small">
                              Itens da fila de execução com mensagem registrada
                              (período selecionado).
                            </div>
                            <Table
                              responsive
                              striped
                              bordered
                              hover
                              size="sm"
                              className="table striped-table align-middle table-responsive table-bordered table-hover mt-2 fs-10 w-100"
                            >
                              <thead>
                                <tr>
                                  <th>Processamento</th>
                                  <th>Filial</th>
                                  <th>Etapa</th>
                                  <th>Chapa</th>
                                  <th>Mensagem</th>
                                  <th className="text-center">Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(d.execucaoQueueSample ?? []).map((r, idx) => (
                                  <tr key={`${r.execucaoId}-${idx}`}>
                                    <td className="text-nowrap">
                                      #{r.execucaoId}
                                    </td>
                                    <td>{r.filialNome ?? r.filialId}</td>
                                    <td>{statusBadge(r.tipo)}</td>
                                    <td>{r.chapa ?? "—"}</td>
                                    <td>
                                      <Limited
                                        limit={80}
                                        tooltip
                                        popover
                                        placement="left"
                                        trigger="click"
                                      >
                                        {r.message}
                                      </Limited>
                                    </td>
                                    <td className="text-center text-nowrap">
                                      <Button
                                        variant="outline-primary"
                                        size="sm"
                                        tooltip="Abrir processamento"
                                        className="px-2 py-1"
                                        onClick={() =>
                                          navigate(
                                            `/processamento/${r.execucaoId}`,
                                          )
                                        }
                                      >
                                        <Icon
                                          icon="solar:eye-bold"
                                          width={16}
                                          height={16}
                                        />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        </>
                      );
                    })()}
                  </>
                ) : activeIndicatorId === "km_max_acima_limite" ? (
                  <>
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <div className="text-secondary small">
                        Funcionários com KM calculado acima do limite (km_max) da
                        filial, no período selecionado.
                      </div>
                      <Link
                        to={`/processamento?periodo=${selectedPeriodoId ?? ""}&filial=${selectedFilialId ?? ""}`}
                        className="text-decoration-none"
                      >
                        Ir para Processamentos
                      </Link>
                    </div>
                    <Table
                      responsive
                      striped
                      bordered
                      hover
                      size="sm"
                      className="table striped-table align-middle table-responsive table-bordered table-hover mb-0 fs-10 w-100"
                    >
                      <thead>
                        <tr>
                          <th>Processamento</th>
                          <th>Filial</th>
                          <th>Chapa</th>
                          <th>Nome</th>
                          <th className="text-nowrap">KM</th>
                          <th className="text-nowrap">Limite</th>
                          <th className="text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asKmMaxDetails(activeDetails).map((r, idx) => (
                          <tr key={`${r.execucaoId}-${idx}`}>
                            <td className="text-nowrap">#{r.execucaoId}</td>
                            <td><Limited limit={20} tooltip trigger="click">{r.filialNome ?? r.filialId}</Limited></td>
                            <td>{r.chapa}</td>
                            <td><Limited limit={20} tooltip trigger="click">{r.nome ?? "—"}</Limited></td>
                            <td className="text-nowrap">
                              {r.km !== null
                                ? `${Number(r.km)
                                    .toFixed(2)
                                    .replace(".", ",")} km`
                                : "—"}
                            </td>
                            <td className="text-nowrap">
                              {r.kmMax !== null
                                ? `${Number(r.kmMax)
                                    .toFixed(2)
                                    .replace(".", ",")} km`
                                : "—"}
                            </td>
                            <td className="text-center text-nowrap">
                              <Button
                                variant="link"
                                size="sm"
                                tooltip="Abrir processamento"
                                className="px-2 py-1 border-0"
                                onClick={() =>
                                  navigate(`/processamento/${r.execucaoId}`)
                                }
                              >
                                <Icon
                                  icon="solar:eye-bold"
                                  width={16}
                                  height={16}
                                />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </>
                ) : activeIndicatorId === "alerta_r066_fora_faixa" ? (
                  <>
                    <div className="text-secondary small mb-2">
                      Valores do evento R066 (tipo V) fora da faixa configurada.
                    </div>
                    <Table
                      responsive
                      striped
                      bordered
                      hover
                      size="sm"
                      className="table striped-table align-middle table-responsive table-bordered table-hover mb-0 fs-10 w-100"
                    >
                      <thead>
                        <tr>
                          <th>Processamento</th>
                          <th>Filial</th>
                          <th>Chapa</th>
                          <th>Nome</th>
                          <th>Valor</th>
                          <th className="text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asR066Details(activeDetails).map((r, idx) => (
                          <tr key={`${r.execucaoId}-${idx}`}>
                            <td className="text-nowrap">#{r.execucaoId}</td>
                            <td>
                              <Limited limit={10} tooltip>
                                {r.filialNome ?? r.filialId}
                              </Limited>
                            </td>
                            <td>{r.chapa}</td>
                            <td>
                              <Limited limit={20} tooltip>
                                {r.nome ?? "—"}
                              </Limited>
                            </td>
                            <td>
                              {r.valor === null ? (
                                <span className="text-secondary">—</span>
                              ) : (
                                <Badge bg="danger" className="fw-semibold">
                                  {r.valor}
                                </Badge>
                              )}
                            </td>
                            <td className="text-center text-nowrap">
                              <Button
                                variant="link"
                                size="sm"
                                tooltip="Abrir processamento"
                                className="p-0 border-0"
                                onClick={() =>
                                  navigate(`/processamento/${r.execucaoId}`)
                                }
                              >
                                <Icon
                                  icon="solar:eye-bold"
                                  width={16}
                                  height={16}
                                />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </>
                ) : activeIndicatorId === "geo_erros_ultimos_dias" ? (
                  <>
                    {(() => {
                      const d = asGeoDetails(activeDetails);
                      return (
                        <>
                          <div className="text-secondary small mb-2">
                            Erros recentes do GEO (últimos {d.days ?? 7} dias).
                          </div>
                          <Table
                            responsive
                            striped
                            bordered
                            hover
                            size="sm"
                            className="table striped-table align-middle table-responsive table-bordered table-hover mb-0 fs-10 w-100"
                          >
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Filial</th>
                                <th>Chapa</th>
                                <th>Status</th>
                                <th>Mensagem</th>
                                <th className="text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(d.sample ?? []).map((r, idx) => (
                                <tr key={`${r.geoQueueId}-${idx}`}>
                                  <td className="text-nowrap">
                                    {FunctionsHelper.formatDateTimePtBr(
                                      r.updatedAt,
                                    )}
                                  </td>
                                  <td>{r.filialNome ?? r.filialId}</td>
                                  <td>{r.chapa}</td>
                                  <td>{statusBadge(r.status)}</td>
                                  <td>
                                    <Limited
                                      limit={80}
                                      tooltip
                                      popover
                                      placement="left"
                                      trigger="click"
                                    >
                                      {r.message}
                                    </Limited>
                                  </td>
                                  <td className="text-center text-nowrap">
                                    <Button
                                      variant="outline-secondary"
                                      size="sm"
                                      tooltip="Abrir Gestão de Km"
                                      className="px-2 py-1"
                                      onClick={() => navigate("/gestao-km")}
                                    >
                                      <Icon
                                        icon="solar:map-point-bold"
                                        width={16}
                                        height={16}
                                      />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </>
                      );
                    })()}
                  </>
                ) : activeIndicatorId === "impacto_financeiro_rm" ? (
                  <>
                    {(() => {
                      const d = asImpactoDetails(activeDetails);
                      return (
                        <>
                          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                            <Badge bg="primary" className="fw-semibold">
                              Pago: {brl.format(d.totals?.totalPago ?? 0)}
                            </Badge>
                            <Badge bg="success" className="fw-semibold">
                              Desconto (economia):{" "}
                              {brl.format(d.totals?.totalDescontado ?? 0)}
                            </Badge>
                            <Badge bg="secondary" className="fw-semibold">
                              Saldo líquido:{" "}
                              {brl.format(d.totals?.saldoLiquido ?? 0)}
                            </Badge>
                            <Badge bg="dark" className="fw-semibold">
                              Funcionários:{" "}
                              {d.totals?.funcionariosEnviados ?? 0}
                            </Badge>
                          </div>

                          <div className="mb-3">
                            <div className="d-flex align-items-center justify-content-between gap-2">
                              <h3 className="h6 m-0">Por evento</h3>
                              <span className="text-secondary small">
                                Somente tipo Valor (V)
                              </span>
                            </div>
                            <Table
                              responsive
                              striped
                              bordered
                              hover
                              size="sm"
                              className="mt-2 table striped-table align-middle table-responsive table-bordered table-hover mb-0 fs-10 w-100"
                            >
                              <thead>
                                <tr>
                                  <th>Evento</th>
                                  <th className="text-end">Pago (+)</th>
                                  <th className="text-end">Desconto (-)</th>
                                  <th className="text-end">Saldo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(d.porEvento ?? []).map((r, idx) => (
                                  <tr key={`${r.label}-${idx}`}>
                                    <td className="fw-semibold">
                                      <Icon
                                        icon="solar:ticket-bold-duotone"
                                        width={16}
                                        height={16}
                                        className="me-2"
                                      />
                                      <Limited limit={28} tooltip>
                                        {r.label}
                                      </Limited>
                                    </td>
                                    <td className="text-end text-nowrap">
                                      <Badge
                                        bg="primary"
                                        className="fw-semibold"
                                      >
                                        {brl.format(r.pago)}
                                      </Badge>
                                    </td>
                                    <td className="text-end text-nowrap">
                                      <Badge
                                        bg="success"
                                        className="fw-semibold"
                                      >
                                        {brl.format(r.desconto)}
                                      </Badge>
                                    </td>
                                    <td className="text-end text-nowrap">
                                      {brl.format(r.pago - r.desconto)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>

                          <div>
                            <div className="d-flex align-items-center justify-content-between gap-2">
                              <h3 className="h6 m-0">
                                Processamentos (amostra)
                              </h3>
                              <Link
                                to={`/processamento?periodo=${selectedPeriodoId ?? ""}&filial=${selectedFilialId ?? ""}`}
                                className="text-decoration-none"
                              >
                                Ir para Processamentos
                              </Link>
                            </div>
                            <div className="text-secondary small">
                              Top 20 processamentos com maior impacto no
                              período.
                            </div>
                            <Table
                              responsive
                              striped
                              bordered
                              hover
                              size="sm"
                              className="table striped-table align-middle table-responsive table-bordered table-hover mb-0 fs-10 w-100"
                            >
                              <thead>
                                <tr>
                                  <th>Processamento</th>
                                  <th>Filial</th>
                                  <th className="text-end">Pago</th>
                                  <th className="text-end">Desconto</th>
                                  <th className="text-end">Saldo</th>
                                  <th className="text-end">Funcionários</th>
                                  <th className="text-end">Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(d.execucoes ?? []).map((r, idx) => (
                                  <tr key={`${r.execucaoId}-${idx}`}>
                                    <td className="text-nowrap fw-semibold">
                                      #{r.execucaoId}
                                    </td>
                                    <td>
                                      <Limited limit={20} tooltip>
                                        {r.filialNome ?? r.filialId}
                                      </Limited>
                                    </td>
                                    <td className="text-end text-nowrap">
                                      <Badge
                                        bg="primary"
                                        className="fw-semibold"
                                      >
                                        {brl.format(r.pago)}
                                      </Badge>
                                    </td>
                                    <td className="text-end text-nowrap">
                                      <Badge
                                        bg="success"
                                        className="fw-semibold"
                                      >
                                        {brl.format(r.desconto)}
                                      </Badge>
                                    </td>
                                    <td className="text-end text-nowrap">
                                      {brl.format(r.saldo)}
                                    </td>
                                    <td className="text-end">
                                      {r.funcionarios}
                                    </td>
                                    <td className="text-end text-nowrap">
                                      <Button
                                        variant="outline-primary"
                                        size="sm"
                                        tooltip="Abrir processamento"
                                        className="px-2 py-1"
                                        onClick={() =>
                                          navigate(
                                            `/processamento/${r.execucaoId}`,
                                          )
                                        }
                                      >
                                        <Icon
                                          icon="solar:eye-bold"
                                          width={16}
                                          height={16}
                                        />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-secondary">
                    Sem detalhe configurado para este indicador.
                  </div>
                )}
              </Modal.Body>
            </Modal>
          </>
        )}
      </div>
    </div>
  );
}
