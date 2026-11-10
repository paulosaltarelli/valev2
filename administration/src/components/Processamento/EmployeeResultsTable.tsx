import { useState } from "react";
import { Modal } from "../../shared/components/VeModal";
import type { BaseRow, Etapa, ResultRow } from "../../utils/api/operacaoApi";
import { eventKey, storedEvent } from "./EventGroups";
import { resultValue, statusLabel } from "./OperationCommon";

const groupNames: Record<string, string> = { EVENTOPAG: "Pagamento", EVENTODES: "Desconto", EVENTOREE: "Reembolso" };
const priority = ["EVENTOPAG", "EVENTODES", "EVENTOREE"];
export function resultColumns(bases: BaseRow[]) {
  const columns = new Map<string, { key: string; title: string; variable: string }>();
  for (const base of bases) for (const result of base.execucao_funcionario) {
    const { key, variable, reference } = eventKey(result);
    const code = variable?.toUpperCase() ?? "";
    columns.set(key, { key, variable: code, title: groupNames[code] ?? variable ?? (reference ? `Evento ${reference}` : "Sem evento") });
  }
  return [...columns.values()].sort((a, b) => {
    const rank = (v: string) => priority.includes(v) ? priority.indexOf(v) : 3;
    return rank(a.variable) - rank(b.variable) || a.title.localeCompare(b.title, "pt-BR");
  });
}

function EventCell({ results, onOpen }: { results: ResultRow[]; onOpen: (id: number) => void }) {
  if (!results.length) return <span className="op-cell-empty" aria-label="Sem fórmula neste grupo">—</span>;
  const ordered = [...results].sort((a, b) => Number((a.formulaUtilizada ?? a.formula).tipo === "D") - Number((b.formulaUtilizada ?? b.formula).tipo === "D"));
  const events = [...new Set(results.map(r => storedEvent(r).valor).filter((v): v is string => v !== null))];
  const missing = results.some(r => !storedEvent(r).valor);
  const calculated = results.some(r => r.valor_calculado !== null);
  return <div className="op-cell-results">
    {ordered.map(r => {
      const f = r.formulaUtilizada ?? r.formula;
      const failed = r.status?.startsWith("ERRO");
      return <button key={r.execucao_funcionario_id} type="button" className={`op-cell-value${f.tipo === "D" ? " is-days" : ""}${failed ? " has-error" : ""}${Number(r.valor_final) === 0 ? " is-zero" : ""}`}
        aria-haspopup="dialog" aria-label={`${f.nome}: ${failed ? "Ver erro" : resultValue(r.valor_final, f.tipo)}`}
        title={f.nome} onClick={() => onOpen(r.execucao_funcionario_id)}>
        {failed ? "Ver erro" : resultValue(r.valor_final, f.tipo)}
        {r.ajuste_manual && <small> · ajustado</small>}
        {results.filter(x => ((x.formulaUtilizada ?? x.formula).tipo === "D") === (f.tipo === "D")).length > 1 && <small className="op-cell-formula">{f.nome}</small>}
      </button>;
    })}
    <small className="op-cell-event" title="Evento salvo na revisão do cálculo">{events.join(" · ")}{missing && calculated ? `${events.length ? " · " : ""}Evento não registrado` : !events.length ? "Evento pendente" : ""}</small>
  </div>;
}

export function EmployeeResultsTable({ bases, selecting, selected, onSelected, onVariables, onOpen, onProcess, disabled }: {
  bases: BaseRow[]; selecting: boolean; selected: number[]; onSelected: (ids: number[]) => void;
  onVariables: (base: BaseRow) => void; onOpen: (id: number) => void;
  onProcess: (stage: Etapa, ids: number[], recalculate?: boolean) => void; disabled: boolean;
}) {
  const [actions, setActions] = useState<BaseRow | null>(null);
  const columns = resultColumns(bases);
  const run = (stage: Etapa, recalculate = false) => {
    if (!actions || disabled) return;
    onProcess(stage, [actions.execucao_funcionario_base_id], recalculate);
    setActions(null);
  };
  return <>
    <div className="op-results-table-wrap">
      <table className="op-table op-results-table">
        <caption className="visually-hidden">Funcionários e resultados agrupados por evento</caption>
        <thead><tr><th scope="col">
          {selecting && <input type="checkbox" className="me-2" aria-label="Selecionar todas as pessoas desta página"
            checked={Boolean(bases.length) && bases.every(b => selected.includes(b.execucao_funcionario_base_id))}
            onChange={e => onSelected(e.target.checked ? bases.map(b => b.execucao_funcionario_base_id) : [])} />}
          Funcionário</th>
          {columns.map(c => <th scope="col" key={c.key}>{c.title}</th>)}
          <th scope="col">Situação</th><th scope="col">Ações</th>
        </tr></thead>
        <tbody>{bases.map(b => {
          const failed = b.status?.startsWith("ERRO");
          const complete = b.execucao_funcionario.length > 0 && b.execucao_funcionario.every(r => r.valor_calculado !== null);
          return <tr key={b.execucao_funcionario_base_id}>
            <th scope="row" className="op-person-identity"><div className="op-branch-name">
              {selecting && <input type="checkbox" aria-label={`Selecionar ${b.nome_funcionario}, ${b.funcionario_id_rm}`}
                checked={selected.includes(b.execucao_funcionario_base_id)}
                onChange={e => onSelected(e.target.checked ? [...selected, b.execucao_funcionario_base_id] : selected.filter(x => x !== b.execucao_funcionario_base_id))} />}
              <span>{b.nome_funcionario}</span></div><small>{b.funcionario_id_rm}</small></th>
            {columns.map(c => <td key={c.key} className="op-event-cell" data-label={c.title}>
              <EventCell results={b.execucao_funcionario.filter(r => eventKey(r).key === c.key)} onOpen={onOpen} />
            </td>)}
            <td className="op-person-state" data-label="Situação"><span className={`op-status op-${failed ? "danger" : complete ? "success" : "neutral"}`}>{statusLabel(b.status)}</span></td>
            <td className="op-person-tools"><button type="button" className="op-variables-button" aria-haspopup="dialog" aria-label={`Variáveis de ${b.nome_funcionario}`} onClick={() => onVariables(b)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 12h16M4 17h16M9 5v4m6 1v4m-5 1v4" /></svg><span>Variáveis</span></button>
              <button type="button" className="op-row-more" aria-haspopup="dialog" aria-label={`Ações de ${b.nome_funcionario}`} onClick={() => setActions(b)}>⋯</button>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <Modal show={Boolean(actions)} onHide={() => setActions(null)} centered className="op-modal" aria-labelledby="op-person-actions-title">
      <Modal.Header closeButton><Modal.Title id="op-person-actions-title">Ações do funcionário</Modal.Title></Modal.Header>
      <Modal.Body>{actions && <><strong>{actions.nome_funcionario}</strong><p className="op-muted">{actions.funcionario_id_rm} · {actions.cargo} · KM: {actions.km ?? "não informado"}</p>
        <div className="op-person-action-buttons"><button className="btn btn-outline-primary" disabled={disabled} onClick={() => run("VARIAVEIS")}>Processar variáveis</button><button className="btn btn-outline-primary" disabled={disabled} onClick={() => run("VALORES")}>Calcular valores</button></div>
        <details className="op-person-recalculate"><summary>Reprocessar etapas concluídas</summary><div className="op-person-action-buttons"><button className="btn btn-outline-secondary" disabled={disabled} onClick={() => run("VARIAVEIS", true)}>Reprocessar variáveis</button><button className="btn btn-outline-secondary" disabled={disabled} onClick={() => run("VALORES", true)}>Recalcular valores</button></div></details>
      </>}</Modal.Body>
    </Modal>
  </>;
}
