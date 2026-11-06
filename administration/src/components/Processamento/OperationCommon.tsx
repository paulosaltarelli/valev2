import { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { isAxiosError } from "axios";
import {
  OperacaoApi,
  type OperationPreview,
  type OperationRequest,
} from "../../utils/api/operacaoApi";
import "./operacao.css";

export const money = (value: unknown) =>
  value === null || value === undefined
    ? "—"
    : Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
export const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
export const etapaLabel = (value: string) =>
  ({ VARIAVEIS: "Variáveis", VALORES: "Valores", CONFERIR: "Conferência", ENVIAR_RM: "Envio ao RM" })[
    value
  ] ?? value;
export const errorMessage = (error: unknown) =>
  isAxiosError(error)
    ? typeof error.response?.data?.message === "string"
      ? (error.response.data.message as string)
      : error.response
        ? "Não foi possível concluir. Atualize os dados e tente novamente."
        : "Sem conexão com o servidor. Seus dados não foram descartados."
    : "Não foi possível concluir a consulta.";
export const statusLabel = (value: string) =>
  ({
    PREVIA: "Aguardando variáveis",
    VARIAVEIS_PROCESSADAS: "Pronto para calcular valores",
    ERRO_VARIAVEIS: "Falha em variáveis",
    RESULTADOS_PROCESSADOS: "Pronto para conferência",
    RESULTADOS_PARCIAL: "Valores parciais",
    ERRO_RESULTADOS: "Falha em valores",
    ENVIADO_RM: "Enviado ao RM",
    ERRO_RM: "Envio com pendência",
  })[value] ?? value;
export const situacoes: Record<
  string,
  { label: string; action: string; tone: string; tab: string }
> = {
  acao: {
    label: "Exige ação",
    action: "Ver pendências",
    tone: "danger",
    tab: "pendencias",
  },
  tentativa: {
    label: "Aguardando nova tentativa",
    action: "Acompanhar tentativa",
    tone: "warning",
    tab: "pendencias",
  },
  andamento: {
    label: "Em andamento",
    action: "Acompanhar",
    tone: "info",
    tab: "acompanhamento",
  },
  fila: {
    label: "Na fila",
    action: "Acompanhar",
    tone: "info",
    tab: "acompanhamento",
  },
  conferencia: {
    label: "Pronto para conferência",
    action: "Conferir resultados",
    tone: "primary",
    tab: "conferencia",
  },
  envio: {
    label: "Pronto para envio",
    action: "Revisar envio",
    tone: "primary",
    tab: "envios",
  },
  enviado: {
    label: "Enviado ao RM",
    action: "Ver confirmações",
    tone: "success",
    tab: "envios",
  },
  inicio: {
    label: "Aguardando próxima etapa",
    action: "Abrir execução",
    tone: "neutral",
    tab: "acompanhamento",
  },
};

export function useOperationQuery<T>(fetcher: () => Promise<T>, poll = 20000) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string;
    at: string;
  }>({ data: null, loading: true, error: "", at: "" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setState({ data: null, loading: true, error: "", at: "" });
    const run = async () => {
      try {
        const data = await fetcher();
        if (!stopped)
          setState({
            data,
            loading: false,
            error: "",
            at: new Date().toISOString(),
          });
      } catch (e) {
        if (!stopped)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: errorMessage(e),
          }));
      } finally {
        if (!stopped && poll) timer = setTimeout(run, poll);
      }
    };
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [fetcher, poll, version]);
  return { ...state, refresh: () => setVersion((v) => v + 1) };
}

export function StageCount({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="op-stage">
      <span className="op-stage-label">{label}</span>
      <span className="op-count">
        {value.toLocaleString("pt-BR")}{" "}
        <span>/ {total.toLocaleString("pt-BR")}</span>
      </span>
      <progress
        aria-label={`${label}: ${value} de ${total} funcionários`}
        value={value}
        max={total || 1}
      />
    </div>
  );
}

export function QueryNotice({
  loading,
  error,
  at,
}: {
  loading: boolean;
  error: string;
  at: string;
}) {
  return (
    <>
      {loading && (
        <div className="op-notice" role="status">
          Carregando informações… As contagens serão exibidas após a consulta.
        </div>
      )}
      {error && (
        <div className="op-notice op-error" role="alert">
          {error}{" "}
          {at &&
            `Exibindo a última consulta de ${dateTime(at)}. Atualize antes de realizar ações.`}
        </div>
      )}
    </>
  );
}

export function OperationReview({
  request,
  onClose,
  onDone,
}: {
  request: OperationRequest | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [preview, setPreview] = useState<OperationPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    let canceled = false;
    setPreview(null);
    setError("");
    setAgreed(false);
    if (request) {
      setBusy(true);
      OperacaoApi.preview(request)
        .then((p) => {
          if (!canceled) setPreview(p);
        })
        .catch((e) => {
          if (!canceled) setError(errorMessage(e));
        })
        .finally(() => {
          if (!canceled) setBusy(false);
        });
    }
    return () => {
      canceled = true;
    };
  }, [request]);
  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const r = await OperacaoApi.confirm(preview.id);
      onDone(r.message);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setAgreed(false);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      show={Boolean(request)}
      onHide={() => {
        if (!busy) onClose();
      }}
      size="xl"
      centered
      className="op-modal"
      backdrop="static"
    >
      <Modal.Header closeButton closeLabel="Fechar revisão">
        <Modal.Title>Revisar {etapaLabel(request?.etapa ?? "")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {busy && !preview && (
          <p role="status">Preparando o conjunto de pessoas e eventos…</p>
        )}
        {error && (
          <div className="op-notice op-error" role="alert">
            {error} Feche esta revisão e gere uma nova prévia.
          </div>
        )}
        {preview && (
          <>
            <p>
              <strong>{preview.elegiveis} pessoas elegíveis</strong> ·{" "}
              {preview.excluidos} excluídas · revisão válida até{" "}
              {dateTime(preview.expiraEm)}
            </p>
            {preview.etapa === "CONFERIR" && (
              <div className="op-notice">
                Confira os valores de cada pessoa e evento abaixo. Ao confirmar, a conferência ficará registrada em seu nome para estas versões. Para investigar diferenças, volte e abra a memória do resultado antes de confirmar.
              </div>
            )}
            {(preview.etapa === "VARIAVEIS" || preview.etapa === "VALORES") && (
              <div className="op-notice">
                {preview.recalcular
                  ? "Recálculo explícito: as conferências dos resultados afetados serão invalidadas. Ajustes manuais serão preservados e precisarão de nova conferência."
                  : "Somente itens pendentes ou com falha elegível entram na retomada. Pessoas com trabalho agendado e etapas concluídas ficam excluídas."}
              </div>
            )}
            <div className="op-scroll">
              <table className="op-table">
                <caption className="visually-hidden">
                  Pessoas, eventos, versões e exclusões deste lote
                </caption>
                <thead>
                  <tr>
                    <th>Pessoa / competência</th>
                    <th>Filial</th>
                    <th>Escopo e decisão</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((i) => (
                    <tr key={i.baseId}>
                      <th scope="row">
                        {i.nome}
                        <small>
                          {i.chapa} · {i.competencia}
                        </small>
                      </th>
                      <td>{i.filial}</td>
                      <td>
                        {i.reason ? (
                          <span className="op-muted">Excluído: {i.reason}</span>
                        ) : (
                          <>
                            <strong>Incluído</strong>
                            {i.eventos.map((e) => (
                              <div className="op-preview-event" key={e.id}>
                                {e.nome} · evento{" "}
                                {e.evento || "não configurado"} · tipo{" "}
                                {e.tipo || "—"} · v{e.revisao} ·{" "}
                                {money(e.valor)}
                                {preview.etapa === "ENVIAR_RM" && (
                                  <strong>
                                    {e.operacao === "novo"
                                      ? "Novo envio"
                                      : e.operacao === "atualizacao"
                                        ? "Atualização no RM"
                                        : "Já confirmado · não reenviar"}
                                  </strong>
                                )}
                              </div>
                            ))}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="op-check">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={busy}
              />
              <span>
                Revisei pessoas, competência, eventos e exclusões deste lote.
              </span>
            </label>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          className="btn btn-outline-secondary"
          disabled={busy}
          onClick={onClose}
        >
          Voltar sem confirmar
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !agreed || !preview?.elegiveis}
          onClick={() => void confirm()}
        >
          {busy ? "Confirmando…" : preview?.etapa === "CONFERIR" ? "Registrar conferência" : "Confirmar e acompanhar fila"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
