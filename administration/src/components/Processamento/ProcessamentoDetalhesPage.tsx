import { Icon } from "@iconify/react";
import { Button } from "../utils/Button";
import { useNavigate, useParams } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";

import DataTable, { type DataTableRef } from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import "datatables.net-bs5";
// JS do plugin (registra `render.select()` etc.)
import "datatables.net-select";
// Wrapper Bootstrap (ajusta classes do checkbox para Bootstrap 5)
import "datatables.net-select-bs5";
// JS do Buttons (para ações no header do DataTable)
import "datatables.net-buttons";
// Wrapper Bootstrap 5 do Buttons
import "datatables.net-buttons-bs5";
import { ExecucaoApi } from "../../utils/api/execucaoApi";
import type { Execucao } from "../../models/ExecucaoModel";
import { FunctionsHelper } from "../../utils/functionsHelper";
import { defaultConfig } from "../../utils/datatables/defaultConfig";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { SwalHelper } from "../../utils/swalHelper";
import {
  Alert,
  Form,
  Modal,
  OverlayTrigger,
  Popover as BootstrapPopover,
  Table,
} from "react-bootstrap";
import { Popover } from "../Popover";
import { useBlockUi } from "../../app/providers/blockUiContext";
import type { ExecFuncBase } from "../../models/ExecFuncBaseModel";
import { Tooltip } from "../Tooltip";
import type { ExecFunc } from "../../models/ExecFuncModel";
import { Limited } from "../utils/Limited";
import { renderToString } from "react-dom/server";
import { AssistenteVale } from "./AssistenteVale";

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);

type EditResultFunc = ExecFunc & {
  new_valor_final?: number;
  motivo_ajuste?: string;
};
export function ProcessamentoDetalhesPage() {
  const navigate = useNavigate();
  const { execucaoId } = useParams<{ execucaoId: string }>();
  const [execucao, setExecucao] = useState<Execucao>({} as Execucao);
  const execucaoStatusRef = useRef<string | undefined>(undefined);
  const execucaoFilialIdRef = useRef<number>(0);
  const kmMaxFilialRef = useRef<number>(0);
  const [viewResultsFuncBase, setViewResultsFuncBase] = useState<ExecFuncBase>(
    {} as ExecFuncBase,
  );
  const [editResultFunc, setEditResultFunc] = useState<EditResultFunc>(
    {} as EditResultFunc,
  );
  const [showVerFormulasModal, setShowVerFormulasModal] = useState(false);
  const [showVerResultadosModal, setShowVerResultadosModal] = useState(false);
  const [showEditarResultadoModal, setShowEditarResultadoModal] =
    useState(false);
  const [showVerVariaveisModal, setShowVerVariaveisModal] = useState(false);
  const { show: blockUiShow, hide: blockUiHide } = useBlockUi();
  const [, setSelectedRows] = useState<ExecFuncBase[]>([]);
  const tableRef = useRef<DataTableRef>(null);
  const [queueStatus, setQueueStatus] = useState<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  } | null>(null);
  const [queueItems, setQueueItems] = useState<
    Array<{
      queueId: number;
      execucaoFuncionarioBaseId: number;
      nomeFuncionario: string;
      funcionarioIdRm: string;
      cargo: string;
      tipo: string;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  >([]);
  const [showQueueDetails, setShowQueueDetails] = useState(false);
  const [showErrorsModal, setShowErrorsModal] = useState(false);
  const [errorsRows, setErrorsRows] = useState<
    Array<{
      id: string;
      source: "QUEUE" | "LOG";
      tipo: string | null;
      status: string | null;
      funcionarioIdRm: string | null;
      nomeFuncionario: string | null;
      message: string;
      createdAt: string;
    }>
  >([]);
  const [errorsFilterSource, setErrorsFilterSource] = useState<
    "ALL" | "QUEUE" | "LOG"
  >("ALL");
  const [errorsFilterTipo, setErrorsFilterTipo] = useState<
    "ALL" | "VARIAVEIS" | "VALORES" | "ENVIAR_RM"
  >("ALL");

  const buildGestaoKmUrl = useCallback((filialId: number, chapa?: string) => {
    const params = new URLSearchParams();
    if (Number(filialId) > 0) params.set("filialId", String(filialId));
    if (chapa && String(chapa).trim())
      params.set("chapa", String(chapa).trim());
    const qs = params.toString();
    return qs ? `/gestao-km?${qs}` : "/gestao-km";
  }, []);

  const openGestaoKm = useCallback(
    (filialId: number, chapa?: string) => {
      const url = buildGestaoKmUrl(filialId, chapa);
      window.open(url, "_blank", "noopener");
    },
    [buildGestaoKmUrl],
  );

  const parseKmToNumber = useCallback((value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    // Prisma Decimal às vezes pode vir como objeto com toString/toJSON.
    // Também tolera valores "stringified".
    if (typeof value !== "string") {
      try {
        const s0 = (value as { toString?: () => string } | null)?.toString?.();
        if (typeof s0 !== "string") return null;
        if (s0 === "[object Object]") return null;
        value = s0;
      } catch {
        return null;
      }
    }
    const s = String(value).trim();
    if (!s) return null;
    // tolera "5,68", "5.68", "5,68 km"
    const normalized = s
      .replace(/km/gi, "")
      .replace(/\s+/g, "")
      .replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }, []);

  const missingKmCount = (execucao.execucao_funcionario_base ?? []).filter(
    (b) => b.km === null || b.km === undefined || b.km === 0,
  ).length;

  const kmMaxFilial = parseKmToNumber(execucao.filial?.km_max);
  const kmMaxExceededCount =
    kmMaxFilial !== null && Number.isFinite(kmMaxFilial) && kmMaxFilial > 0
      ? (execucao.execucao_funcionario_base ?? []).filter((b) => {
          const kmNumber = parseKmToNumber(b.km);
          return (
            kmNumber !== null &&
            Number.isFinite(kmNumber) &&
            kmNumber > kmMaxFilial
          );
        }).length
      : 0;

  const updateKmMaxFilialRefFromExecucao = useCallback(
    (e: Execucao) => {
      const km = parseKmToNumber(e?.filial?.km_max);
      kmMaxFilialRef.current =
        km !== null && Number.isFinite(km) && km > 0 ? km : 0;
    },
    [parseKmToNumber],
  );

  // Evita callback "stale" preso no DataTables (slots/renderers podem cachear closures do 1º render)
  useEffect(() => {
    kmMaxFilialRef.current =
      kmMaxFilial !== null && Number.isFinite(kmMaxFilial) ? kmMaxFilial : 0;
  }, [kmMaxFilial]);

  // type ExecFuncBaseTableRow = ExecFuncBase & { km_sort: number | null };
  // const funcionariosTableData = useMemo<ExecFuncBaseTableRow[]>(() => {
  //     return (execucao.execucao_funcionario_base ?? []).map((row) => ({
  //       ...(row as ExecFuncBase),
  //       km_sort: parseKmToNumber(row.km),
  //     }));
  //   }, [execucao.execucao_funcionario_base, parseKmToNumber]);

  const [kmMaxFilterActive, setKmMaxFilterActive] = useState<boolean>(false);
  type DtSearchFn = (
    settings: unknown,
    data: unknown,
    dataIndex: number,
  ) => boolean;
  const kmMaxFilterFnRef = useRef<DtSearchFn | null>(null);

  useEffect(() => {
    // Cleanup: remove filtro global se estiver registrado
    return () => {
      if (kmMaxFilterFnRef.current) {
        const fn = kmMaxFilterFnRef.current;
        const core = DataTablesCore as unknown as {
          ext?: { search?: DtSearchFn[] };
        };
        const current = Array.isArray(core.ext?.search)
          ? core.ext!.search!
          : [];
        if (!core.ext) core.ext = {};
        core.ext.search = current.filter((x) => x !== fn);
        kmMaxFilterFnRef.current = null;
      }
    };
  }, []);

  const toggleKmMaxFilter = useCallback(() => {
    const api = tableRef.current?.dt();
    if (!api) return;

    const tableNode = api.table().node();

    if (!kmMaxFilterActive) {
      const kmMax = parseKmToNumber(execucao.filial?.km_max);
      const fn: DtSearchFn = (settings, _data, dataIndex) => {
        try {
          const s = settings as {
            nTable?: unknown;
            aoData?: Array<{ _aData?: unknown }>;
          };
          // garante que filtra só esta tabela
          if (s?.nTable !== tableNode) return true;
          const rowDataRaw = s?.aoData?.[dataIndex]?._aData as unknown;
          const rowData = rowDataRaw as ExecFuncBase | undefined;
          if (!rowData) return true;
          const anyRow = rowData as unknown as {
            km_sort?: unknown;
            km?: unknown;
          };
          const kmSort =
            typeof anyRow.km_sort === "number" &&
            Number.isFinite(anyRow.km_sort)
              ? anyRow.km_sort
              : null;
          const kmNumber = kmSort ?? parseKmToNumber(anyRow.km);
          if (kmNumber === null || !Number.isFinite(kmNumber)) return false;
          if (kmMax === null || !Number.isFinite(kmMax) || kmMax <= 0)
            return false;
          return kmNumber > kmMax;
        } catch {
          return true;
        }
      };

      const core = DataTablesCore as unknown as {
        ext?: { search?: DtSearchFn[] };
      };
      if (!core.ext) core.ext = {};
      const arr = Array.isArray(core.ext.search) ? core.ext.search : [];
      arr.push(fn);
      core.ext.search = arr;
      kmMaxFilterFnRef.current = fn;
      setKmMaxFilterActive(true);
      api.draw();
      return;
    }

    // desativar
    if (kmMaxFilterFnRef.current) {
      const fn = kmMaxFilterFnRef.current;
      const core = DataTablesCore as unknown as {
        ext?: { search?: DtSearchFn[] };
      };
      const current = Array.isArray(core.ext?.search) ? core.ext!.search! : [];
      if (!core.ext) core.ext = {};
      core.ext.search = current.filter((x) => x !== fn);
      kmMaxFilterFnRef.current = null;
    }
    setKmMaxFilterActive(false);
    api.draw();
  }, [execucao.filial?.km_max, kmMaxFilterActive, parseKmToNumber]);

  // Evita callback "stale" preso no DataTables (ex.: filial_id ainda 0 no primeiro render)
  const execucaoFilialId = execucao?.filial_id;
  useEffect(() => {
    const fid = Number(execucaoFilialId);
    execucaoFilialIdRef.current = Number.isFinite(fid) ? fid : 0;
  }, [execucaoFilialId]);

  const syncDataTableButtonsState = useCallback(() => {
    const api = tableRef.current?.dt();
    if (!api) return;

    const selectedRows = api
      .rows({ selected: true })
      .data()
      .toArray() as ExecFuncBase[];

    const currentStatus = execucaoStatusRef.current;
    const canRun =
      Boolean(currentStatus) && currentStatus !== "EM_PROCESSAMENTO";
    const hasSelection = selectedRows.length > 0;
    const allReadyToSendRm =
      hasSelection &&
      selectedRows.every(
        (r) =>
          r.status === "RESULTADOS_PROCESSADOS" ||
          r.status === "ENVIADO_RM" ||
          r.status === "ERRO_RM",
      );

    api.button(".dt-btn-processar-valores").enable(canRun && hasSelection);
    api.button(".dt-btn-processar-variaveis").enable(canRun && hasSelection);
    api
      .button(".dt-btn-enviar-rm")
      .enable(canRun && hasSelection && allReadyToSendRm);
  }, []);

  const atualizaTabelaFuncionarios =
    useCallback(async (): Promise<Execucao> => {
      const execucaoAtualizada = await ExecucaoApi.getById(Number(execucaoId));
      console.log("execucaoAtualizada", execucaoAtualizada);
      changeAllKmToNumber(execucaoAtualizada);
      updateKmMaxFilialRefFromExecucao(execucaoAtualizada);
      setExecucao(execucaoAtualizada);
      // garante que os botões do DT reflitam o status novo (ex.: EM_PROCESSAMENTO)
      setTimeout(() => syncDataTableButtonsState(), 0);
      return execucaoAtualizada;
    }, [
      execucaoId,
      syncDataTableButtonsState,
      updateKmMaxFilialRefFromExecucao,
    ]);

  useEffect(() => {
    ExecucaoApi.getById(Number(execucaoId)).then((execucao: Execucao) => {
      changeAllKmToNumber(execucao);
      updateKmMaxFilialRefFromExecucao(execucao);
      setExecucao(execucao);
    });
  }, [execucaoId, updateKmMaxFilialRefFromExecucao]);

  // Mantém o status mais recente em ref (evita callback "stale" preso no DataTables)
  useEffect(() => {
    execucaoStatusRef.current = execucao?.status;
  }, [execucao?.status]);

  const fetchQueueStatus = useCallback(async () => {
    if (!execucaoId) return;
    const status = await ExecucaoApi.getQueueStatus(Number(execucaoId));
    setQueueStatus(status);
    if (
      !status.hasRunning &&
      execucaoStatusRef.current === "EM_PROCESSAMENTO"
    ) {
      void atualizaTabelaFuncionarios();
    }
  }, [execucaoId, atualizaTabelaFuncionarios]);

  const fetchQueueItems = useCallback(async () => {
    if (!execucaoId) return;
    const items = await ExecucaoApi.getQueueItems(Number(execucaoId));
    setQueueItems(items);
  }, [execucaoId]);

  const fetchErrors = useCallback(async () => {
    if (!execucaoId) return;
    const rows = await ExecucaoApi.getErrors(Number(execucaoId));
    setErrorsRows(rows);
  }, [execucaoId]);

  // Polling leve (20s) para status da fila enquanto houver processamento
  useEffect(() => {
    if (!execucaoId) return;
    if (execucao.status !== "EM_PROCESSAMENTO") return;

    void fetchQueueStatus();
    if (showQueueDetails) {
      void fetchQueueItems();
    }
    const interval = setInterval(() => {
      void fetchQueueStatus();
      if (showQueueDetails) {
        void fetchQueueItems();
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [
    execucao.status,
    execucaoId,
    showQueueDetails,
    fetchQueueStatus,
    fetchQueueItems,
  ]);

  useEffect(() => {
    if (!showQueueDetails) return;
    void fetchQueueItems();
  }, [showQueueDetails, fetchQueueItems]);

  // Sempre que o status mudar, sincroniza os botões do DataTable
  useEffect(() => {
    syncDataTableButtonsState();
  }, [execucao.status, syncDataTableButtonsState]);

  const changeAllKmToNumber = (execucao: Execucao) => {
    execucao.execucao_funcionario_base?.forEach((b) => {
      b.km = Number(b.km) || 0;
    });
  };

  const getKmMax = useCallback(() => kmMaxFilialRef.current, []);

  //Handlers
  const handleProcessarValores = async () => {
    console.log("Processar Todos");
    const confirm = await Swal.fire({
      title: "Processar todos?",
      text: "Esta ação irá calcular todos os valores de todos os funcionários do processamento.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sim, processar todos",
      confirmButtonColor: "#28a745",
      cancelButtonText: "Cancelar",
      cancelButtonColor: "#dc3545",
    });

    try {
      if (confirm.isConfirmed) {
        if (execucao.status === "EM_PROCESSAMENTO") {
          SwalHelper.errorToast("Já existe um processamento em andamento.");
          return;
        }

        const allRows = execucao.execucao_funcionario_base ?? [];
        // exige que todos tenham variáveis processadas (senão valores vão falhar)
        const hasPrevia = allRows.some(
          (r) => r.status === "PREVIA" || !r.status,
        );
        if (hasPrevia) {
          SwalHelper.errorToast(
            "Primeiro é necessário processar as variáveis de todos os funcionários.",
          );
          return;
        }

        const response = await ExecucaoApi.enqueueValoresTodos(
          Number(execucaoId),
          allRows.map((r) => r.execucao_funcionario_base_id),
        );
        if (response.status) {
          SwalHelper.successToast(response.message);
          void atualizaTabelaFuncionarios();
        } else {
          Swal.fire(response.message, "error");
        }
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Erro ao processar valores", "", "error");
    } finally {
      blockUiHide();
    }
  };
  const handleVerFormulas = () => {
    console.log("Ver Formulas");
    setShowVerFormulasModal(true);
  };

  const handleProcessarVariaveis = async () => {
    try {
      if (execucao.status === "EM_PROCESSAMENTO") {
        SwalHelper.errorToast("Já existe um processamento em andamento.");
        return;
      }
      blockUiShow("Processando variáveis");

      const allRows = execucao.execucao_funcionario_base ?? [];
      const response = await ExecucaoApi.enqueueVariaveisTodos(
        Number(execucaoId),
        allRows.map((r) => r.execucao_funcionario_base_id),
      );

      if (response.status) {
        SwalHelper.successToast(response.message);
        void atualizaTabelaFuncionarios();
      } else {
        Swal.fire(response.message, "error");
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Erro ao processar variáveis", "", "error");
    } finally {
      blockUiHide();
    }
  };

  const handleVisualizarResultados = (row: ExecFuncBase) => {
    console.log("Visualizar Resultados", row);
    setViewResultsFuncBase(row);
    setShowVerResultadosModal(true);
  };
  const handleEditarResultado = (execFunc: ExecFunc) => {
    console.log("Editar Resultado", execFunc);
    setEditResultFunc(execFunc);
    setShowVerResultadosModal(false);
    setShowEditarResultadoModal(true);
  };

  const handleCloseEditarResultadoModal = () => {
    setShowEditarResultadoModal(false);
    setShowVerResultadosModal(true);
  };

  const handleSaveEditarResultado = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();

    blockUiShow("Salvando resultado");
    const response = await ExecucaoApi.editarResultado(
      Number(execucaoId),
      editResultFunc.execucao_funcionario_id,
      editResultFunc,
    );
    if (response.status) {
      SwalHelper.successToast(response.message);
      const execucaoAtualizada = await atualizaTabelaFuncionarios();
      const funcBaseAtualizado =
        execucaoAtualizada.execucao_funcionario_base?.find(
          (f) =>
            f.execucao_funcionario_base_id ===
            viewResultsFuncBase.execucao_funcionario_base_id,
        );
      if (funcBaseAtualizado) {
        setViewResultsFuncBase(funcBaseAtualizado);
      }
      handleCloseEditarResultadoModal();
    } else {
      Swal.fire(response.message, "error");
    }
    blockUiHide();
  };
  const handleVisualizarVariaveis = (row: ExecFuncBase) => {
    console.log("Visualizar Variaveis", row);
    setViewResultsFuncBase(row);
    setShowVerVariaveisModal(true);
  };
  const handleSelectFuncionarios = () => {
    const api = tableRef.current?.dt();
    if (!api) return;

    const rows = api
      .rows({ selected: true })
      .data()
      .toArray() as ExecFuncBase[];
    setSelectedRows(rows);

    console.log("Selected Rows", rows);

    syncDataTableButtonsState();
  };
  const handleProcessarValoresSelecionados = async (rows: ExecFuncBase[]) => {
    //passa por rows e verifica se algum é PREVIA
    const isPrevio = rows.some((row) => row.status === "PREVIA");
    if (isPrevio) {
      SwalHelper.errorToast(
        "Primeiro é necessário processar as variáveis de todos os funcionários selecionados.",
      );
      return;
    }

    const confirm = await SwalHelper.confirm(
      "Processar Valores?",
      "Esta ação irá calcular os valores de todos os funcionários selecionados. Se algum funcionário já tiver valores processados, eles serão sobrescritos.",
      "question",
      "Sim, processar valores",
      "Não, cancelar",
    );
    if (!confirm.isConfirmed) return;

    try {
      if (execucao.status === "EM_PROCESSAMENTO") {
        SwalHelper.errorToast("Já existe um processamento em andamento.");
        return;
      }
      const response = await ExecucaoApi.processarValoresSelecionados(
        Number(execucaoId),
        rows.map((r) => r.execucao_funcionario_base_id),
      );
      if (response.status) {
        SwalHelper.successToast(response.message);
        void atualizaTabelaFuncionarios();
      } else {
        Swal.fire(response.message, "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Erro ao processar valores", "", "error");
    }
  };

  const handleEnviarRmSelecionados = async (rows: ExecFuncBase[]) => {
    const hasInvalid = rows.some(
      (r) =>
        r.status !== "RESULTADOS_PROCESSADOS" &&
        r.status !== "ENVIADO_RM" &&
        r.status !== "ERRO_RM",
    );
    if (hasInvalid) {
      SwalHelper.errorToast(
        "Apenas funcionários com RESULTADOS_PROCESSADOS ou ENVIADO_RM podem ser enviados ao RM.",
      );
      return;
    }

    const confirm = await SwalHelper.confirm(
      "Enviar para o RM?",
      "Esta ação irá enviar os resultados (por fórmula) ao RM para todos os funcionários selecionados.",
      "question",
      "Sim, enviar",
      "Não, cancelar",
    );
    if (!confirm.isConfirmed) return;

    try {
      if (execucao.status === "EM_PROCESSAMENTO") {
        SwalHelper.errorToast("Já existe um processamento em andamento.");
        return;
      }
      const response = await ExecucaoApi.enqueueEnviarRmBatch(
        Number(execucaoId),
        rows.map((r) => r.execucao_funcionario_base_id),
      );
      if (response.status) {
        SwalHelper.successToast(response.message);
        void atualizaTabelaFuncionarios();
      } else {
        Swal.fire(response.message, "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Erro ao enviar para o RM", "", "error");
    }
  };

  const handleEnviarRmTodos = async () => {
    const confirm = await Swal.fire({
      title: "Enviar todos para o RM?",
      text: "Esta ação irá enviar para o RM todos os funcionários com RESULTADOS_PROCESSADOS.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sim, enviar",
      confirmButtonColor: "#28a745",
      cancelButtonText: "Cancelar",
      cancelButtonColor: "#dc3545",
    });

    try {
      if (!confirm.isConfirmed) return;
      if (execucao.status === "EM_PROCESSAMENTO") {
        SwalHelper.errorToast("Já existe um processamento em andamento.");
        return;
      }

      const allRows = execucao.execucao_funcionario_base ?? [];
      const ready = allRows.filter(
        (r) =>
          r.status === "RESULTADOS_PROCESSADOS" ||
          r.status === "ENVIADO_RM" ||
          r.status === "ERRO_RM",
      );
      if (ready.length === 0) {
        SwalHelper.errorToast(
          "Nenhum funcionário com RESULTADOS_PROCESSADOS, ENVIADO_RM ou ERRO_RM para enviar.",
        );
        return;
      }

      const response = await ExecucaoApi.enqueueEnviarRmBatch(
        Number(execucaoId),
        ready.map((r) => r.execucao_funcionario_base_id),
      );
      if (response.status) {
        SwalHelper.successToast(response.message);
        void atualizaTabelaFuncionarios();
      } else {
        Swal.fire(response.message, "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Erro ao enviar para o RM", "", "error");
    }
  };
  const handleProcessarVariaveisSelecionados = async (rows: ExecFuncBase[]) => {
    const confirm = await SwalHelper.confirm(
      "Processar Variaveis?",
      "Esta ação irá calcular as variáveis de todos os funcionários selecionados. Se algum funcionário já tiver variáveis processadas, elas serão sobrescritas.",
      "question",
      "Sim, processar variaveis",
      "Não, cancelar",
    );
    if (!confirm.isConfirmed) return;

    try {
      if (execucao.status === "EM_PROCESSAMENTO") {
        SwalHelper.errorToast("Já existe um processamento em andamento.");
        return;
      }
      const response = await ExecucaoApi.processarVariaveisSelecionados(
        Number(execucaoId),
        rows.map((r) => r.execucao_funcionario_base_id),
      );
      if (response.status) {
        SwalHelper.successToast(response.message);
        void atualizaTabelaFuncionarios();
      } else {
        Swal.fire(response.message, "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Erro ao processar variáveis", "", "error");
    }
  };
  const uniqueMemorias = (() => {
    const seen = new Set<string>();
    const memorias =
      viewResultsFuncBase.execucao_funcionario?.flatMap(
        (execFunc) => execFunc.memoria_calculo ?? [],
      ) ?? [];
    return memorias.filter((memoria) => {
      const codigo = String(memoria.variavel_codigo ?? "");
      if (!codigo || seen.has(codigo)) {
        return false;
      }
      seen.add(codigo);
      return true;
    });
  })();
  return (
    <div className="card card-body">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
        <div className="d-flex align-items-center gap-2">
          <Button
            variant="outline-secondary"
            className="m-0 px-1 py-1 border-0"
            onClick={() => navigate(`/processamento`)}
          >
            <Icon icon="solar:alt-arrow-left-linear" width={20} height={20} />
          </Button>
          <h1 className="h4 m-0 p-0">Processamento</h1>
        </div>
        <div className="d-flex align-items-center gap-2">
          {execucao.periodo && execucao.filial && (
            <AssistenteVale
              periodo={execucao.periodo}
              filialId={execucao.filial_id}
              periodos={[execucao.periodo]}
              filiais={[execucao.filial]}
            />
          )}
          <Button
            variant="link"
            onClick={async () => {
              await fetchErrors();
              setShowErrorsModal(true);
            }}
            tooltip="Ver erros (fila + logs)"
            className="btn btn-link p-0 m-0 text-danger border-0"
          >
            <Icon
              icon="solar:danger-circle-bold-duotone"
              width={20}
              height={20}
            />
          </Button>
          {/* <Button variant="primary">
            <Icon icon="tabler:plus" width={20} height={20} />
            <span className="ms-1">Nova formula</span>
          </Button> */}
        </div>
      </div>
      <div>
        {/* <h5 className="mb-3">Detalhes do processamento</h5> */}
        <div className="card card-body bg-info bg-opacity-10 border-1 border-info">
          <div className="row">
            <div className="col-md-6">
              <ul>
                <li>
                  <span className="fw-bold">•Filial:</span>{" "}
                  {execucao.filial?.nome}
                </li>
                <li>
                  <span className="fw-bold">•Competência:</span>{" "}
                  {execucao.periodo?.competencia}
                </li>
                <li>
                  <span className="fw-bold">•Formulas:</span>{" "}
                  <Button
                    variant="link"
                    onClick={handleVerFormulas}
                    tooltip="Ver Formulas"
                    className="p-0 m-0 border-0"
                  >
                    <Icon
                      icon="solar:square-share-line-line-duotone"
                      width={16}
                      height={16}
                    />
                  </Button>
                </li>
              </ul>
            </div>
            <div className="col-md-6">
              <ul>
                <li>
                  <span className="fw-bold">•Criado por:</span>{" "}
                  {execucao.usuario?.nome}
                </li>
                <li>
                  <span className="fw-bold">•Criado em:</span>{" "}
                  {new Date(execucao.data_execucao).toLocaleDateString()}
                </li>
                <li>
                  <span className="fw-bold">•Status:</span>{" "}
                  {FunctionsHelper.formatStatusExecucao(execucao.status)}
                </li>
              </ul>
            </div>
          </div>
          <div className="row mt-3">
            <div className="d-flex justify-content-end gap-2">
              <Button
                variant="outline-success"
                onClick={handleProcessarVariaveis}
                tooltip={
                  !execucao.status
                    ? "Carregando execução..."
                    : execucao.status === "EM_PROCESSAMENTO"
                      ? "Aguarde o processamento em andamento"
                      : "Enfileirar processamento de variáveis (todos)"
                }
                disabled={
                  !execucao.status || execucao.status === "EM_PROCESSAMENTO"
                }
              >
                <Icon icon="hugeicons:variable" width={20} height={20} />
                <span className="ms-1">Processar Variaveis</span>
              </Button>

              <Button
                variant="outline-primary"
                onClick={handleProcessarValores}
                tooltip={
                  !execucao.status
                    ? "Carregando execução..."
                    : execucao.status === "EM_PROCESSAMENTO"
                      ? "Aguarde o processamento em andamento"
                      : "Enfileirar processamento de valores (todos)"
                }
                disabled={
                  !execucao.status || execucao.status === "EM_PROCESSAMENTO"
                }
              >
                <Icon
                  icon="solar:calculator-bold-duotone"
                  width={20}
                  height={20}
                />
                <span className="ms-1">Processar Valores</span>
              </Button>
              <Button
                variant="outline-info"
                onClick={handleEnviarRmTodos}
                tooltip={
                  !execucao.status
                    ? "Carregando execução..."
                    : execucao.status === "EM_PROCESSAMENTO"
                      ? "Aguarde o processamento em andamento"
                      : "Enfileirar envio ao RM (valores processados)"
                }
                disabled={
                  !execucao.status || execucao.status === "EM_PROCESSAMENTO"
                }
              >
                <Icon icon="ri:upload-2-line" width={20} height={20} />
                <span className="ms-1">Enviar para RM</span>
              </Button>
            </div>
          </div>
        </div>
        <h6 className="h6 mt-3">Funcionários</h6>
        <div className="row">
          <div className="col-6">
            {execucao.status === "EM_PROCESSAMENTO" &&
              queueStatus?.hasRunning && (
                <div className="alert alert-info py-2 px-3 mb-2">
                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <span>
                      Processando... Pendentes: {queueStatus.pending} /
                      Processando: {queueStatus.processing}
                    </span>
                    <Button
                      variant="link"
                      className="p-0 m-0 fs-12"
                      onClick={() => setShowQueueDetails((prev) => !prev)}
                    >
                      {showQueueDetails ? "Ocultar fila" : "Ver fila"}
                    </Button>
                  </div>
                </div>
              )}
            {execucao.status === "EM_PROCESSAMENTO" &&
              queueStatus?.hasRunning &&
              showQueueDetails && (
                <div className="border rounded bg-neutral p-2 mb-2">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <strong>Fila em andamento</strong>
                    <span className="text-neutral-500 fs-12">
                      {queueItems.length} itens
                    </span>
                  </div>
                  {queueItems.length === 0 ? (
                    <div className="text-muted fs-12">
                      Nenhum item pendente no momento.
                    </div>
                  ) : (
                    <div
                      className="table-responsive"
                      style={{ maxWidth: "100%" }}
                    >
                      <Table className="table table-sm mb-0 fs-10 striped-table w-100">
                        <thead>
                          <tr>
                            <th>Funcionário</th>
                            <th>Chapa</th>
                            <th>Tipo</th>
                            <th>Status</th>
                            <th>Tentativas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {queueItems.map((item) => (
                            <tr key={item.queueId}>
                              <td>
                                <Limited limit={10}>
                                  {item.nomeFuncionario}
                                </Limited>
                              </td>
                              <td>{item.funcionarioIdRm}</td>
                              <td>{item.tipo}</td>
                              <td>{item.status}</td>
                              <td>{item.tentativas}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
        <div className="w-100 datatable-fullwidth">
          {missingKmCount > 0 && (
            <Alert variant="warning" className="mb-2">
              <div className="d-flex align-items-center justify-content-between gap-2">
                <div>
                  <Alert.Heading className="h6 mb-1">
                    Atenção: KM faltando
                  </Alert.Heading>
                  <div className="fs-12">
                    Existem <strong>{missingKmCount}</strong> funcionário(s) sem
                    KM calculado neste processamento. Isso não impede o
                    processamento, mas pode afetar validações/avisos.
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <Button
                    variant="outline-warning"
                    className="m-0"
                    onClick={() => openGestaoKm(execucaoFilialIdRef.current)}
                    tooltip="Abrir Gestão KM"
                  >
                    <Icon icon="solar:map-point-wave-bold-duotone" width={18} />
                    <span className="ms-1">Abrir Gestão KM</span>
                  </Button>
                </div>
              </div>
            </Alert>
          )}
          {kmMaxExceededCount > 0 && (
            <Alert variant="danger" className="mb-2">
              <div className="d-flex align-items-center justify-content-between gap-2">
                <div>
                  <Alert.Heading className="h6 mb-1">
                    Atenção: KM acima do limite
                  </Alert.Heading>
                  <div className="fs-12">
                    Existem <strong>{kmMaxExceededCount}</strong> funcionário(s)
                    com KM calculado acima do limite da filial{" "}
                    <strong>
                      {Number(kmMaxFilial ?? 0)
                        .toFixed(2)
                        .replace(".", ",")}{" "}
                      km
                    </strong>
                    .
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <Button
                    variant={
                      kmMaxFilterActive ? "outline-secondary" : "outline-danger"
                    }
                    className="m-0"
                    onClick={toggleKmMaxFilter}
                    tooltip={
                      kmMaxFilterActive
                        ? "Remover filtro"
                        : "Filtrar somente KM acima do limite"
                    }
                  >
                    <Icon icon="solar:filter-bold-duotone" width={18} />
                    <span className="ms-1">
                      {kmMaxFilterActive
                        ? "Mostrar todos"
                        : "Mostrar somente acima"}
                    </span>
                  </Button>
                </div>
              </div>
            </Alert>
          )}
          <DataTable
            className="table striped-table mb-0 fs-12"
            options={{
              ...defaultConfig,
              pageLength: 50,
              // `responsive` e `scrollY/scrollX` tendem a conflitar (wrappers com largura calculada menor que o container)
              responsive: false,
              // Com scroll, deixa o DT calcular corretamente a largura/colunas
              autoWidth: true,
              columnDefs: [
                {
                  // KM (índice 5): sort/type numérico, display vem do slot React
                  targets: [5],
                  type: "num",
                  render: (data: unknown, type: string) => {
                    if (type === "sort" || type === "type") {
                      const kmNumber = parseKmToNumber(data);
                      return kmNumber !== null && Number.isFinite(kmNumber)
                        ? kmNumber
                        : -1;
                    }
                    return data;
                  },
                },
                {
                  targets: ["_all"],
                  className: "text-center",
                  render: (data: unknown) => {
                    if (data === null || data === undefined || data === "") {
                      return "<span className='text-muted'>-</span>";
                    }
                    return data;
                  },
                },
              ],
              layout: {
                topStart: "buttons",
              },
              order: [[1, "asc"]],
              paging: true,
              scrollCollapse: true,
              scrollX: true,
              scrollY: "30vh",
              select: {
                style: "multi+shift",
                selector: "td:first-child",
              },
              buttons: [
                {
                  text: "<i class='ri-calculator-line me-1'></i>Processar Variaveis",
                  enabled: false,
                  titleAttr: "Processar Variaveis dos selecionados",
                  title: "Processar Variaveis dos selecionados",
                  className:
                    "btn btn-outline-success btn-sm dt-btn-processar-variaveis",
                  action: () => {
                    const api = tableRef.current?.dt();
                    if (!api) return;
                    const rows = api
                      .rows({ selected: true })
                      .data()
                      .toArray() as ExecFuncBase[];
                    void handleProcessarVariaveisSelecionados(rows);
                  },
                },
                {
                  text: "<i class='ri-calculator-line me-1'></i>Processar Valores",
                  enabled: false,
                  titleAttr: "Processar Valores dos selecionados",
                  title: "Processar Valores dos selecionados",
                  className:
                    "btn btn-outline-primary btn-sm dt-btn-processar-valores bg-opacity-0 text-primary btn-processar-valores",

                  action: () => {
                    const api = tableRef.current?.dt();
                    if (!api) return;
                    const rows = api
                      .rows({ selected: true })
                      .data()
                      .toArray() as ExecFuncBase[];
                    void handleProcessarValoresSelecionados(rows);
                  },
                },

                {
                  text: "<i class='ri-upload-2-line me-1'></i>Enviar para RM",
                  enabled: false,
                  titleAttr: "Enviar para RM (selecionados)",
                  title: "Enviar para RM (selecionados)",
                  className:
                    "btn btn-outline-dark btn-sm dt-btn-enviar-rm btn-enviar-rm",
                  action: () => {
                    const api = tableRef.current?.dt();
                    if (!api) return;
                    const rows = api
                      .rows({ selected: true })
                      .data()
                      .toArray() as ExecFuncBase[];
                    void handleEnviarRmSelecionados(rows);
                  },
                },
              ],
            }}
            data={execucao.execucao_funcionario_base}
            columns={[
              {
                data: null,
                name: "selection",
                orderable: false,
                searchable: false,
                render: DataTablesCore.render.select(),
              },
              { data: "nome_funcionario", name: "nome" },
              { data: "funcionario_id_rm", name: "codigo" },
              { data: "cargo", name: "cargo" },
              { data: "data_admissao", name: "data_admissao" },
              {
                data: "km",
                name: "km",
                render: (data: unknown, type: string) => {
                  const normalized = Number(
                    String(data ?? "").replace(",", "."),
                  );
                  const hasValue = Number.isFinite(normalized);
                  if (type === "sort" || type === "type") {
                    return hasValue ? normalized : -1;
                  }
                  if (type === "display") {
                    const kmMax = getKmMax();
                    const isAboveMax = normalized > kmMax;
                    const isKmMissing = normalized === 0;
                    // const finalHtml = `
                    //   <div className="d-flex align-items-center flex-row gap-2">
                    //     <span class=>${normalized.toFixed(2).replace(".", ",")} km</span>
                    //     ${isAboveMax ? `<span class="text-danger">${kmMax}</span>` : `<span class="text-success">${kmMax}</span>`}
                    //     <button type="button" class="btn btn-link p-0 m-0 border-0" onclick="openGestaoKm(${execucaoFilialIdRef.current}, ${row.funcionario_id_rm})">
                    //   </div>
                    // `;
                    return renderToString(
                      <span
                        className={`${isAboveMax ? "text-danger" : isKmMissing ? "text-warning" : "text-success"}`}
                      >
                        {normalized.toFixed(2).replace(".", ",")} km
                      </span>,
                    );
                  }
                  return hasValue ? String(normalized) : "";
                },
              },
              // {
              //   data: null,
              //   name: "km_actions",
              //   orderable: false,
              //   searchable: false,
              // },
              { data: "status", name: "status" },
              {
                data: null,
                name: "resultados",
                orderable: false,
                searchable: false,
              },
              // {
              //   data: "execucao_funcionario[0].valor_calculado",
              //   name: "valor_calculado",
              // },
              // {
              //   data: "execucao_funcionario[0].valor_final",
              //   name: "valor_final",
              // },
              {
                data: null,
                name: "actions",
                orderable: false,
                searchable: false,
              },
            ]}
            slots={{
              actions: (row: ExecFuncBase) => (
                <div>
                  {/* <Button
                    variant="outline-warning"
                    className="m-0 px-1 py-1 border-0"
                    onClick={() => handleProcessarVariaveisSelecionados([row])}
                    tooltip="Calcular Variáveis"
                  >
                    <Icon icon="solar:calculator-bold-duotone" width={20} height={20} />
                  </Button> */}
                  {row.status !== "PREVIA" && row.status !== "" && (
                    <>
                      <Button
                        variant="outline-info"
                        className="m-0 px-1 py-1 border-0"
                        onClick={() => handleVisualizarVariaveis(row)}
                        tooltip="Visualizar Variáveis"
                      >
                        <Icon
                          icon="hugeicons:variable"
                          width={20}
                          height={20}
                        />
                      </Button>
                      {/* <Button
                        variant="outline-warning"
                        className="m-0 px-1 py-1 border-0"
                        onClick={() =>
                          handleProcessarValoresSelecionados([row])
                        }
                        tooltip="Calcular Valores"
                      >
                        <Icon
                          icon="solar:calculator-bold-duotone"
                          width={20}
                          height={20}
                        />
                      </Button> */}
                    </>
                  )}

                  {(row.status === "RESULTADOS_PROCESSADOS" ||
                    row.status === "ENVIADO_RM" ||
                    row.status === "ERRO_RM") && (
                    <Button
                      variant="outline-primary"
                      className="m-0 px-1 py-1 border-0"
                      onClick={() => handleVisualizarResultados(row)}
                      tooltip="Visualizar Resultados"
                    >
                      <Icon
                        icon="solar:eye-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                  )}

                  <Button
                    variant="link"
                    className="m-0 px-1 py-1 border-0 text-decoration-none text-info"
                    onClick={() => openGestaoKm(execucaoFilialIdRef.current, row.funcionario_id_rm)}
                    tooltip="Abrir Gestao de KM"
                  >
                    <Icon icon="solar:map-point-bold" width={20} height={20} />
                  </Button>
                </div>
              ),
              status: (status: string) => {
                if (status === undefined || status === null || status === "") {
                  return FunctionsHelper.formatStatusExecucaoFuncionario(
                    "PREVIA",
                  );
                }
                return FunctionsHelper.formatStatusExecucaoFuncionario(status);
              },
              data_admissao: (data: unknown) => {
                if (data === undefined || data === null || data === "") {
                  return "-";
                }
                return FunctionsHelper.formatDateOnlyPtBr(data);
              },

              selection: () => {
                return <input type="checkbox" className="form-check-input" />;
              },
              resultados: (row: ExecFuncBase) => {
                if (
                  row.execucao_funcionario === undefined ||
                  row.execucao_funcionario === null ||
                  row.execucao_funcionario.length === 0 ||
                  row.status !== "RESULTADOS_PROCESSADOS"
                ) {
                  return (
                    <Button
                      variant="link"
                      className="m-0 px-1 py-1 border-0"
                      disabled
                    >
                      <Icon
                        icon="solar:eye-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                  );
                }
                //Faz uma lista com <ul> e <li> de todos os resultados, com o nome da formula primeiro e o valor final segundo
                const resultados = row.execucao_funcionario?.map(
                  (execFunc) =>
                    `${execFunc.formula.nome}: ${execFunc.valor_final}`,
                );
                if (resultados && resultados.length === 0) {
                  return "-";
                }
                const resultadosList = resultados?.map((resultado) => (
                  <li key={resultado}>•{resultado}</li>
                ));

                return (
                  <Popover
                    popover={<ul className="m-0 p-0">{resultadosList}</ul>}
                  >
                    <Button variant="link" className="m-0 px-1 py-1 border-0">
                      <Icon
                        icon="solar:eye-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                  </Popover>
                );
              },
            }}
            onSelect={handleSelectFuncionarios}
            onDeselect={handleSelectFuncionarios}
            ref={tableRef}
          >
            <thead>
              <tr className="bg-primary bg-opacity-25">
                <th></th>
                <th>Nome</th>
                <th>Chapa</th>
                <th>Cargo</th>
                <th>Data de Admissão</th>
                <th>Km</th>
                <th>Status</th>
                <th>Resultados</th>
                {/* <th>Valor Calculado</th>
                <th>Valor Final</th> */}
                <th>Ações</th>
              </tr>
            </thead>
          </DataTable>
        </div>
      </div>

      <Modal
        show={showVerFormulasModal}
        size="lg"
        onHide={() => {
          setShowVerFormulasModal(false);
        }}
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Formulas</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Table className="table striped-table mb-0 fs-12">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Expressão</th>
              </tr>
            </thead>
            <tbody>
              {execucao.filial?.formula?.map((formula) => (
                <tr key={formula.formula_id}>
                  <td>{formula.nome}</td>
                  <td>
                    <span>
                      {formula.expressao.length > 30
                        ? formula.expressao.substring(0, 30) + "..."
                        : formula.expressao}
                    </span>
                    <OverlayTrigger
                      key={`expressao-${formula.expressao}`}
                      placement="top"
                      trigger="click"
                      overlay={
                        <BootstrapPopover title={formula.expressao}>
                          <BootstrapPopover.Body>
                            {formula.expressao}
                          </BootstrapPopover.Body>
                        </BootstrapPopover>
                      }
                    >
                      <Button variant="link" className="m-0 px-1 py-1 border-0">
                        <Icon
                          icon="solar:eye-bold-duotone"
                          width={20}
                          height={20}
                        />
                      </Button>
                    </OverlayTrigger>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
      </Modal>
      <Modal
        show={showVerResultadosModal}
        size="lg"
        onHide={() => {
          setShowVerResultadosModal(false);
        }}
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>
            Resultados de{" "}
            <Limited limit={10} placement="bottom">
              {viewResultsFuncBase?.nome_funcionario}
            </Limited>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Table className="table striped-table mb-0 fs-12">
            <thead>
              <tr className="bg-primary bg-opacity-25">
                <th className="text-center">Formula</th>
                <th className="text-center">Expressão</th>
                <th className="text-center">Valor Calculado</th>
                <th className="text-center">Valor Final</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {viewResultsFuncBase.execucao_funcionario?.map((execFunc) => (
                <tr key={execFunc.execucao_funcionario_id}>
                  <td className="text-center">
                    <Limited limit={10}>{execFunc.formula.nome}</Limited>
                  </td>
                  <td className="text-center">
                    <Limited limit={10}>{execFunc.formula.expressao}</Limited>
                  </td>
                  <td className="text-center">{execFunc.valor_calculado}</td>
                  <td className="text-center">
                    <span
                      className={execFunc.ajuste_manual ? "text-danger" : ""}
                    >
                      {execFunc.valor_final}
                      {execFunc.ajuste_manual && (
                        <Tooltip title="Houve ajuste manual">
                          <span className="text-danger d-inline-flex align-items-center">
                            <Icon
                              icon="solar:pen-bold-duotone"
                              width={12}
                              height={12}
                            />
                          </span>
                        </Tooltip>
                      )}
                    </span>
                  </td>
                  <td className="text-center">
                    <Button
                      variant="outline-warning"
                      className="m-0 px-1 py-1 border-0"
                      tooltip="Editar valor final"
                      onClick={() => handleEditarResultado(execFunc)}
                    >
                      <Icon
                        icon="solar:pen-new-square-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
      </Modal>
      <Modal
        show={showEditarResultadoModal}
        size="lg"
        onHide={handleCloseEditarResultadoModal}
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>
            Editar valor final de{" "}
            <Limited limit={10} placement="top">
              {viewResultsFuncBase?.nome_funcionario}
            </Limited>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form id="editar-resultado-form" onSubmit={handleSaveEditarResultado}>
            <Form.Group controlId="valor_final">
              <Form.Label>Valor Final</Form.Label>
              <Form.Control
                type="number"
                required
                defaultValue={editResultFunc.valor_final}
                value={editResultFunc.new_valor_final}
                onChange={(e) =>
                  setEditResultFunc({
                    ...editResultFunc,
                    new_valor_final: Number(e.target.value),
                  })
                }
              />
            </Form.Group>
            <Form.Group controlId="motivo_ajuste">
              <Form.Label>Motivo do Ajuste</Form.Label>
              <Form.Control
                as="textarea"
                required
                value={editResultFunc.motivo_ajuste}
                onChange={(e) =>
                  setEditResultFunc({
                    ...editResultFunc,
                    motivo_ajuste: e.target.value,
                  })
                }
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseEditarResultadoModal}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="editar-resultado-form">
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
      {/* Modal que mostra as variaveis processadas do funcionário */}
      <Modal
        show={showVerVariaveisModal}
        size="lg"
        onHide={() => {
          setShowVerVariaveisModal(false);
        }}
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>
            Variáveis de{" "}
            <Limited limit={10} placement="bottom">
              {viewResultsFuncBase?.nome_funcionario}
            </Limited>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Table className="table striped-table mb-0 fs-12">
            <thead>
              <tr className="bg-primary bg-opacity-25">
                <th className="text-center">Variavel</th>
                <th className="text-center">Codigo</th>
                <th className="text-center">Origem</th>
                <th className="text-center">Valor</th>
              </tr>
            </thead>
            <tbody>
              {uniqueMemorias.map((memoria) => (
                <tr key={memoria.memoria_id}>
                  <td className="text-center">{memoria.variavel_nome}</td>
                  <td className="text-center">{memoria.variavel_codigo}</td>
                  <td className="text-center">{memoria.origem}</td>
                  <td className="text-center">{memoria.valor}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
      </Modal>

      <Modal
        show={showErrorsModal}
        size="xl"
        onHide={() => setShowErrorsModal(false)}
        centered
      >
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title>Erros do processamento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
            <div>
              <Form.Label>Fonte</Form.Label>
              <Form.Select
                value={errorsFilterSource}
                onChange={(e) =>
                  setErrorsFilterSource(
                    e.target.value as "ALL" | "QUEUE" | "LOG",
                  )
                }
              >
                <option value="ALL">Todas</option>
                <option value="QUEUE">Fila</option>
                <option value="LOG">Log</option>
              </Form.Select>
            </div>
            <div>
              <Form.Label>Tipo</Form.Label>
              <Form.Select
                value={errorsFilterTipo}
                onChange={(e) =>
                  setErrorsFilterTipo(
                    e.target.value as
                      | "ALL"
                      | "VARIAVEIS"
                      | "VALORES"
                      | "ENVIAR_RM",
                  )
                }
              >
                <option value="ALL">Todos</option>
                <option value="VARIAVEIS">Variáveis</option>
                <option value="VALORES">Valores</option>
                <option value="ENVIAR_RM">Enviar RM</option>
              </Form.Select>
            </div>
            <Button
              variant="outline-secondary"
              onClick={() => void fetchErrors()}
              tooltip="Atualizar lista de erros"
            >
              <Icon icon="solar:refresh-bold-duotone" width={20} height={20} />
              <span className="ms-1">Atualizar</span>
            </Button>
          </div>

          {(() => {
            const filtered = (errorsRows ?? []).filter((r) => {
              if (
                errorsFilterSource !== "ALL" &&
                r.source !== errorsFilterSource
              )
                return false;
              if (errorsFilterTipo !== "ALL") {
                if (!r.tipo) return false;
                if (r.tipo !== errorsFilterTipo) return false;
              }
              return true;
            });

            return (
              <div className="table-responsive" style={{ maxWidth: "100%" }}>
                <Table className="table table-sm striped-table w-100 mb-0 fs-12">
                  <thead>
                    <tr className="bg-danger bg-opacity-10">
                      <th>Data/Hora</th>
                      <th>Fonte</th>
                      <th>Tipo</th>
                      <th>Funcionário</th>
                      <th>Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-muted text-center">
                          Nenhum erro encontrado.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((r) => (
                        <tr key={r.id}>
                          <td>
                            {FunctionsHelper.formatDateTimePtBr(r.createdAt)}
                          </td>
                          <td>{r.source === "QUEUE" ? "Fila" : "Log"}</td>
                          <td>{r.tipo ?? "-"}</td>
                          <td>
                            {r.nomeFuncionario ? (
                              <>
                                <Limited limit={18}>
                                  {r.nomeFuncionario}
                                </Limited>
                                {r.funcionarioIdRm ? (
                                  <span className="text-muted ms-1">
                                    ({r.funcionarioIdRm})
                                  </span>
                                ) : null}
                              </>
                            ) : r.funcionarioIdRm ? (
                              r.funcionarioIdRm
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>
                            <Limited limit={120} placement="top">
                              {r.message}
                            </Limited>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            );
          })()}
        </Modal.Body>
      </Modal>
    </div>
  );
}
