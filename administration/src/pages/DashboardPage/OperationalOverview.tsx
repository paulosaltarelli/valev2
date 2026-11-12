import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Modal } from "../../shared/components/VeModal";
import { QueryNotice, dateTime, useOperationQuery } from "../../components/Processamento/OperationCommon";
import { RetryErrors } from "../../components/Processamento/RetryErrors";
import { PendingPeople } from "../../components/Processamento/PendingPeople";
import { OperacaoApi, type OperationSummary } from "../../utils/api/operacaoApi";
import { ExecucaoApi } from "../../utils/api/execucaoApi";
import "./operationalOverview.css";

type Branch = { filialId: number; nome: string; ativa: boolean };
type Creation = Awaited<ReturnType<typeof ExecucaoApi.getCreateQueueItems>>;
type Drill = "variables" | "formulas" | "send" | "missing" | "queue" | "sent";
const percent = (value: number, total: number) => !total ? "—" : value > 0 && value < total / 100 ? "<1%" : `${Math.min(100, Math.floor(value * 100 / total))}%`;
const n = (value: number) => value.toLocaleString("pt-BR");
const branchCount = (value: number) => `${value} ${value === 1 ? "filial" : "filiais"}`;

function PeriodOverview({ summary, branches, creation, onRefresh, disabled }: { summary: OperationSummary; branches: Branch[]; creation: Creation; onRefresh: () => void; disabled: boolean }) {
  const period = summary.periodo!;
  const [notice, setNotice] = useState("");
  const all = summary.rows;
  const rows = all.filter(r => r.latest);
  const ids = rows.map(r => r.id).sort((a,b) => a-b).join(",");
  const scopeFetcher = useCallback(async () => {
    const [pending, send] = await Promise.allSettled([
      OperacaoApi.periodPendingScope(period.periodo_id),
      ids ? OperacaoApi.sendScope(ids.split(",").map(Number)) : Promise.resolve({eligible:0, excluded:{}}),
    ]);
    return { pending: pending.status === "fulfilled" ? pending.value : null, send: send.status === "fulfilled" ? send.value : null };
  }, [period.periodo_id, ids]);
  const scope = useOperationQuery(scopeFetcher, 60000);
  const [drill, setDrill] = useState<Drill | null>(null);
  const total = rows.reduce((a,r) => a+r.total,0);
  const sent = rows.reduce((a,r) => a+r.rm,0);
  const errors = rows.reduce((a,r) => a+r.errors,0);
  const variableTotal = rows.reduce((a,r) => a+r.progresso.variaveisPrevistas,0);
  const variables = rows.reduce((a,r) => a+r.progresso.variaveisCalculadas,0);
  const formulaTotal = rows.reduce((a,r) => a+r.progresso.formulasPrevistas,0);
  const formulas = rows.reduce((a,r) => a+r.progresso.formulasCalculadas,0);
  const periodCreation = creation.filter(c => c.periodoId === period.periodo_id && !rows.some(r => r.filialId === c.filialId));
  const missing = branches.filter(b => b.ativa && !rows.some(r => r.filialId === b.filialId) && !periodCreation.some(c => c.filialId === b.filialId));
  const creationErrors = periodCreation.filter(c => c.status === "ERRO");
  const preparing = periodCreation.filter(c => c.status !== "ERRO");
  const processing = all.reduce((a,r) => a+r.processing,0);
  const queued = all.reduce((a,r) => a+r.pending,0);
  const stopped = rows.filter(r => r.controleFila);
  const incomplete = variables < variableTotal || formulas < formulaTotal;
  const finished = total > 0 && sent === total && !missing.length && !periodCreation.length && !errors && !processing && !queued;
  const lastActivity = [...all.map(r => r.lastActivityAt), ...periodCreation.map(c => c.updatedAt)].filter((v): v is string => Boolean(v)).sort((a,b) => Date.parse(b)-Date.parse(a))[0];
  const base = `/processamento?periodo=${period.periodo_id}`;
  const detail = (id: number, filter: string) => `/processamento/${id}?${new URLSearchParams({filtro:filter,retorno:"/dashboard",...(drill === "queue" ? {fila:"1"} : {})})}`;
  const title = {variables:"Pendências de variáveis",formulas:"Pendências de fórmulas",send:"Conferir envio ao RM",missing:"Filiais sem execução",queue:"Fila e tarefas",sent:"Envios confirmados"};
  const drillRows = rows.filter(r => drill === "variables" ? r.variaveis < r.total : drill === "formulas" ? r.progresso.formulasCalculadas < r.progresso.formulasPrevistas : drill === "send" ? r.valores > r.rm : drill === "sent" ? r.rm > 0 : r.processing > 0 || r.pending > 0 || Boolean(r.controleFila) || r.errors > 0 || r.variaveis < r.total || r.progresso.formulasCalculadas < r.progresso.formulasPrevistas);
  const variablePending = scope.data?.pending?.VARIAVEIS;
  const formulaPending = scope.data?.pending?.VALORES;
  const eligible = scope.data?.send?.eligible;
  const queueText = processing ? `${n(processing)} em execução · ${n(queued)} na fila` : queued || preparing.length ? `${n(queued)} etapas na fila${preparing.length ? ` · ${preparing.length} filiais em preparação` : ""}` : stopped.length ? `${stopped.length} filas pausadas ou canceladas` : incomplete || errors || creationErrors.length ? "Fila parada com pendências" : "Sem tarefas na fila";
  const tile = (heading: string, text: string) => <><span><strong>{heading}</strong><small>{text}</small></span><span aria-hidden="true">↗</span></>;
  return <article className="vo-period" aria-label={`Competência ${period.competencia}`}>
    <header className="vo-period-head"><div><h3>{period.competencia}</h3><span className={`ve-status-pill ve-status-${finished ? "success" : errors || creationErrors.length ? "danger" : "info"}`}>{finished ? "Enviado ao RM" : errors || creationErrors.length ? "Exige ação" : processing || queued || preparing.length ? "Em andamento" : !rows.length ? "Não iniciado" : incomplete ? "Cálculo pendente" : "Conferir envio"}</span></div><div className="vo-period-tools"><RetryErrors periodoId={period.periodo_id} competencia={period.competencia} disabled={disabled} onNotice={setNotice} onDone={() => { scope.refresh(); onRefresh(); }}/><Link to={base} className="btn btn-outline-primary btn-sm">Abrir competência</Link></div></header>
    {notice && <div className="op-notice mt-3" role="status">{notice}<button type="button" className="op-dismiss" aria-label="Dispensar aviso" onClick={() => setNotice("")}>×</button></div>}
    <div className="vo-meters">
      {([{label:"Variáveis",value:variables,total:variableTotal,kind:"variables"},{label:"Fórmulas",value:formulas,total:formulaTotal,kind:"formulas"},{label:"Enviados ao RM",value:sent,total,kind:"sent"}] as const).map(m => <button key={m.kind} type="button" className={`vo-meter ${m.kind === "sent" && total > 0 && sent === total ? "vo-sent" : ""}`} onClick={() => setDrill(m.kind)} aria-label={`${m.label}: ${n(m.value)} de ${n(m.total)}. Ver detalhes`}><span className="vo-ring" aria-hidden="true"><svg viewBox="0 0 64 64"><circle className="vo-ring-track" cx="32" cy="32" r="27"/><circle className="vo-ring-value" cx="32" cy="32" r="27" pathLength="100" strokeDasharray={`${m.total ? Math.max(0,Math.min(100,m.value*100/m.total)) : 0} 100`}/></svg><strong>{percent(m.value,m.total)}</strong></span><span className="vo-meter-caption"><span>{m.label}</span><small>{n(m.value)} / {n(m.total)}</small></span></button>)}
    </div>
    {scope.loading && <p className="op-muted" role="status">Consultando ações disponíveis…</p>}
    <Link className="d-inline-block mt-3" to={`/falhas-por-causa?periodo=${period.periodo_id}`}>Ver erros por causa ↗</Link>
    <div className="vo-actions" aria-label={`Ações prioritárias de ${period.competencia}`}>
      {errors > 0 && <PendingPeople rows={rows} count={errors} returnTo="/dashboard" triggerClassName="vo-action vo-danger" trigger={tile(`${n(errors)} funcionários com erro`,`${branchCount(rows.filter(r => r.errors > 0).length)} · ver erro e corrigir`)}/>}
      {creationErrors.length > 0 && <Link className="vo-action vo-danger" to={`${base}&acao=falhas`}>{tile("Falha na criação",`${branchCount(creationErrors.length)} · consultar causa`)}</Link>}
      {stopped.length > 0 && <button type="button" className="vo-action vo-warning" onClick={() => setDrill("queue")}>{tile("Filas interrompidas",`${stopped.length} filiais · verificar antes de retomar`)}</button>}
      {variablePending && variablePending.elegiveis > 0 && <button type="button" className="vo-action" onClick={() => setDrill("variables")}>{tile("Variáveis pendentes",`${n(variablePending.elegiveis)} funcionários disponíveis para processar`)}</button>}
      {formulaPending && formulaPending.elegiveis > 0 && <button type="button" className="vo-action" onClick={() => setDrill("formulas")}>{tile("Fórmulas pendentes",`${n(formulaPending.elegiveis)} funcionários disponíveis para calcular`)}</button>}
      {eligible !== undefined && eligible > 0 && <button type="button" className="vo-action" onClick={() => setDrill("send")}>{tile("Prontos para envio",`${n(eligible)} funcionários · inclui filiais parcialmente prontas`)}</button>}
      {missing.length > 0 && <button type="button" className="vo-action vo-neutral" onClick={() => setDrill("missing")}>{tile("Sem execução",`${branchCount(missing.length)} · iniciar nesta competência`)}</button>}
      {scope.data && (!scope.data.pending || !scope.data.send) && <button type="button" className="vo-action vo-warning" onClick={scope.refresh}>{tile("Contagens indisponíveis","Tentar consultar pendências e envio novamente")}</button>}
      {scope.error && <p className="op-error" role="alert">Não foi possível atualizar as contagens. <button className="btn btn-link" onClick={scope.refresh}>Atualizar</button></p>}
    </div>
    <footer className="vo-queue"><button type="button" onClick={() => setDrill("queue")}>{queueText} <span aria-hidden="true">↗</span></button><small>{lastActivity ? `Última atividade: ${dateTime(lastActivity)}` : "Sem atividade registrada"}</small></footer>
    <Modal show={drill !== null} onHide={() => setDrill(null)} centered className="op-modal" aria-labelledby={`vo-drill-${period.periodo_id}`}>
      <Modal.Header closeButton><Modal.Title id={`vo-drill-${period.periodo_id}`}>{drill && title[drill]} · {period.competencia}</Modal.Title></Modal.Header>
      <Modal.Body>
        {drill === "send" && <p className="op-muted">A tela de envio confirma quem está apto antes de agendar.</p>}
        {drill === "missing" ? missing.map(b => <div className="vo-drill-row" key={b.filialId}><strong>{b.nome}</strong><Link className="btn btn-outline-primary btn-sm" to={`${base}&filial=${b.filialId}&acao=nova`}>Iniciar execução</Link></div>) : drillRows.map(r => <div className="vo-drill-row" key={r.id}><strong>{r.filial}</strong><small className="op-muted">{drill === "variables" ? `${n(Math.max(0,r.total-r.variaveis))} funcionários com variáveis pendentes` : drill === "formulas" ? `${n(Math.max(0,r.total-r.valores))} funcionários com fórmulas pendentes` : drill === "sent" ? `${n(r.rm)} funcionários enviados` : drill === "send" ? `${n(Math.max(0,r.valores-r.rm))} cálculos aguardando conferência de envio` : `${r.processing} em execução · ${r.pending} na fila${r.controleFila ? ` · ${r.controleFila}` : ""}`}</small><Link className="btn btn-outline-primary btn-sm" to={detail(r.id,drill === "send" ? "resultados" : drill === "sent" ? "enviados" : drill === "formulas" ? "formulas_pendentes" : drill === "queue" ? "todas" : "pendencias")}>{drill === "send" ? "Conferir envio" : drill === "sent" ? "Ver confirmações" : drill === "queue" ? "Abrir fila" : "Ver funcionários"}</Link></div>)}
        {drill === "queue" && periodCreation.map(c => <div key={c.queueId} className="vo-drill-row"><strong>{c.filialNome ?? `Filial ${c.filialId}`}</strong><small>{c.status}</small><Link to={`${base}${c.status === "ERRO" ? "&acao=falhas" : ""}`}>Abrir preparação</Link></div>)}
        {drill !== "missing" && !drillRows.length && !(drill === "queue" && periodCreation.length) && <p>Nenhum item neste recorte.</p>}
      </Modal.Body>
    </Modal>
  </article>;
}

export function OperationalOverview({ activePeriodIds, branches }: { activePeriodIds: number[]; branches: Branch[] }) {
  const periodKey = activePeriodIds.join(",");
  const fetcher = useCallback(async () => {
    if (!periodKey) return {summaries:[],creation:[]};
    const [summaries,creation] = await Promise.all([Promise.all(periodKey.split(",").map(id => OperacaoApi.summary(id))),ExecucaoApi.getCreateQueueItems()]);
    return {summaries,creation};
  }, [periodKey]);
  const query = useOperationQuery(fetcher);
  return <section className="ve-operation-overview vo-overview" aria-labelledby="ve-operation-heading"><div className="ve-overview-body">
    <div className="ve-operation-head"><div><h2 id="ve-operation-heading">Acompanhamento por competência</h2><small className="op-muted">{activePeriodIds.length} ativas{query.at ? ` · Atualizado ${dateTime(query.at)}` : ""}</small></div><button type="button" className="btn btn-outline-primary btn-sm" disabled={query.loading} onClick={query.refresh}>Atualizar</button></div>
    <QueryNotice {...query}/>
    {!activePeriodIds.length && <p>Nenhuma competência ativa.</p>}
    <div className="vo-periods">{query.data?.summaries.filter(s => s.periodo?.ativo).map(s => <PeriodOverview key={s.periodo!.periodo_id} summary={s} branches={branches} creation={query.data!.creation} onRefresh={query.refresh} disabled={query.loading || Boolean(query.error)}/>)}</div>
  </div></section>;
}
