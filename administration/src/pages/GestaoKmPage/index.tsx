import { PageHeading } from "../../shared/components/PageHeading";
import { safeReturn } from "../../utils/safeReturn";
import { Icon } from "@iconify/react";
import { Button } from "../../components/utils/Button";
import { Link, useLocation } from "react-router";
import { Alert, Form, Modal, Table } from "react-bootstrap";
import Select, { type SingleValue } from "../../shared/components/Select";
import type { Filial } from "../../models/FilialModel";
import { useCallback, useEffect, useRef, useState } from "react";
import { filialApi } from "../../utils/api/filialApi";
import { SwalHelper } from "../../utils/swalHelper";
import type { FuncionarioRm } from "../../models/FuncionarioRmModel";
import { useBlockUi } from "../../app/providers/blockUiContext";
import { defaultConfig } from "../../utils/datatables/defaultConfig";
import { FunctionsHelper } from "../../utils/functionsHelper";

import DataTable, { type DataTableRef } from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import "datatables.net-dt";
// JS do plugin (registra `render.select()` etc.)
import "datatables.net-select";
// Wrapper Bootstrap (ajusta classes do checkbox para Bootstrap 5)
import "datatables.net-select-bs5";
// JS do Buttons (para ações no header do DataTable)
import "datatables.net-buttons";
// Wrapper Bootstrap 5 do Buttons
import "datatables.net-buttons-bs5";
import { Limited } from "../../components/utils/Limited";

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);

export function GestaoKmPage() {
  const location = useLocation();
  const [filialId, setFilialId] = useState<number>(0);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioRm[]>([]);
  const [showFunAddressModal, setShowFunAddressModal] =
    useState<boolean>(false);
  const [funToShowAddress, setFunToShowAddress] =
    useState<FuncionarioRm | null>(null);
  const { show: blockUiShow, hide: blockUiHide } = useBlockUi();
  const [, setSelectedRows] = useState<FuncionarioRm[]>([]);
  const tableRef = useRef<DataTableRef>(null);
  const filialIdRef = useRef<number>(0);
  const [geoStatus, setGeoStatus] = useState<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  } | null>(null);
  const geoWasRunningRef = useRef<boolean>(false);
  const [geoErrors, setGeoErrors] = useState<
    Array<{
      geoQueueId: number;
      chapa: string;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastError: string;
    }>
  >([]);
  const [showGeoErrorsModal, setShowGeoErrorsModal] = useState(false);
  const [geoErrorsStatusFilter, setGeoErrorsStatusFilter] = useState<
    "ALL" | "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO"
  >("ALL");

  const isGeoRunning = Boolean(geoStatus?.hasRunning);
  const queryAppliedRef = useRef(false);
  const pendingQueryChapaRef = useRef<string>("");

  const applyChapaFilter = useCallback((chapa: string): boolean => {
    const safe = String(chapa ?? "").trim();
    if (!safe) return true; // nada a aplicar
    const api = tableRef.current?.dt();
    if (!api) return false;
    api.search(safe).draw();
    return true;
  }, []);

  useEffect(() => {
    filialApi.all().then((data: Filial[]) => {
      setFiliais(data);
    });
  }, []);

  useEffect(() => {
    filialIdRef.current = filialId;
  }, [filialId]);

  const fetchFuncionariosByFilialId = async (fid: number) => {
    if (!fid) {
      SwalHelper.toast("Selecione uma filial primeiro!", "error");
      return;
    }
    try {
      blockUiShow("Buscando funcionários");
      const data = await filialApi.getFuncionariosRmByFilialId(fid);
      setFuncionarios(data);
      // Busca os últimos logs/erros da fila GEO desta filial (não chama RM)
      try {
        const errs = await filialApi.getGeoQueueErrors(fid, 1000);
        setGeoErrors(errs);
      } catch (e) {
        console.warn("Erro ao buscar erros da fila GEO", e);
        setGeoErrors([]);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        SwalHelper.toast(error.message, "error");
      } else {
        SwalHelper.toast("Erro ao buscar funcionários!", "error");
      }
    } finally {
      blockUiHide();
    }
  };

  // Suporte a deep-link: /gestao-km?filialId=123&chapa=000123
  useEffect(() => {
    if (queryAppliedRef.current) return;

    const qs = new URLSearchParams(location.search);
    const fid = Number(qs.get("filialId") ?? 0);
    const chapa = String(qs.get("chapa") ?? "").trim();

    const hasFilial = Number.isFinite(fid) && fid > 0;
    const hasChapa = Boolean(chapa);
    if (!hasFilial && !hasChapa) return;

    queryAppliedRef.current = true;
    pendingQueryChapaRef.current = chapa;

    if (hasFilial) {
      setFilialId(fid);
      void fetchFuncionariosByFilialId(fid);
    } else {
      // Sem filial na URL, apenas aplica o filtro quando houver data/DT pronto
      void Promise.resolve().then(() => applyChapaFilter(chapa));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Quando os funcionários carregarem, tenta aplicar o filtro pendente (se houver).
  useEffect(() => {
    const chapa = pendingQueryChapaRef.current;
    if (!chapa) return;

    const appliedNow = applyChapaFilter(chapa);
    if (appliedNow) {
      pendingQueryChapaRef.current = "";
      return;
    }

    // DataTables pode não estar pronto no mesmo tick do render; tenta novamente.
    const t = window.setTimeout(() => {
      const c = pendingQueryChapaRef.current;
      if (!c) return;
      if (applyChapaFilter(c)) pendingQueryChapaRef.current = "";
    }, 0);
    return () => window.clearTimeout(t);
  }, [funcionarios, applyChapaFilter]);

  const refreshGeoStatus = async (fid: number) => {
    if (!fid) return;
    try {
      const st = await filialApi.getGeoQueueStatus(fid);
      setGeoStatus(st);

      // Quando a fila "zerar", faz um refresh único dos funcionários (RM)
      const wasRunning = geoWasRunningRef.current;
      geoWasRunningRef.current = Boolean(st.hasRunning);
      if (wasRunning && !st.hasRunning) {
        void fetchFuncionariosByFilialId(fid);
      }
    } catch (e) {
      // status é informativo; não quebra UX
      console.warn("Erro ao buscar status da fila GEO", e);
    }
  };

  // Polling (20s): só consulta o status da fila enquanto houver pendências
  useEffect(() => {
    if (!filialId) {
      setGeoStatus(null);
      geoWasRunningRef.current = false;
      return;
    }

    void refreshGeoStatus(filialId);

    const id = window.setInterval(() => {
      if (!filialId) return;
      void refreshGeoStatus(filialId);
    }, 20000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filialId]);

  const handleBuscarFuncionarios = async () => {
    return await fetchFuncionariosByFilialId(filialIdRef.current);
  };

  const handleCalcularTodosKm = async () => {
    try {
      const fid = filialIdRef.current;
      if (!fid) {
        SwalHelper.toast("Selecione uma filial primeiro!", "error");
        return;
      }
      if (funcionarios.length === 0) {
        SwalHelper.toast("Nenhum funcionário para processar!", "error");
        return;
      }
      const payload = funcionarios
        .map((f) => ({
          chapa: f.CHAPA,
          codcoligada: f.CODCOLIGADA,
          codfilial: f.CODFILIAL,
        }))
        .filter((x) => Boolean(x.chapa));
      const result = await filialApi.enqueueGeoKm(fid, payload);
      SwalHelper.toast(result.message, "success");
      void refreshGeoStatus(fid);
    } catch (error: unknown) {
      if (error instanceof Error) {
        SwalHelper.toast(error.message, "error");
      } else {
        SwalHelper.toast("Erro ao iniciar cálculo de Km!", "error");
      }
    } finally {
      blockUiHide();
    }
  };

  const handleCalcularFuncKm = async (row: FuncionarioRm) => {
    try {
      const fid = filialIdRef.current;
      if (!fid) {
        SwalHelper.toast("Selecione uma filial primeiro!", "error");
        return;
      }
      const chapa = row?.CHAPA;
      if (!chapa) {
        SwalHelper.toast("CHAPA não encontrada!", "error");
        return;
      }
      const result = await filialApi.enqueueGeoKm(fid, [
        {
          chapa,
          codcoligada: row.CODCOLIGADA,
          codfilial: row.CODFILIAL,
        },
      ]);
      SwalHelper.toast(result.message, "success");
      void refreshGeoStatus(fid);
    } catch (error: unknown) {
      if (error instanceof Error) {
        SwalHelper.toast(error.message, "error");
      } else {
        SwalHelper.toast(
          "Erro ao iniciar cálculo de Km do funcionário!",
          "error"
        );
      }
    } finally {
      blockUiHide();
    }
  };

  const syncSelectedRows = () => {
    const api = tableRef.current?.dt();
    if (!api) return;

    // `data()` retorna uma coleção DataTables; `toArray()` vira array JS
    const rows = api
      .rows({ selected: true })
      .data()
      .toArray() as FuncionarioRm[];
    setSelectedRows(rows);

    // Habilita/desabilita o botão do DataTables Buttons conforme seleção
    api.button(".dt-btn-calc-km").enable(rows.length > 0 && !isGeoRunning);
  };

  const handleProcessarSelecionados = async (rows: FuncionarioRm[]) => {
    try {
      const fid = filialIdRef.current;
      if (!fid) {
        SwalHelper.toast("Selecione uma filial primeiro!", "error");
        return;
      }
      const payload = rows
        .map((r) => ({
          chapa: r.CHAPA,
          codcoligada: r.CODCOLIGADA,
          codfilial: r.CODFILIAL,
        }))
        .filter((x) => Boolean(x.chapa));
      if (payload.length === 0) {
        SwalHelper.toast("Nenhum funcionário selecionado!", "error");
        return;
      }
      const result = await filialApi.enqueueGeoKm(fid, payload);
      SwalHelper.toast(result.message, "success");
      void refreshGeoStatus(fid);
    } catch (error: unknown) {
      if (error instanceof Error) {
        SwalHelper.toast(error.message, "error");
      } else {
        SwalHelper.toast(
          "Erro ao iniciar cálculo de Km dos selecionados!",
          "error"
        );
      }
    } finally {
      blockUiHide();
    }
  };

  const handleVisualizarKm = (row: FuncionarioRm) => {
    console.log("Visualizar Km", row);
    setFunToShowAddress(row);
    setShowFunAddressModal(true);
  };

  // Sempre que trocar o dataset, limpa seleção (evita "seleções fantasma")
  useEffect(() => {
    setSelectedRows([]);
    const api = tableRef.current?.dt();
    api?.rows().deselect();
  }, [funcionarios]);

  // Sempre que mudar status de execução GEO, força resync do estado dos botões do DataTables
  useEffect(() => {
    const api = tableRef.current?.dt();
    if (!api) return;
    const rows = api
      .rows({ selected: true })
      .data()
      .toArray() as FuncionarioRm[];
    api.button(".dt-btn-calc-km").enable(rows.length > 0 && !isGeoRunning);
  }, [isGeoRunning]);

  return (
    <>
      <Link className="op-back" to={safeReturn(new URLSearchParams(location.search).get("retorno"))}>
        ← Voltar à operação
      </Link>
      <PageHeading
        area="Operação diária"
        title="Gestão de KM"
        description="Consulte e calcule a distância entre a residência e a unidade de trabalho."
      />
    <div className="op-context ve-filter-bar ve-km-filters">
      <div className="ve-km-branch">
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
              }}
            />
          );
        })()}
      </div>
      <Button
        variant="outline-primary"
        onClick={() => handleBuscarFuncionarios()}
        disabled={isGeoRunning}
      >
        <Icon icon="gravity-ui:person-magnifier" width={20} height={20} />
        <span className="ms-1">Buscar funcionários</span>
      </Button>
      {funcionarios.length > 0 && (
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Button
            variant="outline-success"
            onClick={() => handleCalcularTodosKm()}
            disabled={isGeoRunning}
            >
            <Icon
              icon="solar:calculator-bold-duotone"
              width={20}
              height={20}
              />
            <span className="ms-1">Calcular KM da lista</span>
          </Button>
          <Button
            variant="outline-danger"
            onClick={() => setShowGeoErrorsModal(true)}
            disabled={isGeoRunning || filialId === 0 || funcionarios.length === 0}
            tooltip="Ver erros/logs recentes da fila GEO desta filial"
            >
            <Icon
              icon="solar:danger-circle-bold-duotone"
              width={20}
              height={20}
              />
            <span className="ms-1">Ver erros</span>
          </Button>
        </div>
      )}
    </div>
      <div className="card">
        <div className="card-body">
          {filialId !== 0 && geoStatus?.hasRunning && (
            <div className="alert alert-info py-2 px-3 mb-2">
              Calculando geolocalizações... Pendentes: {geoStatus.pending} /
              Processando: {geoStatus.processing}
            </div>
          )}
          <div className="ve-table-list">
            <DataTable
              className="table striped-table mb-0"
              ref={tableRef}
              // Eventos reais do DataTables Select (nomes em camelCase no wrapper)
              onSelect={syncSelectedRows}
              onDeselect={syncSelectedRows}
              options={{
                ...defaultConfig,
                pageLength: 10,
                layout: {
                  // troca o "pageLength" padrão (topStart) por botões e mantém search no topo (topEnd default)
                  topStart: "buttons",
                },
                buttons: [
                  {
                    text: "<i class='ri-calculator-line me-1'></i> Calcular Km dos selecionados",
                    className:
                      "btn btn-outline-success btn-sm dt-btn-calc-km bg-opacity-0 btn-processar-km",
                    enabled: false,
                    action: () => {
                      const api = tableRef.current?.dt();
                      if (!api) return;
                      const rows = api
                        .rows({ selected: true })
                        .data()
                        .toArray() as FuncionarioRm[];
                      void handleProcessarSelecionados(rows);
                    },
                  },
                ],
                columnDefs: [
                  {
                    targets: ["_all"],
                    className: "text-center",
                  },
                  {
                    targets: 0,
                    className: "select-checkbox text-center",
                    orderable: false,
                    searchable: false,
                    // Padrão oficial do DataTables: renderiza o checkbox de seleção
                    // Ref: https://datatables.net/extensions/fixedcolumns/examples/integration/select-checkbox.html
                    render: DataTablesCore.render.select(),
                  },
                ],
                select: {
                  style: "multi+shift",
                  // Padrão oficial: primeira coluna (onde fica o checkbox)
                  selector: "td:first-child",
                },
              }}
              data={funcionarios}
              columns={[
                // Coluna "checkbox" do DataTables Select (não vem automaticamente)
                { data: null, name: "select", defaultContent: "" },
                { data: "NOME", name: "NOME" },
                { data: "CHAPA", name: "CHAPA" },
                { data: "CARGO", name: "CARGO" },
                { data: "DATAADMISSAO", name: "DATAADMISSAO" },
                {
                  data: "KM",
                  name: "KM",
                  render: (data: unknown, type: string) => {
                    const normalized = Number(
                      String(data ?? "").replace(",", "."),
                    );
                    const hasValue = Number.isFinite(normalized);
                    if (type === "sort" || type === "type") {
                      return hasValue ? normalized : -1;
                    }
                    if (type === "display") {
                      return hasValue
                        ? `${normalized.toFixed(2).replace(".", ",")} km`
                        : "-";
                    }
                    return hasValue ? String(normalized) : "";
                  },
                },
                {
                  data: null,
                  name: "actions",
                  orderable: false,
                  searchable: false,
                },
              ]}
              slots={{
                actions: (row: FuncionarioRm) => (
                  <div>
                    <Button
                      variant="outline-success"
                      onClick={() => handleCalcularFuncKm(row)}
                      tooltip="Calcular Km"
                      className="m-0 px-1 py-1 border-0"
                      disabled={isGeoRunning}
                    >
                      <Icon
                        icon="solar:calculator-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                    <Button
                      variant="outline-info"
                      onClick={() => handleVisualizarKm(row)}
                      tooltip="Visualizar Km"
                      className="m-0 px-1 py-1 border-0"
                      disabled={isGeoRunning}
                    >
                      <Icon
                        icon="solar:eye-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                  </div>
                ),

                DATAADMISSAO: (data: unknown) => (
                  <span>{FunctionsHelper.formatDateOnlyPtBr(data)}</span>
                ),

              }}
            >
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">Nome</th>
                  <th scope="col">CHAPA</th>
                  <th scope="col">CARGO</th>
                  <th scope="col">DATAADMISSAO</th>
                  <th scope="col">KM</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
            </DataTable>
            {/* <div className="card-body d-flex">
          </div> */}
          </div>
        </div>
      </div>

      <Modal
        show={showFunAddressModal}
        onHide={() => setShowFunAddressModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Endereço de <Limited limit={10}>{funToShowAddress?.NOME}</Limited>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-column gap-2 mb-3">
            <Alert variant="info">
              <Alert.Heading className="h6">
                Endereço do funcionário:
              </Alert.Heading>
              {funToShowAddress
                ? FunctionsHelper.formatEnderecoFuncionario(funToShowAddress)
                : "-"}
            </Alert>
            <Alert variant="info">
              <Alert.Heading className="h6">Endereço da filial:</Alert.Heading>
              {funToShowAddress
                ? FunctionsHelper.formatEnderecoFilial(funToShowAddress)
                : "-"}
            </Alert>
            <small className="text-neutral-400">
              *Qualquer alteração no endereço do funcionário ou da filial deve
              ser feita no RM.
            </small>
          </div>
        </Modal.Body>
      </Modal>

      <Modal
        show={showGeoErrorsModal}
        onHide={() => setShowGeoErrorsModal(false)}
        size="xl"
        centered
      >
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title>Erros / logs da fila GEO</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
            <div>
              <Form.Label>Status</Form.Label>
              <Form.Select
                value={geoErrorsStatusFilter}
                onChange={(e) =>
                  setGeoErrorsStatusFilter(
                    e.target.value as
                      | "ALL"
                      | "PENDENTE"
                      | "PROCESSANDO"
                      | "CONCLUIDO"
                      | "ERRO"
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
              onClick={async () => {
                const fid = filialIdRef.current;
                if (!fid) return;
                try {
                  const errs = await filialApi.getGeoQueueErrors(fid, 1000);
                  setGeoErrors(errs);
                } catch (e) {
                  console.warn("Erro ao atualizar erros da fila GEO", e);
                  setGeoErrors([]);
                }
              }}
              tooltip="Atualizar lista"
            >
              <Icon icon="solar:refresh-bold-duotone" width={20} height={20} />
              <span className="ms-1">Atualizar</span>
            </Button>
          </div>

          {(() => {
            const byChapa = new Map(
              (funcionarios ?? []).map((f) => [String(f.CHAPA ?? ""), f])
            );
            const filtered = (geoErrors ?? []).filter((r) => {
              if (geoErrorsStatusFilter === "ALL") return true;
              return r.status === geoErrorsStatusFilter;
            });
            return (
              <div className="table-responsive" style={{ maxWidth: "100%" }}>
                <Table className="table table-sm striped-table w-100 mb-0 fs-12">
                  <thead>
                    <tr className="bg-danger bg-opacity-10">
                      <th>Atualizado em</th>
                      <th>Status</th>
                      <th>Chapa</th>
                      <th>Funcionário</th>
                      <th>Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-muted text-center">
                          Nenhum log/erro encontrado.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((r) => {
                        const func = byChapa.get(String(r.chapa ?? "")) ?? null;
                        return (
                          <tr key={r.geoQueueId}>
                            <td>
                              {FunctionsHelper.formatDateTimePtBr(r.updatedAt)}
                            </td>
                            <td>{r.status}</td>
                            <td>{r.chapa}</td>
                            <td>
                              {func ? (
                                <Limited limit={20}>{func.NOME}</Limited>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td>
                              <Limited limit={120} placement="top">
                                {r.lastError}
                              </Limited>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </Table>
              </div>
            );
          })()}
        </Modal.Body>
      </Modal>
    </>
  );
}
