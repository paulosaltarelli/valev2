import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import DataTable from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import "datatables.net-select";
import "datatables.net-select-bs5";
import "datatables.net-buttons";
import "datatables.net-buttons-bs5";
import { ExecucaoApi } from "../../utils/api/execucaoApi";
import { Icon } from "@iconify/react";
import "datatables.net-dt";
import type { DataTableRef } from "datatables.net-react";

import { Alert, Modal, Table } from "react-bootstrap";
import { Button } from "../../components/utils/Button";
import { processamentoTableConfig } from "../../utils/datatables/defaultConfig";
import { useNavigate } from "react-router";
import { Form } from "react-bootstrap";

import type { Periodo } from "../../models/PeriodoModel";
import type { Execucao } from "../../models/ExecucaoModel";
import type { Filial } from "../../models/FilialModel";
import { FunctionsHelper } from "../../utils/functionsHelper.tsx";
import { filialApi } from "../../utils/api/filialApi";
import { PeriodoApi } from "../../utils/api/periodoApi";
import Select, {
  type MultiValue,
  type SingleValue,
} from "../../shared/components/Select";
import { SwalHelper } from "../../utils/swalHelper";
import { Tooltip } from "../../components/Tooltip";
import { useBlockUi } from "../../app/providers/blockUiContext";
import { Limited } from "../../components/utils/Limited";

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);

export function ProcessamentoPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("");
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [allExecucoes, setAllExecucoes] = useState<Execucao[]>([]);
  const allExecucoesLoadedRef = useRef<boolean>(false);
  const allExecucoesLoadingRef = useRef<boolean>(false);
  const [filialId, setFilialId] = useState<number>(0);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [periodosFilter, setPeriodosFilter] = useState<Periodo | null>(null);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const { show: blockUiShow, hide: blockUiHide } = useBlockUi();

  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [execucaoToCreate, setExecucaoToCreate] = useState<Partial<Execucao>>(
    {},
  );
  const [createFilialIds, setCreateFilialIds] = useState<number[]>([]);
  const [processarVariaveisEValores, setProcessarVariaveisEValores] =
    useState<boolean>(false);

  const [createQueueStatus, setCreateQueueStatus] = useState<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  } | null>(null);
  const [showCreateQueueDetails, setShowCreateQueueDetails] =
    useState<boolean>(false);
  const [createQueueItemsLoading, setCreateQueueItemsLoading] =
    useState<boolean>(false);
  const [createQueueItems, setCreateQueueItems] = useState<
    Array<{
      queueId: number;
      filialId: number;
      periodoId: number;
      usuarioExecucao: number;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  >([]);

  const [showCreateQueueErrorsModal, setShowCreateQueueErrorsModal] =
    useState<boolean>(false);
  const [createQueueErrorsLoading, setCreateQueueErrorsLoading] =
    useState<boolean>(false);
  const [createQueueErrors, setCreateQueueErrors] = useState<
    Array<{
      queueId: number;
      filialId: number;
      filialNome: string | null;
      periodoId: number;
      periodoCompetencia: string | null;
      usuarioExecucao: number;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastError: string;
    }>
  >([]);
  const [createQueueErrorsStatusFilter, setCreateQueueErrorsStatusFilter] =
    useState<"ALL" | "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO">("ALL");

  const createQueueRunningRef = useRef<boolean>(false);
  const showCreateQueueDetailsRef = useRef<boolean>(false);
  const tableRef = useRef<DataTableRef>(null);
  const execucoesRef = useRef<Execucao[]>([]);
  const listPollingInFlightRef = useRef<boolean>(false);
  const fastPollUntilRef = useRef<number>(0);
  useEffect(() => {
    showCreateQueueDetailsRef.current = showCreateQueueDetails;
  }, [showCreateQueueDetails]);

  useEffect(() => {
    ExecucaoApi.getAllByFilialId(filialId).then((execucoes: Execucao[]) => {
      setExecucoes(execucoes);
    });
  }, [filialId]);

  useEffect(() => {
    execucoesRef.current = execucoes;
  }, [execucoes]);

  const openCreateModal = () => {
    setExecucaoToCreate((prev) => ({
      ...prev,
      filial_id: filialId || undefined, // mantido por compatibilidade, mas criação usa createFilialIds
      periodo_id: periodosFilter?.periodo_id,
      formula_id: undefined,
    }));
    setCreateFilialIds(filialId ? [filialId] : []);
    setProcessarVariaveisEValores(false);
    setShowCreateModal(true);
  };

  useEffect(() => {
    PeriodoApi.getAllPeriodosAtivos().then((periodos: Periodo[]) => {
      setPeriodos(periodos);
    });
  }, []);

  useEffect(() => {
    filialApi.all().then((filiais: Filial[]) => {
      setFiliais(filiais);
    });
  }, []);

  // Cache: carrega todas as execuções (períodos ativos) 1x ao abrir o modal.
  // Usamos isso para sinalizar filiais que já possuem execução no período selecionado,
  // sem chamadas extras a cada mudança de período.
  useEffect(() => {
    if (!showCreateModal) return;
    if (allExecucoesLoadedRef.current) return;
    if (allExecucoesLoadingRef.current) return;
    allExecucoesLoadingRef.current = true;

    void ExecucaoApi.getAllByFilialId(0)
      .then((rows) => {
        setAllExecucoes(rows ?? []);
        allExecucoesLoadedRef.current = true;
      })
      .catch((e) => {
        console.error("Erro ao carregar execuções (cache)", e);
        // Não quebra UX: apenas não sinaliza as filiais.
        setAllExecucoes([]);
      })
      .finally(() => {
        allExecucoesLoadingRef.current = false;
      });
  }, [showCreateModal]);

  const handleRefreshExecucoes = useCallback(() => {
    ExecucaoApi.getAllByFilialId(filialId).then((execucoes: Execucao[]) => {
      setExecucoes(execucoes);
    });
  }, [filialId]);

  // Polling adaptativo da LISTA de execuções:
  // - 20s quando houver algo EM_PROCESSAMENTO (ou fila de criação rodando / ação recente)
  // - 60s quando estiver tudo parado
  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const computeDelay = () => {
      const now = Date.now();
      const hasExecucaoProcessing = (execucoesRef.current ?? []).some(
        (e) => e.status === "EM_PROCESSAMENTO",
      );
      const shouldFastPoll =
        hasExecucaoProcessing ||
        Boolean(createQueueRunningRef.current) ||
        now < fastPollUntilRef.current;

      return shouldFastPoll ? 20_000 : 60_000;
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        if (listPollingInFlightRef.current) return;
        listPollingInFlightRef.current = true;
        await ExecucaoApi.getAllByFilialId(filialId).then((rows) => {
          setExecucoes(rows);
        });
      } catch (e) {
        console.error(e);
      } finally {
        listPollingInFlightRef.current = false;
        const delay = computeDelay();
        timeout = setTimeout(tick, delay);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [filialId]);

  const syncDataTableButtonsState = useCallback(() => {
    const api = tableRef.current?.dt?.();
    if (!api) return;

    const selectedRows = api
      .rows({ selected: true })
      .data()
      .toArray() as Execucao[];
    const hasSelection = selectedRows.length > 0;

    // Evita enfileirar RM se alguma execução selecionada já está processando algo
    const canRun =
      hasSelection &&
      selectedRows.every((r) => r.status !== "EM_PROCESSAMENTO");

    api.button(".dt-btn-enviar-rm-lote").enable(canRun);
  }, []);

  const fetchCreateQueueStatus = useCallback(async () => {
    const status = await ExecucaoApi.getCreateQueueStatus();
    setCreateQueueStatus(status);
    return status;
  }, []);

  const fetchCreateQueueItems = useCallback(async () => {
    try {
      setCreateQueueItemsLoading(true);
      const items = await ExecucaoApi.getCreateQueueItems();
      setCreateQueueItems(items);
      return items;
    } finally {
      setCreateQueueItemsLoading(false);
    }
  }, []);

  const fetchCreateQueueErrors = useCallback(async () => {
    try {
      setCreateQueueErrorsLoading(true);
      const rows = await ExecucaoApi.getCreateQueueErrors(1000);
      setCreateQueueErrors(rows);
      return rows;
    } finally {
      setCreateQueueErrorsLoading(false);
    }
  }, []);

  const handleEnviarRmExecucoesSelecionadas = useCallback(async () => {
    const api = tableRef.current?.dt?.();
    if (!api) return;
    const rows = api.rows({ selected: true }).data().toArray() as Execucao[];
    const execucaoIds = rows.map((r) => Number(r.execucao_id)).filter(Boolean);
    if (execucaoIds.length === 0) return;

    const confirm = await SwalHelper.confirm(
      "Enviar ao RM?",
      "Esta ação irá enfileirar o envio ao RM para todos os funcionários elegíveis dos processamentos selecionados.",
      "question",
      "Sim, enfileirar",
      "Não, cancelar",
    );
    if (!confirm.isConfirmed) return;

    try {
      blockUiShow("Enfileirando envio ao RM...");
      const response =
        await ExecucaoApi.enqueueEnviarRmByExecucoes(execucaoIds);
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        fastPollUntilRef.current = Date.now() + 2 * 60_000;
        handleRefreshExecucoes();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (e) {
      console.error(e);
      SwalHelper.toast("Erro ao enfileirar envio ao RM", "error");
    } finally {
      blockUiHide();
    }
  }, [blockUiHide, blockUiShow, handleRefreshExecucoes]);

  const toggleCreateQueueDetails = useCallback(() => {
    setShowCreateQueueDetails((prev) => {
      const next = !prev;
      if (next) {
        // não esperar o próximo tick (20s/60s) pra preencher a lista
        void fetchCreateQueueItems();
      }
      return next;
    });
  }, [fetchCreateQueueItems]);

  // Polling otimizado:
  // - Quando tem fila rodando: 20s
  // - Quando não tem fila: 60s (bem mais leve)
  // - Itens detalhados só quando o colapsável estiver aberto
  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const status = await fetchCreateQueueStatus();

        const wasRunning = createQueueRunningRef.current;
        const isRunning = Boolean(status?.hasRunning);
        createQueueRunningRef.current = isRunning;

        if (isRunning && showCreateQueueDetailsRef.current) {
          await fetchCreateQueueItems();
        }

        // Quando terminar, atualiza a tabela respeitando filtros atuais
        if (wasRunning && !isRunning) {
          handleRefreshExecucoes();
          setShowCreateQueueDetails(false);
          setCreateQueueItems([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        const delay = createQueueRunningRef.current ? 20_000 : 60_000;
        timeout = setTimeout(tick, delay);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [fetchCreateQueueItems, fetchCreateQueueStatus, handleRefreshExecucoes]);

  const handleSaveCreateExecucao = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const periodoId = execucaoToCreate.periodo_id
        ? Number(execucaoToCreate.periodo_id)
        : 0;
      if (!periodoId) {
        SwalHelper.toast("Selecione um período", "warning");
        return;
      }
      if (!createFilialIds || createFilialIds.length === 0) {
        SwalHelper.toast("Selecione ao menos uma filial", "warning");
        return;
      }

      blockUiShow("Enfileirando criação de processamentos...");
      const response = await ExecucaoApi.enqueueCreateExecucaoBatch({
        filialIds: createFilialIds,
        periodoId,
        processarVariaveisEValores,
      });
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowCreateModal(false);
        fastPollUntilRef.current = Date.now() + 2 * 60_000;
        // força status agora pra já entrar no modo 20s se houver fila
        await fetchCreateQueueStatus();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };

  const columns = [
    {
      data: null,
      name: "selection",
      orderable: false,
      searchable: false,
      render: DataTablesCore.render.select(),
    },
    { data: "filial.nome", name: "filial" },
    { data: "periodo.competencia", name: "competencia" },
    { data: "status", name: "status" },
    { data: "data_execucao", name: "data_execucao" },
    { data: null, name: "actions", orderable: false, searchable: false },
  ];

  const selectedPeriodoToCreate =
    periodos.find((p) => p.periodo_id === execucaoToCreate.periodo_id) ?? null;

  const periodoIdToCreate = Number(execucaoToCreate.periodo_id ?? 0);
  const filialIdsComExecucaoNoPeriodo = useMemo(() => {
    const safePeriodoId = Number(periodoIdToCreate);
    if (!Number.isFinite(safePeriodoId) || safePeriodoId <= 0) {
      return new Set<number>();
    }
    const set = new Set<number>();
    for (const e of allExecucoes ?? []) {
      const ePeriodoId =
        Number(
          e?.periodo?.periodo_id ??
            (e as unknown as { periodo_id?: unknown })?.periodo_id,
        ) || 0;
      if (ePeriodoId !== safePeriodoId) continue;
      const fid = Number(e?.filial_id ?? 0);
      if (Number.isFinite(fid) && fid > 0) set.add(fid);
    }
    return set;
  }, [allExecucoes, periodoIdToCreate]);
  const filteredExecucoes = useMemo(
    () => execucoes.filter((execucao) =>
      (!periodosFilter || execucao.periodo?.periodo_id === periodosFilter.periodo_id) &&
      (!statusFilter || execucao.status === statusFilter)
    ),
    [execucoes, periodosFilter, statusFilter],
  );

  return (
    <>
      <div className="card">
        <div className="card-body vale-workspace">
          <header className="vale-page-header">
            <div>
              <h1>Processamentos</h1>
              <p>Acompanhe as execuções por filial e competência.</p>
            </div>
            <Button variant="primary" onClick={openCreateModal}>
              <Icon icon="tabler:plus" width={20} height={20} aria-hidden="true" />
              <span className="ms-1">Novo processamento</span>
            </Button>
          </header>
          <div className="row g-3 align-items-end vale-filter-bar" role="group" aria-label="Filtros de processamento">
            <div className="col-12 col-sm-6 col-xl">
              <Form.Label htmlFor="filialIdFilter">Filial</Form.Label>
              {(() => {
                type FilialOption = { value: number; label: string };

                const options: FilialOption[] = [
                  { value: 0, label: "Todas as filiais" },
                  ...filiais.map((filial) => ({
                    value: filial.filial_id,
                    label: filial.nome,
                  })),
                ];

                const value: FilialOption =
                  options.find((opt) => opt.value === filialId) ?? options[0];

                return (
                  <Select<FilialOption, false>
                    inputId="filialIdFilter"
                    options={options}
                    value={value}
                    onChange={(opt: SingleValue<FilialOption>) => {
                      const nextFilialId = opt?.value ?? 0;
                      setFilialId(nextFilialId);

                      // se o modal estiver aberto, mantém o select interno sincronizado
                      if (showCreateModal) {
                        setExecucaoToCreate((prev) => ({
                          ...prev,
                          filial_id: nextFilialId || undefined,
                        }));
                      }
                    }}
                  />
                );
              })()}
            </div>
            <div className="col-12 col-sm-6 col-xl">
              <Form.Label htmlFor="periodoIdFilter">Competência</Form.Label>
              {(() => {
                type PeriodoOption = { value: number; label: string };

                const options: PeriodoOption[] = [
                  { value: 0, label: "Todas as competências" },
                  ...periodos.map((periodo) => ({
                    value: periodo.periodo_id,
                    label: periodo.competencia,
                  })),
                ];

                const value: PeriodoOption =
                  options.find(
                    (opt) => opt.value === periodosFilter?.periodo_id,
                  ) ?? options[0];

                return (
                  <Select<PeriodoOption, false>
                    inputId="periodoIdFilter"
                    options={options}
                    value={value}
                    onChange={(opt: SingleValue<PeriodoOption>) => {
                      const nextPeriodoId = opt?.value ?? 0;
                      setPeriodosFilter(
                        periodos.find((p) => p.periodo_id === nextPeriodoId) ??
                          null,
                      );

                      // se o modal estiver aberto, mantém o select interno sincronizado
                      if (showCreateModal) {
                        setExecucaoToCreate((prev) => ({
                          ...prev,
                          periodo_id: nextPeriodoId || undefined,
                        }));
                      }
                    }}
                  />
                );
              })()}
            </div>
            <div className="col-12 col-sm-6 col-xl">
              <Form.Label htmlFor="statusFilter">Status</Form.Label>
              <Form.Select id="statusFilter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Todos os status</option>
                <option value="AGUARDANDO">Aguardando</option>
                <option value="EM_PROCESSAMENTO">Em processamento</option>
                <option value="EM_VALIDACAO">Em validação</option>
                <option value="FINALIZADA">Finalizada</option>
                <option value="CANCELADA">Cancelada</option>
              </Form.Select>
            </div>
            <div className="col-12 col-sm-6 col-xl-auto">
              <Button variant="link" disabled={!filialId && !periodosFilter && !statusFilter} onClick={() => {
                setFilialId(0);
                setPeriodosFilter(null);
                setStatusFilter("");
              }}>Limpar filtros</Button>
            </div>
          </div>
          <section className="vale-queue" aria-label="Fila de criação">
            <div className="vale-page-header">
              <div>
                <h2>Fila de criação</h2>
                <p role="status">
                  {createQueueStatus?.hasRunning
                    ? `${createQueueStatus.pending} aguardando · ${createQueueStatus.processing} em andamento`
                    : createQueueStatus ? "Nenhuma criação em andamento" : "Status da fila indisponível"}
                </p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {createQueueStatus?.hasRunning && (
                  <Button variant="outline-primary" aria-expanded={showCreateQueueDetails} onClick={toggleCreateQueueDetails}>
                    {showCreateQueueDetails ? "Ocultar fila" : "Ver fila"}
                  </Button>
                )}
                <Button variant="outline-secondary" onClick={() => {
                  setShowCreateQueueErrorsModal(true);
                  void fetchCreateQueueErrors();
                }}>Ver falhas</Button>
              </div>
            </div>
              {createQueueStatus?.hasRunning && showCreateQueueDetails && (
                <div className="border rounded bg-neutral p-2 mb-2">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <strong>Fila de criação</strong>
                    <span className="text-neutral-500 fs-12">
                      {createQueueItems.length} itens
                    </span>
                  </div>
                  {createQueueItemsLoading ? (
                    <div className="text-muted fs-12">Carregando fila...</div>
                  ) : createQueueItems.length === 0 ? (
                    <div className="text-muted fs-12">
                      Nenhum item pendente no momento.
                    </div>
                  ) : (
                    <div
                      className="table-responsive"
                      style={{ maxWidth: "100%" }}
                    >
                      <table className="table table-sm mb-0 fs-10 striped-table w-100">
                        <thead>
                          <tr>
                            <th>Filial</th>
                            <th>Período</th>
                            <th>Status</th>
                            <th>Tent.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {createQueueItems.map((item) => {
                            const filialNome =
                              filiais.find((f) => f.filial_id === item.filialId)
                                ?.nome ?? String(item.filialId);
                            const periodoCompetencia =
                              periodos.find(
                                (p) => p.periodo_id === item.periodoId,
                              )?.competencia ?? String(item.periodoId);
                            return (
                              <tr key={item.queueId}>
                                <td>{filialNome}</td>
                                <td>{periodoCompetencia}</td>
                                <td>{item.status}</td>
                                <td>{item.tentativas}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
          </section>
          <section className="vale-table vale-history" aria-label="Histórico de processamentos">
            <h2>Histórico de execuções</h2>
            <DataTable
              className="table striped-table mb-0 w-100"
              options={{
                pageLength: 10,
                order: [[4, "desc"]],
                layout: {
                  topStart: "buttons",
                },
                columnDefs: [
                  {
                    targets: ["_all"],
                    className: "text-center",
                  },
                ],
                select: {
                  style: "multi+shift",
                  selector: "td:first-child",
                },
                buttons: [
                  {
                    text: "<i class='ri-upload-2-line me-1'></i>Enviar ao RM",
                    enabled: false,
                    titleAttr:
                      "Enfileirar envio ao RM (processamentos selecionados)",
                    title:
                      "Enfileirar envio ao RM (processamentos selecionados)",
                    className:
                      "btn btn-outline-info btn-sm dt-btn-enviar-rm-lote",
                    action: () => {
                      void handleEnviarRmExecucoesSelecionadas();
                    },
                  },
                ],
                ...processamentoTableConfig,
                responsive: false,
              }}
              data={filteredExecucoes}
              columns={columns}
              slots={{
                selection: () => (
                  <input type="checkbox" className="form-check-input" />
                ),
                actions: (row: Execucao) => (
                  <div>
                    <Button
                      variant="outline-primary"
                      className="px-2"
                      aria-label={`Ver detalhes de ${row.filial?.nome ?? "filial"}, ${row.periodo?.competencia ?? "competência"}`}
                      onClick={() => {
                        navigate(`/processamento/${row.execucao_id}`);
                      }}
                    >
                      Ver detalhes
                    </Button>
                  </div>
                ),
                status: (status: string) =>
                  FunctionsHelper.formatStatusExecucao(status),
                data_execucao: (data: string, type: string, _row: Execucao) =>
                  type === "display" ? FunctionsHelper.formatDateTimePtBr(data) : data,
              }}
              onSelect={() => syncDataTableButtonsState()}
              onDeselect={() => syncDataTableButtonsState()}
              ref={tableRef}
            >
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">Filial</th>
                  <th scope="col">Competência</th>
                  <th scope="col">Status</th>
                  <th scope="col">Criado em</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
            </DataTable>
          </section>
        </div>
      </div>
      {/* <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Editar Período</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSaveEditPeriodo} id="editPeriodoForm">
            <div className="row">
              <div className="col-6 mb-2">
                <Form.Group controlId="codfilial">
                  <Form.Label>Data Inicial</Form.Label>
                  <Form.Control
                    type="date"
                    value={toDateInputValue(periodoToEdit?.data_inicio)}
                    onChange={(e) => {
                      const parsed = parseDateFromInput(e.target.value);
                      setPeriodoToEdit({
                        ...periodoToEdit,
                        data_inicio: parsed as Date,
                      } as Periodo);
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codcoligada">
                  <Form.Label>Data Final</Form.Label>
                  <Form.Control
                    type="date"
                    value={toDateInputValue(periodoToEdit?.data_fim)}
                    onChange={(e) => {
                      const parsed = parseDateFromInput(e.target.value);
                      setPeriodoToEdit({
                        ...periodoToEdit,
                        data_fim: parsed as Date,
                      } as Periodo);
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group
                  controlId="competencia"
                  className="d-flex gap-1 flex-column"
                >
                  <Form.Label>Competência</Form.Label>
                  <DatePicker
                    className="form-control"
                    selected={
                      periodoToEdit?.competencia
                        ? parseCompetenciaToDate(periodoToEdit.competencia) ??
                          new Date()
                        : new Date()
                    }
                    onChange={(date: Date | null) => {
                      if (!date) return;
                      setPeriodoToEdit({
                        ...periodoToEdit,
                        data_inicio: FunctionsHelper.getFirstDayOfMonth(date),
                        data_fim: FunctionsHelper.getLastDayOfMonth(date),
                        competencia: formatCompetencia(date),
                      } as Periodo);
                    }}
                    dateFormat="MM/yyyy"
                    showMonthYearPicker
                  />
                </Form.Group>
              </div>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="editPeriodoForm">
            Salvar
          </Button>
        </Modal.Footer>
      </Modal> */}

      <Modal
        show={showCreateModal}
        onHide={() => setShowCreateModal(false)}
        size="lg"
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Novo processamento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSaveCreateExecucao} id="createExecucaoForm">
            <div className="row mb-3">
              <div className="col-12 col-md-6 mb-2">
                <Form.Group controlId="filialIdCreate">
                  <Form.Label>Filiais</Form.Label>
                  {(() => {
                    type FilialOption = {
                      value: number;
                      label: string;
                      hasExecucaoNoPeriodo: boolean;
                    };

                    const hasPeriodoSelecionado = periodoIdToCreate > 0;
                    const options: FilialOption[] = filiais.map((filial) => {
                      const hasExecucaoNoPeriodo =
                        hasPeriodoSelecionado &&
                        filialIdsComExecucaoNoPeriodo.has(filial.filial_id);
                      return {
                        value: filial.filial_id,
                        label: filial.nome,
                        hasExecucaoNoPeriodo,
                      };
                    });

                    const value: FilialOption[] = options.filter((opt) =>
                      createFilialIds.includes(opt.value),
                    );

                    return (
                      <Select<FilialOption, true>
                        inputId="filialIdCreate"
                        placeholder="Selecione uma ou mais filiais"
                        isClearable
                        isMulti
                        options={options}
                        value={value}
                        formatOptionLabel={(opt) => (
                          <Tooltip title={opt.hasExecucaoNoPeriodo ? "Já existe processamento neste período" : ""} placement="left">
                            <div className="d-flex flex-column">
                              <div className="d-flex align-items-center gap-2">
                                <span
                                  style={{
                                    color: opt.hasExecucaoNoPeriodo
                                      ? "var(--danger-main)"
                                      : undefined,
                                    fontWeight: opt.hasExecucaoNoPeriodo
                                      ? 600
                                      : undefined,
                                  }}
                                >
                                  {opt.hasExecucaoNoPeriodo ? "⚠ " : ""}
                                  {opt.label}
                                </span>
                              </div>
                              {/* {opt.hasExecucaoNoPeriodo && (
                              <small style={{ color: "var(--danger-main)" }}>
                                Já existe processamento neste período
                              </small>
                            )} */}
                            </div>
                          </Tooltip>
                        )}
                        onChange={(opts: MultiValue<FilialOption>) => {
                          const ids = (opts ?? []).map((o) => o.value);
                          setCreateFilialIds(ids);
                        }}
                      />
                    );
                  })()}
                </Form.Group>
              </div>
              <div className="col-12 col-md-6 mb-2">
                <Form.Group controlId="periodoId">
                  <Form.Label>Competência</Form.Label>
                  {(() => {
                    type PeriodoOption = { value: number; label: string };

                    const options: PeriodoOption[] = periodos
                      .slice()
                      .sort((b, a) =>
                        a.competencia.localeCompare(b.competencia),
                      )
                      .map((periodo) => ({
                        value: periodo.periodo_id,
                        label: periodo.competencia,
                      }));

                    const value: PeriodoOption | null =
                      options.find(
                        (opt) => opt.value === execucaoToCreate.periodo_id,
                      ) ?? null;

                    return (
                      <Select<PeriodoOption, false>
                        inputId="periodoId"
                        placeholder="Selecione a competência"
                        isClearable
                        options={options}
                        value={value}
                        onChange={(opt: SingleValue<PeriodoOption>) =>
                          setExecucaoToCreate({
                            ...execucaoToCreate,
                            periodo_id: opt?.value,
                          })
                        }
                      />
                    );
                  })()}
                </Form.Group>
                {/* <Form.Select
                    aria-label="Período"
                    value={execucaoToCreate.periodo_id}
                    onChange={(e) =>
                      setExecucaoToCreate({
                        ...execucaoToCreate,
                        periodo_id: Number(e.target.value),
                      })
                    }
                  >
                    <option value="" disabled selected>
                      Selecione um período
                    </option>
                    {periodos
                      .slice()
                      .sort((b, a) => a.competencia.localeCompare(b.competencia))
                      .map((periodo) => (
                        <option
                          key={periodo.periodo_id}
                          value={periodo.periodo_id}
                        >
                          {periodo.competencia}
                        </option>
                      ))}
                  </Form.Select> */}
                {/* </Form.Group> */}
              </div>
              {/* <div className="col-6 mb-2">
                <Form.Group controlId="formulaId">
                  <Form.Label>Fórmula</Form.Label>
                  <Form.Select
                    aria-label="Fórmula"
                    value={execucaoToCreate.formula_id}
                    onChange={(e) =>
                      const parsed = parseDateFromInput(e.target.value);
                      setPeriodoToCreate((prev) => ({
                        ...prev,
                        data_inicio: parsed,
                      }));
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codcoligada">
                  <Form.Label>Data Final</Form.Label>
                  <Form.Control
                    type="date"
                    value={
                      periodoToCreate.data_fim
                        ? new Date(periodoToCreate.data_fim)
                            .toISOString()
                            .slice(0, 10)
                        : ""
                    }
                    onChange={(e) => {
                      const parsed = parseDateFromInput(e.target.value);
                      setPeriodoToCreate((prev) => ({
                        ...prev,
                        data_fim: parsed,
                      }));
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group
                  controlId="competencia"
                  className="d-flex gap-1 flex-column"
                >
                  <Form.Label>Competência</Form.Label>
                  <DatePicker
                    className="form-control"
                    selected={competenciaDate}
                    onChange={(date: Date | null) => {
                      if (!date) return;
                      setCompetenciaDate(date);
                      setPeriodoToCreate((prev) => ({
                        ...prev,
                        data_inicio: FunctionsHelper.getFirstDayOfMonth(date),
                        data_fim: FunctionsHelper.getLastDayOfMonth(date),
                        competencia: formatCompetencia(date),
                      }));
                    }}
                    dateFormat="MM/yyyy"
                    showMonthYearPicker
                  />
                </Form.Group>
              </div> */}
            </div>
          </Form>
          <div className="row px-2">
            <Alert variant="info">
              <h6 className="mb-3 h6">Informações</h6>
              <div className="row g-3 align-items-stretch">
                <div className="col-12 col-md-6 d-flex">
                  <div className="border rounded p-3 bg-white bg-opacity-50 w-100 h-100">
                    <div className="fw-semibold mb-4">Filial</div>
                    <hr />
                    {createFilialIds.length === 0 ? (
                      <div className="text-muted">-</div>
                    ) : (
                      <>
                        <div className="fw-semibold">
                          {createFilialIds.length} filial(is) selecionada(s)
                        </div>
                        <ul className="list-unstyled mt-2 mb-0 small">
                          {createFilialIds.slice(0, 6).map((id) => {
                            const nome =
                              filiais.find((f) => f.filial_id === id)?.nome ??
                              String(id);
                            return <li key={id}>{nome}</li>;
                          })}
                          {createFilialIds.length > 6 && (
                            <li className="text-muted">
                              +{createFilialIds.length - 6} outras...
                            </li>
                          )}
                        </ul>
                      </>
                    )}
                  </div>
                </div>

                <div className="col-12 col-md-6 d-flex">
                  <div className="border rounded p-3 bg-white bg-opacity-50 w-100 h-100">
                    <div className="fw-semibold mb-4">Período</div>
                    <hr />
                    {!selectedPeriodoToCreate ? (
                      <div className="text-muted">-</div>
                    ) : (
                      <>
                        <div className="fw-semibold">
                          {selectedPeriodoToCreate.competencia}
                        </div>
                        <ul className="list-unstyled">
                          <li>
                            <span className="fw-semibold small">
                              Data Início:{" "}
                            </span>
                            <span className="text-muted ms-2">
                              {FunctionsHelper.formatDateOnlyPtBr(
                                selectedPeriodoToCreate.data_inicio,
                              )}
                            </span>
                          </li>
                          <li>
                            <span className="fw-semibold small">
                              Data Fim:{" "}
                            </span>
                            <span className="text-muted ms-2">
                              {FunctionsHelper.formatDateOnlyPtBr(
                                selectedPeriodoToCreate.data_fim,
                              )}
                            </span>
                          </li>
                        </ul>
                        {/* <dl className="row mb-0 mt-2 small">
                          <dt className="col-5">data_inicio</dt>
                          <dd className="col-7 mb-1">
                            {FunctionsHelper.formatDateOnlyPtBr(
                              selectedPeriodoToCreate.data_inicio
                            )}
                          </dd>
                        <ul className="list-unstyled">
                          <li>
                            <span className="fw-semibold small">Data Fim: </span>
                            <span className="text-muted ms-2">
                              {FunctionsHelper.formatDateOnlyPtBr(selectedPeriodoToCreate.data_fim)}
                            </span>
                          </li>
                        </ul>
                          <dt className="col-5">data_fim</dt>
                          <dd className="col-7 mb-0">
                            {FunctionsHelper.formatDateOnlyPtBr(
                              selectedPeriodoToCreate.data_fim
                            )}
                          </dd>
                        </dl> */}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Alert>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Form.Switch
              id="processarVariaveisEValores"
              // label="Processar Variaveis e Valores"
              checked={processarVariaveisEValores}
              onChange={(e) => setProcessarVariaveisEValores(e.target.checked)}
            />
            <Form.Label htmlFor="processarVariaveisEValores">
              Calcular variáveis e valores após criar
            </Form.Label>
          </div>
          <div className="row px-2">
            {/* SWITCH PROCESSAR VARIAVEIS E VALORES */}
            <div className="col-12 col-md-6"></div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="createExecucaoForm">
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showCreateQueueErrorsModal}
        onHide={() => setShowCreateQueueErrorsModal(false)}
        size="xl"
        centered
      >
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title>Erros / logs da criação de processamentos</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
            <div>
              <Form.Label>Status</Form.Label>
              <Form.Select
                value={createQueueErrorsStatusFilter}
                onChange={(e) =>
                  setCreateQueueErrorsStatusFilter(
                    e.target.value as
                      | "ALL"
                      | "PENDENTE"
                      | "PROCESSANDO"
                      | "CONCLUIDO"
                      | "ERRO",
                  )
                }
              >
                <option value="ALL">Todos</option>
                <option value="PENDENTE">Pendente</option>
                <option value="PROCESSANDO">Processando</option>
                <option value="CONCLUIDO">Concluído</option>
                <option value="ERRO">Erro</option>
              </Form.Select>
            </div>

            <Button
              variant="outline-secondary"
              onClick={() => void fetchCreateQueueErrors()}
              tooltip="Atualizar lista"
            >
              <Icon icon="solar:refresh-bold-duotone" width={20} height={20} />
              <span className="ms-1">Atualizar</span>
            </Button>
          </div>

          {createQueueErrorsLoading ? (
            <div className="text-muted">Carregando...</div>
          ) : (
            (() => {
              const filtered = (createQueueErrors ?? []).filter((r) => {
                if (createQueueErrorsStatusFilter === "ALL") return true;
                return r.status === createQueueErrorsStatusFilter;
              });

              return (
                <div className="table-responsive" style={{ maxWidth: "100%" }}>
                  <Table className="table table-sm striped-table w-100 mb-0 fs-12">
                    <thead>
                      <tr className="bg-danger bg-opacity-10">
                        <th>Atualizado em</th>
                        <th>Filial</th>
                        <th>Período</th>
                        <th>Status</th>
                        <th>Tent.</th>
                        <th>Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-muted text-center">
                            Nenhum log/erro encontrado.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((r) => (
                          <tr key={r.queueId}>
                            <td>
                              {FunctionsHelper.formatDateTimePtBr(r.updatedAt)}
                            </td>
                            <td>{r.filialNome ?? String(r.filialId)}</td>
                            <td>
                              {r.periodoCompetencia ?? String(r.periodoId)}
                            </td>
                            <td>{r.status}</td>
                            <td>{r.tentativas}</td>
                            <td>
                              <Limited limit={120} placement="top">
                                {r.lastError}
                              </Limited>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              );
            })()
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}
