import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Spinner, Table } from "react-bootstrap";
import DataTable from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import "datatables.net-dt";
import type { DataTableRef } from "datatables.net-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import { ptBR } from "date-fns/locale";
import "../../app/providers/datepickerGlobal.css";
import ReactECharts from "echarts-for-react";
import { Icon } from "@iconify/react";

import Select, { type SingleValue } from "../../shared/components/Select";
import { useHtmlTheme } from "../../hooks/useHtmlTheme";
import {
  RelatoriosApi,
  type FinanceiroTimelineReport,
} from "../../utils/api/relatoriosApi";
import { defaultConfig } from "../../utils/datatables/defaultConfig";
import { Limited } from "../utils/Limited";

type FilialOption = { label: string; value: number | null };

registerLocale("pt-BR", ptBR);

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);

function formatCompetencia(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${month}/${year}`;
}

function competenciaSortKey(competencia: string): number {
  const m = /^(\d{2})\/(\d{4})$/.exec(String(competencia ?? "").trim());
  if (!m) return 0;
  const month = Number(m[1]);
  const year = Number(m[2]);
  if (!Number.isFinite(month) || !Number.isFinite(year)) return 0;
  if (month < 1 || month > 12) return 0;
  return year * 100 + month;
}

type TimelineDetailRow = {
  competencia: string;
  competencia_sort: number;
  filialNome: string;
  pago: number;
  desconto: number;
  saldo: number;
};

export function FinanceiroTimelineReport() {
  const htmlTheme = useHtmlTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FinanceiroTimelineReport | null>(null);
  const hasMountedRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  const timelineTableRef = useRef<DataTableRef>(null);

  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [selectedFilialId, setSelectedFilialId] = useState<number | null>(null);

  const filialOptions: FilialOption[] = useMemo(() => {
    const opts: FilialOption[] = [{ label: "Todas as filiais", value: null }];
    for (const f of data?.filiaisOptions ?? []) {
      opts.push({ label: f.nome, value: f.filialId });
    }
    return opts;
  }, [data?.filiaisOptions]);

  const selectedFilialOption = useMemo(() => {
    return (
      filialOptions.find((o) => o.value === selectedFilialId) ??
      filialOptions[0] ??
      null
    );
  }, [filialOptions, selectedFilialId]);

  const brl = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      }),
    [],
  );

  const fetchReport = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = await RelatoriosApi.getFinanceiroTimeline({
        startCompetencia: formatCompetencia(startDate),
        endCompetencia: formatCompetencia(endDate),
        filialIds: selectedFilialId ? [selectedFilialId] : undefined,
        granularity: "auto",
      });
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [endDate, selectedFilialId, startDate]);

  useEffect(() => {
    // React 18 StrictMode (dev) pode disparar esse effect 2x no mount
    // e o DataTables acabar duplicando linhas na primeira carga.
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualização automática ao alterar filtros (debounce curto para não disparar múltiplas vezes)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const t = window.setTimeout(() => {
      fetchReport();
    }, 350);

    return () => {
      window.clearTimeout(t);
    };
  }, [startDate, endDate, selectedFilialId, fetchReport]);

  const scopeSeries = data?.series?.[0] ?? null;

  const timelineDetailRows: TimelineDetailRow[] = useMemo(() => {
    const rows: TimelineDetailRow[] = [];
    for (const s of data?.series ?? []) {
      const labels = s.labels ?? [];
      for (let i = 0; i < labels.length; i++) {
        const competencia = String(labels[i] ?? "").trim();
        if (!competencia) continue;
        const pago = Number(s.pago?.[i] ?? 0);
        const desconto = Number(s.desconto?.[i] ?? 0);
        const saldo = Number(s.saldo?.[i] ?? pago - desconto);
        rows.push({
          competencia,
          competencia_sort: competenciaSortKey(competencia),
          filialNome: String(s.filialNome ?? "").trim() || "—",
          pago,
          desconto,
          saldo,
        });
      }
    }

    // Ordena por competência (asc) e filial (asc) para consistência
    rows.sort((a, b) => {
      if (a.competencia_sort !== b.competencia_sort)
        return a.competencia_sort - b.competencia_sort;
      return a.filialNome.localeCompare(b.filialNome);
    });
    return rows;
  }, [data?.series]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const trySync = () => {
      const api = timelineTableRef.current?.dt();
      if (!api) return false;
      api.clear();
      api.rows.add(timelineDetailRows as unknown as object[]);
      api.draw(false);
      return true;
    };

    const tick = () => {
      if (cancelled) return;
      if (trySync()) return;

      // DataTables pode não estar pronto no mesmo tick do render (ou após trocar tema).
      attempts++;
      if (attempts >= 20) return; // ~1s em intervalos de 50ms
      window.setTimeout(tick, 50);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [timelineDetailRows, htmlTheme]);

  const timelineOption = useMemo(() => {
    const labels = scopeSeries?.labels ?? [];
    const pago = scopeSeries?.pago ?? [];
    const desconto = scopeSeries?.desconto ?? [];
    const saldo = scopeSeries?.saldo ?? [];

    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: number) => brl.format(Number(v ?? 0)),
      },
      legend: { top: 0 },
      grid: { left: 12, right: 12, top: 32, bottom: 10, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { interval: "auto" },
      },
      yAxis: { type: "value" },
      series: [
        {
          name: "Pago ao funcionário",
          type: "line",
          smooth: true,
          data: pago,
          areaStyle: { opacity: 0.12 },
          emphasis: { focus: "series" },
        },
        {
          name: "Desconto (economia)",
          type: "line",
          smooth: true,
          data: desconto,
          areaStyle: { opacity: 0.08 },
          emphasis: { focus: "series" },
        },
        {
          name: "Saldo líquido",
          type: "line",
          smooth: true,
          data: saldo,
          emphasis: { focus: "series" },
          lineStyle: { width: 3 },
        },
      ],
    };
  }, [
    brl,
    scopeSeries?.desconto,
    scopeSeries?.labels,
    scopeSeries?.pago,
    scopeSeries?.saldo,
  ]);

  const topEventosOption = useMemo(() => {
    const rows = data?.extras?.topEventos ?? [];
    const labels = rows.map((r) => r.evento);
    const pago = rows.map((r) => r.pago);
    const desconto = rows.map((r) => r.desconto);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v: number) => brl.format(Number(v ?? 0)),
      },
      legend: { top: 0 },
      grid: { left: 10, right: 10, top: 32, bottom: 10, containLabel: true },
      xAxis: { type: "value" },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: { width: 140, overflow: "truncate" },
      },
      series: [
        {
          name: "Pago ao funcionário",
          type: "bar",
          stack: "total",
          data: pago,
        },
        {
          name: "Desconto (economia)",
          type: "bar",
          stack: "total",
          data: desconto,
        },
      ],
    };
  }, [brl, data?.extras?.topEventos]);

  const scopeTitle = selectedFilialId
    ? `Filial: ${scopeSeries?.filialNome ?? selectedFilialId}`
    : "Todas as filiais";

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
          <div>
            <div className="text-secondary small">Relatório</div>
            <h2 className="h5 m-0">Timeline financeira</h2>
            <div className="text-secondary small mt-1">
              {scopeTitle} •{" "}
              {data?.range?.granularity
                ? `Competências (${data.range.granularity})`
                : "—"}
            </div>
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2">
            <div>
              <div className="text-secondary small">Início</div>
              <DatePicker
                selected={startDate}
                onChange={(d: Date | null) => {
                  if (!d) return;
                  const normalized = new Date(d.getFullYear(), d.getMonth(), 1);
                  setStartDate(normalized);
                  if (endDate && normalized.getTime() > endDate.getTime())
                    setEndDate(normalized);
                }}
                dateFormat="MM/yyyy"
                showMonthYearPicker
                className="form-control"
                calendarClassName="ve-datepicker"
                popperClassName="ve-datepicker-popper"
                showPopperArrow={false}
                locale="pt-BR"
              />
            </div>
            <div>
              <div className="text-secondary small">Fim</div>
              <DatePicker
                selected={endDate}
                onChange={(d: Date | null) => {
                  if (!d) return;
                  const normalized = new Date(d.getFullYear(), d.getMonth(), 1);
                  setEndDate(normalized);
                  if (startDate && normalized.getTime() < startDate.getTime())
                    setStartDate(normalized);
                }}
                dateFormat="MM/yyyy"
                showMonthYearPicker
                className="form-control"
                calendarClassName="ve-datepicker"
                popperClassName="ve-datepicker-popper"
                showPopperArrow={false}
                locale="pt-BR"
              />
            </div>
            <div style={{ minWidth: 260 }}>
              <div className="text-secondary small">Filial</div>
              <Select
                value={selectedFilialOption}
                options={filialOptions}
                onChange={(opt: SingleValue<FilialOption>) =>
                  setSelectedFilialId(opt?.value ?? null)
                }
                isClearable={false}
              />
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="danger" className="mb-3">
            <div className="d-flex align-items-center gap-2">
              <Icon icon="solar:danger-circle-linear" width={20} height={20} />
              <span>Erro ao carregar relatório: {error}</span>
            </div>
          </Alert>
        )}

        {!data ? (
          loading ? (
            <div className="d-flex align-items-center gap-2 text-secondary">
              <Spinner animation="border" size="sm" />
              <span>Carregando dados…</span>
            </div>
          ) : (
            <div className="text-secondary">Nenhum dado.</div>
          )
        ) : (
          <>
            {loading && (
              <div className="d-flex align-items-center gap-2 text-secondary mb-3">
                <Spinner animation="border" size="sm" />
                <span>Atualizando dados…</span>
              </div>
            )}
            <div className="row g-3 mb-3">
              <div className="col-12 col-md-3">
                <div className="border rounded p-3 h-100">
                  <div className="text-secondary small">
                    Pago ao funcionário
                  </div>
                  <div className="h4 m-0 mt-1">
                    {brl.format(data.totals.pago)}
                  </div>
                  <Badge bg="primary" className="fw-semibold mt-2">
                    Pago
                  </Badge>
                </div>
              </div>
              <div className="col-12 col-md-3">
                <div className="border rounded p-3 h-100">
                  <div className="text-secondary small">
                    Desconto (economia)
                  </div>
                  <div className="h4 m-0 mt-1">
                    {brl.format(data.totals.desconto)}
                  </div>
                  <Badge bg="success" className="fw-semibold mt-2">
                    Economia
                  </Badge>
                </div>
              </div>
              <div className="col-12 col-md-3">
                <div className="border rounded p-3 h-100">
                  <div className="text-secondary small">Saldo líquido</div>
                  <div className="h4 m-0 mt-1">
                    {brl.format(data.totals.saldo)}
                  </div>
                  <Badge bg="secondary" className="fw-semibold mt-2">
                    Saldo
                  </Badge>
                </div>
              </div>
              <div className="col-12 col-md-3">
                <div className="border rounded p-3 h-100">
                  <div className="text-secondary small">
                    Funcionários enviados
                  </div>
                  <div className="h4 m-0 mt-1">{data.totals.funcionarios}</div>
                  <div className="text-secondary small mt-2">
                    Base: status{" "}
                    <span className="fw-semibold">Enviado para RM</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="row g-3">
              <div className="col-12 col-xl-8">
                <div className="card h-100">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <div>
                        <h3 className="h6 m-0">Evolução no tempo</h3>
                        <div className="text-secondary small">
                          Pago, desconto e saldo ao longo do período
                          selecionado.
                        </div>
                      </div>
                      <span className="text-secondary small">
                        {data.range.start} → {data.range.end}
                      </span>
                    </div>
                    <div style={{ height: 360 }}>
                      <ReactECharts
                        option={timelineOption}
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
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <div>
                        <h3 className="h6 m-0">Eventos com maior impacto</h3>
                        <div className="text-secondary small">
                          Top 12 por volume (no período).
                        </div>
                      </div>
                    </div>
                    <div style={{ height: 360 }}>
                      <ReactECharts
                        option={topEventosOption}
                        style={{ height: "100%", width: "100%" }}
                        theme={htmlTheme === "dark" ? "dark" : undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12">
                <div className="card">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                      <div>
                        <h3 className="h6 m-0">
                          Detalhamento — Evolução no tempo
                        </h3>
                      </div>
                      <span className="text-secondary small">
                        {data.range.start} → {data.range.end}
                      </span>
                    </div>

                    <div className="mt-3">
                      <DataTable
                        className="table striped-table mb-0 w-100"
                        ref={timelineTableRef}
                        options={{
                          ...defaultConfig,
                          // Evita duplicar linhas na 1ª carga (React 18 StrictMode/dev pode montar 2x)
                          // e o `retrieve: true` reaproveitar instância antiga com dados já inseridos.
                          retrieve: false,
                          destroy: true,
                          pageLength: 10,
                          order: [[0, "asc"]],
                          columnDefs: [
                            {
                              targets: [0, 1],
                              className: "text-nowrap",
                            },
                            {
                              targets: [2, 3, 4],
                              className: "text-end text-nowrap",
                              render: (value: unknown, type: string) => {
                                const n = Number(value ?? 0);
                                if (type === "sort" || type === "type") {
                                  return Number.isFinite(n) ? n : 0;
                                }
                                if (type === "display") {
                                  return brl.format(Number.isFinite(n) ? n : 0);
                                }
                                return Number.isFinite(n) ? n : 0;
                              },
                            },
                            {
                              // Competência: display MM/yyyy, sort usa yyyyMM
                              targets: 0,
                              render: (
                                value: unknown,
                                type: string,
                                row: TimelineDetailRow,
                              ) => {
                                if (type === "sort" || type === "type") {
                                  return Number(row?.competencia_sort ?? 0);
                                }
                                return String(value ?? "").trim();
                              },
                            },
                          ],
                        }}
                        // gerenciado via ref() para evitar duplicações na 1ª carga
                        data={[]}
                        columns={[
                          {
                            title: "Competência",
                            data: "competencia",
                            name: "competencia",
                          },
                          {
                            title: "Filial",
                            data: "filialNome",
                            name: "filial",
                          },
                          {
                            title: "Pago ao funcionário",
                            data: "pago",
                            name: "pago",
                          },
                          {
                            title: "Desconto",
                            data: "desconto",
                            name: "desconto",
                          },
                          {
                            title: "Saldo líquido",
                            data: "saldo",
                            name: "saldo",
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12">
                <div className="card">
                  <div className="card-body">
                    <h3 className="h6 m-0 mb-2">Detalhamento — Top eventos</h3>
                    <Table
                      responsive
                      striped
                      bordered
                      hover
                      size="sm"
                      className="mb-0 align-middle table table-sm striped-table w-100 mb-0 mt-3"
                    >
                      <thead>
                        <tr>
                          <th>Evento</th>
                          <th className="text-end">Pago</th>
                          <th className="text-end">Desconto</th>
                          <th className="text-end">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.extras.topEventos ?? []).map((r, idx) => (
                          <tr key={`${r.evento}-${idx}`}>
                            <td className="fw-semibold">
                              <Limited limit={40} tooltip>
                                {r.evento}
                              </Limited>
                            </td>
                            <td className="text-end text-nowrap">
                              <Badge bg="primary" className="fw-semibold">
                                {brl.format(r.pago)}
                              </Badge>
                            </td>
                            <td className="text-end text-nowrap">
                              <Badge bg="success" className="fw-semibold">
                                {brl.format(r.desconto)}
                              </Badge>
                            </td>
                            <td className="text-end text-nowrap">
                              {brl.format(r.saldo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
