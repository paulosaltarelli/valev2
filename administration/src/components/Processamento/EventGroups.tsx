import type { ResultRow } from "../../utils/api/operacaoApi";
import { resultValue } from "./OperationCommon";

export function storedEvent(result: ResultRow) {
  const formula = result.formulaUtilizada;
  const reference = formula?.codEvento?.trim() ?? "";
  const variable = reference.match(/^\(\s*:([A-Za-z_][A-Za-z0-9_]*)\s*\)$/)?.[1] ?? null;
  const historical = formula && formula.snapshot_origem !== "CONFERENCIA_LEGADO";
  const saved = historical ? formula.evento_calculo : null;
  const value = historical ? saved ? saved.valor : reference && !reference.includes("(:") ? reference : null : null;
  return { resultadoId: result.execucao_funcionario_id, variavel: saved?.variavel ?? variable,
    nome: variable, valor: value, origem: "CALCULO", coletadoEm: saved?.coletadoEm,
    erro: !historical || (variable && !saved) ? "Evento não registrado neste cálculo" : undefined };
}
const sourceLabel = () => "do cálculo";
export function eventKey(result: ResultRow) {
  const reference = ((result.formulaUtilizada ?? result.formula).codEvento ?? "").trim();
  const variable = reference.match(/^\(\s*:([A-Za-z_][A-Za-z0-9_]*)\s*\)$/)?.[1];
  return { key: variable ? `variable:${variable.toUpperCase()}` : `literal:${reference}`, variable, reference };
}
export function EventGroups({ results, onOpen, compact = false }: {
  executionId: number; baseId: number; results: ResultRow[]; onOpen?: (id: number) => void; autoLoad?: boolean; compact?: boolean;
}) {
  const data = { events: results.map(storedEvent) };
  const groups = new Map<string, { variable?: string; reference: string; results: ResultRow[] }>();
  for (const result of results) {
    const { key, variable, reference } = eventKey(result);
    if (!groups.has(key)) groups.set(key, { variable, reference, results: [] });
    groups.get(key)!.results.push(result);
  }
  if (!results.length) return <small>Resultados ainda não disponíveis</small>;
  return <div className={`op-event-groups${compact ? " is-compact" : ""}`} aria-label="Fórmulas por evento">
    {[...groups].map(([key, group]) => {
      const values = data?.events.filter(e => group.results.some(r => r.execucao_funcionario_id === e.resultadoId)) ?? [];
      const title = ({ EVENTOPAG: "Pagamento", EVENTODES: "Desconto", EVENTOREE: "Reembolso" } as Record<string,string>)[group.variable?.toUpperCase() ?? ""] ?? group.variable ?? "Evento RM";
      const variants = [...new Map(values.map(v => [`${v.valor}:${v.origem}:${v.erro}`, v])).values()];
      return <section className="op-event-group" key={key} aria-label={`${title}${group.variable ? ` · ${group.variable}` : ""}`}>
        <header>
          <strong>{title}</strong>{group.variable && <small>{group.variable}</small>}
          {variants.length ? variants.map((value, i) => <span className={`op-event-code${value.erro ? " has-error" : ""}`} key={i}>
            {value.erro ? value.erro : value.valor === null ? "Sem evento vinculado" : `Evento RM: ${value.valor}`}
            {!value.erro && value.valor !== null && <small>{sourceLabel()}</small>}
          </span>) : <span className="op-event-code">{group.variable ? "Evento não registrado neste cálculo" : group.reference ? `Evento RM: ${group.reference}` : "Sem evento vinculado"}</span>}
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
