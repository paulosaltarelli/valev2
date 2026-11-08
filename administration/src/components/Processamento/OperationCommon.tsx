import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  OperacaoApi,
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
export const resultValue = (value: unknown, type?: string | null) => {
  if (type?.trim() !== "D" || value == null) return money(value);
  const days = Number(value);
  return `${days.toLocaleString("pt-BR")} ${Math.abs(days) === 1 ? "dia" : "dias"}`;
};

export function SendScope({
  executionIds,
  personIds,
  disabled,
  onSend,
}: {
  executionIds: number[];
  personIds?: number[];
  disabled?: boolean;
  onSend: () => void;
}) {
  const execKey = executionIds.join(",");
  const personKey = personIds?.join(",");
  const fetcher = useCallback(
    () => OperacaoApi.sendScope(execKey.split(",").map(Number), personKey?.split(",").map(Number)),
    [execKey, personKey],
  );
  const scope = useOperationQuery(fetcher);
  return (
    <div>
      <button type="button" className="btn btn-primary"
        disabled={disabled || scope.loading || Boolean(scope.error) || !scope.data?.eligible}
        onClick={onSend}>
        {scope.data ? `Enviar ${scope.data.eligible} ao RM` : "Enviar ao RM"}
      </button>
      <div className="op-muted" role="status">
        {scope.loading && "Consultando pessoas elegíveis…"}
        {scope.error && <span>{scope.error} <button type="button" className="btn btn-link" onClick={scope.refresh}>Tentar novamente</button></span>}
        {scope.data && Object.entries(scope.data.excluded).map(([reason, count]) => (
          <small key={reason}>{count} fora da fila · {reason}</small>
        ))}
      </div>
    </div>
  );
}
export const etapaLabel = (value: string) =>
  ({ VARIAVEIS: "Variáveis", VALORES: "Valores", ENVIAR_RM: "Envio ao RM" })[
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
    RESULTADOS_PROCESSADOS: "Valores calculados",
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
  pausando: { label: "Pausando após o lote", action: "Acompanhar", tone: "warning", tab: "acompanhamento" },
  pausada: { label: "Fila pausada", action: "Abrir execução", tone: "warning", tab: "acompanhamento" },
  cancelando: { label: "Cancelando após o lote", action: "Acompanhar", tone: "warning", tab: "acompanhamento" },
  cancelada: { label: "Fila cancelada", action: "Abrir execução", tone: "neutral", tab: "acompanhamento" },
  conferencia: {
    label: "Valores calculados",
    action: "Ver resultados",
    tone: "primary",
    tab: "resultados",
  },
  envio: {
    label: "Pronto para envio",
    action: "Enviar ao RM",
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
  showBar = true,
}: {
  label: string;
  value: number;
  total: number;
  showBar?: boolean;
}) {
  return (
    <div className="op-stage">
      <span className="op-stage-label">{label}</span>
      <span className="op-count">
        {value.toLocaleString("pt-BR")}{" "}
        <span>/ {total.toLocaleString("pt-BR")}</span>
      </span>
      {showBar && <progress
        aria-label={`${label}: ${value} de ${total} funcionários`}
        value={value}
        max={total || 1}
      />}
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

export function useOperationAction(onNotice: (message: string) => void, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async (request: OperationRequest) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onNotice("Agendando etapa…");
    try {
      const result = await OperacaoApi.execute(request);
      onNotice(result.message);
      onDone();
    } catch (error) {
      onNotice(errorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}
