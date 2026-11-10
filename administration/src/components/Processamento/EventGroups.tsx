import { useCallback, useEffect, useState } from "react";
import api from "../../utils/api/Api";
import type { ResultRow } from "../../utils/api/operacaoApi";
import { resultValue } from "./OperationCommon";

type EventValue = { resultadoId: number; variavel: string | null; nome: string; valor: string | null; origem: string; erro?: string };
type EventResponse = { events: EventValue[]; consultadoEm: string };
const sourceLabel = (source: string) => source === "MEMORIA" || source === "CALCULO" ? "do cálculo" : source === "CADASTRO_ATUAL" ? "cadastro atual" : "consulta atual RM";
export function eventKey(result: ResultRow) {
  const reference = ((result.formulaUtilizada ?? result.formula).codEvento ?? "").trim();
  const variable = reference.match(/^\(\s*:([A-Za-z_][A-Za-z0-9_]*)\s*\)$/)?.[1];
  return { key: variable ? `variable:${variable.toUpperCase()}` : `literal:${reference}`, variable, reference };
}
export function EventGroups({ executionId, baseId, results, onOpen, autoLoad = false, compact = false }: {
  executionId: number; baseId: number; results: ResultRow[]; onOpen?: (id: number) => void; autoLoad?: boolean; compact?: boolean;
}) {
  const [data, setData] = useState<EventResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [requested, setRequested] = useState(false);
  const signature = results.map(r => `${r.execucao_funcionario_id}:${r.revisao}:${eventKey(r).key}`).join("|");
  const load = useCallback(() => { setRequested(true); setReload(value => value + 1); }, []);
  useEffect(() => {
    setData(null);
    if ((!autoLoad && !requested) || !baseId) return;
    let active = true;
    setLoading(true); setError("");
    void api.get(`/operacao/${executionId}/pessoas/${baseId}/eventos`).then(response => {
      if (active) setData(response as EventResponse);
    }).catch(() => { if (active) setError("Não foi possível consultar os eventos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [executionId, baseId, autoLoad, requested, reload, signature]);
  const groups = new Map<string, { variable?: string; reference: string; results: ResultRow[] }>();
  for (const result of results) {
    const { key, variable, reference } = eventKey(result);
    if (!groups.has(key)) groups.set(key, { variable, reference, results: [] });
    groups.get(key)!.results.push(result);
  }
  if (!results.length) return <small>Resultados ainda não disponíveis</small>;
  return <div className={`op-event-groups${compact ? " is-compact" : ""}`} aria-label="Fórmulas por evento" aria-busy={loading}>
    <div className="op-event-tools">
      <button type="button" className="btn btn-link btn-sm" disabled={loading} onClick={load}>
        {loading ? "Consultando eventos…" : data ? "Atualizar códigos dos eventos" : "Consultar códigos dos eventos"}
      </button>
      {data?.events.some(e => e.origem === "CONSULTA_ATUAL" || e.origem === "CADASTRO_ATUAL") && <small>Consulta atual · não altera o cálculo</small>}
      {error && <small role="alert">{error}</small>}
    </div>
    {[...groups].map(([key, group]) => {
      const values = data?.events.filter(e => group.results.some(r => r.execucao_funcionario_id === e.resultadoId)) ?? [];
      const title = values.find(v => v.nome)?.nome ?? ({ EVENTOPAG: "Pagamento", EVENTODES: "Desconto", EVENTOREE: "Reembolso" } as Record<string,string>)[group.variable?.toUpperCase() ?? ""] ?? group.variable ?? "Evento RM";
      const variants = [...new Map(values.map(v => [`${v.valor}:${v.origem}:${v.erro}`, v])).values()];
      return <section className="op-event-group" key={key} aria-label={`${title}${group.variable ? ` · ${group.variable}` : ""}`}>
        <header>
          <strong>{title}</strong>{group.variable && <small>{group.variable}</small>}
          {variants.length ? variants.map((value, i) => <span className={`op-event-code${value.erro ? " has-error" : ""}`} key={i}>
            {value.erro ? value.erro : value.valor === null ? "Sem evento vinculado" : `Evento RM: ${value.valor}`}
            {!value.erro && value.valor !== null && <small>{sourceLabel(value.origem)}</small>}
          </span>) : <span className="op-event-code">{loading ? "Consultando…" : group.variable ? "Valor ainda não consultado" : group.reference ? `Evento RM: ${group.reference}` : "Sem evento vinculado"}</span>}
        </header>
        {!compact && <div className="op-result-tags">{group.results.map(result => {
          const formula = result.formulaUtilizada ?? result.formula;
          return <button key={result.execucao_funcionario_id} type="button" className="op-result-tag" aria-haspopup="dialog" onClick={() => onOpen?.(result.execucao_funcionario_id)}>
            {formula.nome} <span>{resultValue(result.valor_final, formula.tipo)}</span>
            {result.ajuste_manual && <span>· ajustado</span>}
          </button>;
        })}</div>}
      </section>;
    })}
  </div>;
}
