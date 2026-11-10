import { PageHeading } from "../../shared/components/PageHeading";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router";
import { Dropdown } from "react-bootstrap";
import { Modal } from "../../shared/components/VeModal";
import {
  OperacaoApi,
  type OperationRow,
  type QueueAction,
} from "../../utils/api/operacaoApi";
import { ExecucaoApi } from "../../utils/api/execucaoApi";
import { filialApi } from "../../utils/api/filialApi";
import type { Filial } from "../../models/FilialModel";
import {
  dateTime,
  etapaLabel,
  errorMessage,
  useOperationAction,
  QueryNotice,
  SendScope,
  situacoes,
  StageCount,
  useOperationQuery,
} from "../../components/Processamento/OperationCommon";

function BranchMeter({label,value,total}:{label:string;value:number;total:number}) {
 const percent=total>0?Math.max(0,Math.min(100,Math.floor(value*100/total))):0;
 const complete=total>0&&value>=total;
 return <div className={`ve-branch-meter ${complete?'is-complete':''}`}><div><strong>{complete?'✓ ':''}{total>0?percent+'%':'—'}</strong><small>{value.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')}</small></div><progress aria-label={`${label}: ${value} de ${total}`} value={value} max={total||1}/></div>;
}

export function ProcessamentoPage() {
  const [params, setParams] = useSearchParams();
  const periodo = params.get("periodo") ?? "";
  const filial = params.get("filial") ?? "";
  const situation = params.get("situacao");
  const filter = situation === "conferencia" ? "envio" : situation ?? "todas";
  const history = params.get("visao") === "historico";
  const fetcher = useCallback(() => OperacaoApi.summary(periodo), [periodo]);
  const query = useOperationQuery(fetcher);
  const queueFetcher = useCallback(async () => {
    const [items, failures] = await Promise.all([
      ExecucaoApi.getCreateQueueItems(),
      ExecucaoApi.getCreateQueueErrors(200),
    ]);
    return { items, failures };
  }, []);
  const creation = useOperationQuery(queueFetcher);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const [queueCommand, setQueueCommand] = useState<{ row: OperationRow; action: QueueAction } | null>(null);
  const [queueSaving, setQueueSaving] = useState(false);
  const [queueError, setQueueError] = useState("");
  const controlQueue = async () => {
    if (!queueCommand) return;
    setQueueSaving(true);
    setQueueError("");
    try {
      const result = await OperacaoApi.controlQueue(queueCommand.row.id, queueCommand.action);
      setNotice(result.message);
      setQueueCommand(null);
      query.refresh();
    } catch (error) {
      setQueueError(errorMessage(error));
    } finally {
      setQueueSaving(false);
    }
  };
  const command = useOperationAction(setNotice, () => {
    setSelected([]);
    setSelecting(false);
    query.refresh();
  });
  const [create, setCreate] = useState(false);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [createIds, setCreateIds] = useState<number[]>([]);
  const [branchSearch, setBranchSearch] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createErrors, setCreateErrors] = useState<Awaited<
    ReturnType<typeof ExecucaoApi.getCreateQueueErrors>
  > | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [errorsLoading, setErrorsLoading] = useState(false);
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
  }, [periodo, filial, filter, history]);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
    setSelected([]);
    setSelecting(false);
  };
  useEffect(() => {
    document.title = `Operação${query.data?.periodo ? ` · ${query.data.periodo.competencia}` : ""} | Vale Expresso`;
  }, [query.data?.periodo]);
  useEffect(() => {
    if (!periodo && query.data?.periodo) {
      const next = new URLSearchParams(params);
      next.set("periodo", String(query.data.periodo.periodo_id));
      setParams(next, { replace: true });
    }
  }, [periodo, query.data?.periodo, params, setParams]);
  const rows = useMemo(
    () =>
      (query.data?.rows ?? [])
        .filter((r) => history || r.latest)
        .filter((r) => !filial || r.filialId === Number(filial))
        .filter(
          (r) =>
            filter === "todas" ||
            (filter === "pendencias"
              ? ["acao", "tentativa", "fila", "andamento", "pausando", "pausada", "cancelando"].includes(r.situacao)
              : r.situacao === filter),
        )
        .sort(
          (a, b) => a.filial.localeCompare(b.filial, "pt-BR") || b.id - a.id,
        ),
    [query.data, history, filial, filter],
  );
  const current = (query.data?.rows ?? []).filter(
    (r) => r.latest && (!filial || r.filialId === Number(filial)),
  );
  const previousActive = (query.data?.rows ?? []).filter(
    (r) => !r.latest && (r.processing > 0 || r.pending > 0) &&
      (!filial || r.filialId === Number(filial)),
  );
  const branchNeedle = branchSearch.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const activeBranches = filiais.filter((f) => f.ativa);
  const activeCreation = (creation.data?.items ?? []).filter((q) =>
    ["PENDENTE", "PROCESSANDO"].includes(q.status),
  );
  const existingBranches = new Set((query.data?.rows ?? []).map((r) => r.filialId));
  const queuedBranches = new Set(activeCreation
    .filter((item) => item.periodoId === query.data?.periodo?.periodo_id)
    .map((item) => item.filialId));
  const eligibleBranches = activeBranches.filter((f) =>
    !existingBranches.has(f.filial_id) && !queuedBranches.has(f.filial_id));
  const eligibleIds = new Set(eligibleBranches.map((f) => f.filial_id));
  const selectedCreationIds = createIds.filter((id) => eligibleIds.has(id));
  const visibleBranches = activeBranches.filter((f) =>
    f.nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes(branchNeedle));
  const totals = current.reduce(
    (a, r) => ({
      total: a.total + r.total,
      variaveis: a.variaveis + r.variaveis,
      valores: a.valores + r.valores,
      rm: a.rm + r.rm,
      variablesDone: a.variablesDone + r.progresso.variaveisCalculadas,
      variablesTotal: a.variablesTotal + r.progresso.variaveisPrevistas,
      formulasDone: a.formulasDone + r.progresso.formulasCalculadas,
      formulasTotal: a.formulasTotal + r.progresso.formulasPrevistas,
    }),
    { total: 0, variaveis: 0, valores: 0, rm: 0, variablesDone: 0, variablesTotal: 0, formulasDone: 0, formulasTotal: 0 },
  );
  const inScope = (item: { periodoId: number; filialId: number }) =>
    item.periodoId === query.data?.periodo?.periodo_id && (!filial || item.filialId === Number(filial));
  const preparing = activeCreation.filter(inScope);
  const creationFailures = new Set((creation.data?.failures ?? [])
    .filter((item) => item.status === "ERRO" && inScope(item) &&
      !existingBranches.has(item.filialId) && !queuedBranches.has(item.filialId))
    .map((item) => item.filialId));
  const activity = [...current, ...previousActive];
  const processingJobs = activity.reduce((sum, row) => sum + row.processing, 0);
  const pendingJobs = activity.reduce((sum, row) => sum + row.pending, 0);
  const attention = current.reduce((sum, row) => sum + row.errors, 0);
  const paused = activity.some((row) => row.controleFila === "PAUSADA" && row.pending > 0);
  const cancelled = current.some((row) => row.controleFila === "CANCELADA" && row.valores < row.total);
  const queueKnown = !!creation.data && !creation.error && !query.error;
  const calculationActive = activity.some((row) => (row.pending > 0 || row.processing > 0) &&
    row.etapas.some((stage) => stage === "VARIAVEIS" || stage === "VALORES"));
  const expected = totals.variablesTotal + totals.formulasTotal;
  const percent = expected ? Math.max(0, Math.min(100, Math.floor(100 * (totals.variablesDone + totals.formulasDone) / expected))) : null;
  const totalKnown = !preparing.length && !creationFailures.size;
  const showPercent = percent !== null;
  const progressStatus = !queueKnown ? "Aguardando atualização da fila"
    : preparing.length ? "Preparando execuções"
    : percent === 100 && !calculationActive && processingJobs ? "Cálculo concluído · envio ao RM em andamento"
    : percent === 100 && !calculationActive && pendingJobs && !paused ? "Cálculo concluído · envio ao RM na fila"
    : processingJobs ? "Processamento em andamento"
    : paused ? "Fila com execuções pausadas"
    : pendingJobs ? "Aguardando a fila"
    : attention || creationFailures.size || cancelled ? "Fila encerrada com pendências"
    : totals.total > 0 && totals.valores === totals.total ? "Cálculo concluído"
    : totals.total ? "Sem tarefas na fila · cálculo pendente"
    : "Nenhuma execução neste recorte";
  const filialOptions = Array.from(
    new Map(
      (query.data?.rows ?? []).map((r) => [r.filialId, r.filial]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const openCreate = async () => {
    setCreate(true);
    setCreateError("");
    setBranchSearch("");
    setCreateIds(filial ? [Number(filial)] : []);
    try {
      setFiliais(await filialApi.all());
    } catch (e) {
      setCreateError(errorMessage(e));
    }
  };
  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.data?.periodo || !selectedCreationIds.length) return;
    setSaving(true);
    setCreateError("");
    try {
      const r = await ExecucaoApi.enqueueCreateExecucaoBatch({
        filialIds: selectedCreationIds,
        periodoId: query.data.periodo.periodo_id,
        processarVariaveisEValores: automatic,
      });
      if (!r.status) throw new Error(r.message);
      setCreate(false);
      setNotice(r.message);
      creation.refresh();
      query.refresh();
    } catch (e) {
      setCreateError(
        e instanceof Error && !("response" in e) ? e.message : errorMessage(e),
      );
    } finally {
      setSaving(false);
    }
  };
  const openErrors = async () => {
    setShowErrors(true);
    setErrorsLoading(true);
    try {
      setCreateErrors(await ExecucaoApi.getCreateQueueErrors());
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setErrorsLoading(false);
    }
  };
  const returnTo = `/processamento?${params}`;
  return (
    <div className="op-page">
      <PageHeading
        area="Operação diária"
        title="Processamentos"
        description="Acompanhe cada etapa e avance com o contexto da competência."
        actions={(
          <button
            className="btn btn-primary"
            disabled={!query.data?.periodo?.ativo || Boolean(query.error)}
            onClick={() => void openCreate()}
          >
            Nova execução
          </button>
        )}
      />
      <section className="op-context" aria-label="Contexto da operação">
        <label>
          Competência
          <select
            value={periodo || query.data?.periodo?.periodo_id || ""}
            onChange={(e) => change("periodo", e.target.value)}
          >
            <option value="" disabled>
              Selecione
            </option>
            {query.data?.periodos.map((p) => (
              <option key={p.periodo_id} value={p.periodo_id}>
                {p.competencia}
                {!p.ativo ? " · encerrada" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filial
          <select
            value={filial}
            onChange={(e) => change("filial", e.target.value)}
          >
            <option value="">Todas as filiais</option>
            {filialOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="op-freshness">
          {query.at && (
            <>
              Atualizado <strong>{dateTime(query.at)}</strong>
            </>
          )}
          <button
            className="btn btn-outline-secondary"
            onClick={() => { query.refresh(); creation.refresh(); }}
            disabled={query.loading}
          >
            Atualizar
          </button>
        </div>
      </section>
      <QueryNotice {...query} />
      {notice && (
        <div className="op-notice" role="status">
          {notice}
          <button
            className="op-dismiss"
            aria-label="Dispensar mensagem"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {query.data && (
        <>
          {!history && (
            <section className="op-panel op-stage op-overall-progress mb-3" aria-labelledby="op-overall-heading">
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                <div>
                  <h2 id="op-overall-heading">Progresso geral do cálculo</h2>
                  <details className="ve-progress-help"><summary>Como o progresso é calculado</summary><p className="op-muted mb-2">Variáveis e fórmulas calculadas sobre o total previsto. Resultados parciais também contam; o envio ao RM é separado.</p></details>
                </div>
                {showPercent && <div className="ve-percent-summary"><strong className="op-overall-percent">{percent}%</strong><small>{!queueKnown || !totalKnown ? "Parcial · execuções criadas" : "Das variáveis e fórmulas previstas"}</small></div>}
              </div>
              <div role="status">
                <strong className={`ve-status-pill ${attention || creationFailures.size ? "ve-status-danger" : processingJobs || pendingJobs ? "ve-status-info" : percent === 100 ? "ve-status-success" : "ve-status-warning"}`}>{progressStatus}</strong>
                <p className="mb-2">
                  {totals.valores.toLocaleString("pt-BR")} de {totals.total.toLocaleString("pt-BR")} funcionários concluídos
                  {!totalKnown && " nas execuções já criadas"}
                </p>
                {queueKnown && (preparing.length > 0 || pendingJobs > 0 || processingJobs > 0 || attention > 0 || creationFailures.size > 0) && (
                  <ul className="op-overall-activity">
                    {preparing.length > 0 && <li>Preparando <strong>{preparing.length}</strong></li>}
                    {processingJobs > 0 && <li>Em andamento <strong>{processingJobs}</strong></li>}
                    {pendingJobs > 0 && <li>Na fila <strong>{pendingJobs}</strong></li>}
                    {attention > 0 && <li>Com pendências <strong>{attention}</strong></li>}
                    {creationFailures.size > 0 && <li><button type="button" className="btn btn-link p-0" onClick={() => void openErrors()}>
                      Falha na criação ({creationFailures.size})
                    </button></li>}
                  </ul>
                )}
              </div>
              {showPercent && <progress aria-label="Percentual de variáveis e fórmulas calculadas"
                max={100} value={percent} />}
            </section>
          )}
          {!history && previousActive.length > 0 && (
            <div className="op-notice" role="status">
              <strong>Execuções anteriores ainda na fila</strong>
              <ul className="mb-0">
                {previousActive.map((r) => (
                  <li key={r.id}>
                    <Link to={`/processamento/${r.id}?aba=acompanhamento&retorno=${encodeURIComponent(`/processamento?${params}`)}`}>
                      {r.filial} · execução #{r.id}
                    </Link>
                    {" · "}{r.processing} em andamento · {r.pending} na fila
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div
            className="op-summary"
            aria-label="Progresso das execuções atuais"
          >
            <StageCount
              label="Variáveis calculadas"
              value={totals.variablesDone}
              total={totals.variablesTotal}
              unit="variáveis"
              detail={`${totals.variaveis}/${totals.total} funcionários completos`}
            />
            <StageCount
              label="Fórmulas calculadas"
              value={totals.formulasDone}
              total={totals.formulasTotal}
              unit="fórmulas"
              detail={`${totals.valores}/${totals.total} funcionários completos`}
            />
            <StageCount
              label="Enviados ao RM"
              value={totals.rm}
              total={totals.total}
            />
          </div>
          <div className="op-toolbar">
            <div className="op-segments" aria-label="Visão">
              <button
                aria-pressed={!history}
                onClick={() => change("visao", "")}
              >
                Operação atual
              </button>
              <button
                aria-pressed={history}
                onClick={() => change("visao", "historico")}
              >
                Histórico de execuções
              </button>
            </div>
            <label>
              Situação
              <select
                value={filter}
                onChange={(e) => change("situacao", e.target.value)}
              >
                <option value="todas">Todas</option>
                <option value="pendencias">Pendências e andamento</option>
                <option value="acao">Exige ação</option>
                <option value="tentativa">Aguardando tentativa</option>
                <option value="envio">Pronto para envio</option>
                <option value="enviado">Enviado ao RM</option>
              </select>
            </label>
            <button
              className="btn btn-outline-secondary"
              disabled={Boolean(query.error) || !rows.length}
              onClick={() => {
                setSelecting(!selecting);
                setSelected([]);
              }}
            >
              {selecting ? "Encerrar seleção" : "Selecionar filiais"}
            </button>
          </div>
          {selecting && (
            <div className="op-selection" role="status">
              <strong>
                {selected.length} execuções selecionadas neste recorte
              </strong>
              {selected.length > 0 && (
                <SendScope key={selected.join(",")} executionIds={selected}
                  disabled={command.busy || Boolean(query.error)}
                  onSend={() => void command.run({ etapa: "ENVIAR_RM", execucaoIds: selected })}
                />
              )}
              <button
                className="btn btn-outline-secondary"
                onClick={() => setSelected([])}
              >
                Limpar seleção
              </button>
            </div>
          )}
          <p className="op-muted">
            {rows.length} execuções exibidas · {current.length} filiais no
            recorte atual
            {history
              ? " · cada linha preserva sua execução e seus resultados"
              : " · execução mais recente de cada filial"}
            . Variáveis sem duplicação por funcionário; valores por fórmula; RM por funcionário.
          </p>
          {rows.length ? (
            <div className="op-table-wrap">
              <table className="op-table op-branches">
                <caption className="visually-hidden">
                  Etapas e próxima ação por filial na competência{" "}
                  {query.data.periodo?.competencia}
                </caption>
                <thead>
                  <tr>
                    <th>Filial e funcionários</th>
                    <th>Variáveis</th>
                    <th>Fórmulas</th>
                    <th>Funcionários</th>
                    <th>Envio ao RM</th>
                    <th>Situação</th>
                    <th>Próxima ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = situacoes[r.situacao] ?? situacoes.inicio;
                    const href = `/processamento/${r.id}?${new URLSearchParams({ aba: s.tab, retorno: returnTo })}`;
                    // A fila pode incluir a próxima etapa; só nomeie a etapa se o tipo for único.
                    const singleStage = r.etapas.length === 1 ? r.etapas[0] : null;
                    const stageDone = singleStage === "VARIAVEIS" ? r.progresso.variaveisCalculadas
                      : singleStage === "VALORES" ? r.progresso.formulasCalculadas
                      : singleStage === "ENVIAR_RM" ? r.rm
                      : null;
                    const progressMax = singleStage === "VARIAVEIS" ? r.progresso.variaveisPrevistas
                      : singleStage === "VALORES" ? r.progresso.formulasPrevistas
                      : singleStage === "ENVIAR_RM" ? r.total
                      : r.progresso.variaveisPrevistas + r.progresso.formulasPrevistas;
                    const progressValue = stageDone ?? (r.progresso.variaveisCalculadas + r.progresso.formulasCalculadas);
                    const progressLabel = stageDone === null
                      ? "Avanço da execução"
                      : etapaLabel(singleStage!);
                    return (
                      <tr key={r.id}>
                        <th scope="row">
                          <div className="op-branch-name">
                            {selecting && (
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${r.filial}, execução ${r.id}`}
                                checked={selected.includes(r.id)}
                                onChange={(e) =>
                                  setSelected((prev) =>
                                    e.target.checked
                                      ? [...prev, r.id]
                                      : prev.filter((id) => id !== r.id),
                                  )
                                }
                              />
                            )}
                            <Link to={href}>{r.filial}</Link>
                          </div>
                          <small>
                            {r.total} funcionários · execução #{r.id}
                          </small>
                          {r.processing > 0 && progressMax > 0 && (
                            <div className="op-branch-progress">
                              <span>{progressLabel}</span>
                              <progress
                                aria-label={`${progressLabel} · ${r.filial}`}
                                value={progressValue}
                                max={progressMax}
                              />
                            </div>
                          )}
                          {history && (
                            <small>
                              {dateTime(r.createdAt)} ·{" "}
                              {r.latest ? "Atual" : "Histórico"}
                            </small>
                          )}
                        </th>
                        <td data-label="Variáveis"><BranchMeter label="Variáveis" value={r.progresso.variaveisCalculadas} total={r.progresso.variaveisPrevistas}/></td>
                        <td data-label="Fórmulas"><BranchMeter label="Fórmulas" value={r.progresso.formulasCalculadas} total={r.progresso.formulasPrevistas}/></td>
                        <td data-label="Funcionários"><BranchMeter label="Funcionários com valores calculados" value={r.valores} total={r.total}/></td>
                        <td data-label="Envio ao RM"><BranchMeter label="Funcionários enviados ao RM" value={r.rm} total={r.total}/></td>
                        <td>
                          <span className={`ve-branch-badge ${r.errors>0?'has-error':['conferencia','envio','enviado'].includes(r.situacao)?'is-complete':''}`}>
                            <span aria-hidden="true">{r.errors>0?'!':['conferencia','envio','enviado'].includes(r.situacao)?'✓':'◷'}</span>
                            {r.errors>0?'Com erro':r.situacao==='enviado'?'Enviado ao RM':['conferencia','envio'].includes(r.situacao)?'Calculado':r.situacao==='inicio'?'A calcular':s.label}
                          </span>
                          {r.nextRunAt && !r.controleFila && (
                            <small>
                              Próxima tentativa: {dateTime(r.nextRunAt)}
                            </small>
                          )}
                          {r.errors > 0 && (
                            <small>{r.errors} pessoas exigem ação</small>
                          )}
                          {r.processing + r.pending > 0 && (
                            <small>
                              {r.processing} em andamento · {r.pending}{" "}
                              agendados
                            </small>
                          )}
                        </td>
                        <td>
                          <Link
                            className={`btn ${r.situacao === "envio" ? "btn-primary" : "btn-outline-primary"}`}
                            to={href}
                          >
                            {s.action}
                          </Link>
                          {r.controleFila !== "CANCELADA" &&
                            (r.processing + r.pending > 0 || r.controleFila === "PAUSADA") && (
                              <Dropdown className="mt-2">
                                <Dropdown.Toggle variant="outline-secondary" size="sm">
                                  Gerenciar fila
                                </Dropdown.Toggle>
                                <Dropdown.Menu>
                                  <Dropdown.Item onClick={() => {
                                    setQueueError("");
                                    setQueueCommand({ row: r, action: r.controleFila === "PAUSADA" ? "retomar" : "pausar" });
                                  }}>
                                    {r.controleFila === "PAUSADA" ? "Retomar" : "Pausar"}
                                  </Dropdown.Item>
                                  {r.processing + r.pending > 0 && (
                                    <Dropdown.Item className="text-danger" onClick={() => {
                                      setQueueError("");
                                      setQueueCommand({ row: r, action: "cancelar" });
                                    }}>
                                      Cancelar processamento
                                    </Dropdown.Item>
                                  )}
                                </Dropdown.Menu>
                              </Dropdown>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="op-empty">
              <h2>Nenhuma execução neste recorte</h2>
              <p>
                {query.data.rows.length
                  ? "Ajuste os filtros para encontrar outras execuções."
                  : "Crie uma execução para iniciar o trabalho desta competência."}
              </p>
            </div>
          )}
        </>
      )}
      {activeCreation.length > 0 && (
        <section className="op-panel">
          <h2>Criação de execuções</h2>
          <p>
            Esta fila prepara novas execuções. Variáveis, Valores e RM são
            acompanhados nas linhas acima.
          </p>
          <ul>
            {activeCreation.map((q) => (
              <li key={q.queueId}>
                {q.filialNome ?? `Filial ${q.filialId}`} ·{" "}
                {q.periodoCompetencia ?? `competência #${q.periodoId}`} ·{" "}
                {q.status === "PROCESSANDO" ? "Preparando" : "Agendada"}
                {q.nextRunAt
                  ? ` · próxima tentativa ${dateTime(q.nextRunAt)}`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="op-footer-actions">
        <button className="btn btn-link" onClick={() => void openErrors()}>
          Consultar falhas de criação
        </button>
        {creation.error && (
          <span role="status">
            Não foi possível atualizar a fila de criação.
          </span>
        )}
      </div>
      <Modal
        show={queueCommand !== null}
        onHide={() => { if (!queueSaving) setQueueCommand(null); }}
        backdrop={queueSaving ? "static" : true}
        keyboard={!queueSaving}
      >
        <Modal.Header closeButton={!queueSaving}>
          <Modal.Title>
            {queueCommand?.action === "cancelar" ? "Cancelar processamento"
              : queueCommand?.action === "retomar" ? "Retomar processamento"
                : "Pausar processamento"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p><strong>{queueCommand?.row.filial}</strong> · execução #{queueCommand?.row.id}</p>
          <p>
            {queueCommand?.action === "cancelar"
              ? "As etapas pendentes serão canceladas. O lote em andamento pode terminar. Resultados já gravados e envios já efetuados são preservados."
              : queueCommand?.action === "retomar"
                ? "As etapas pendentes voltam a ficar disponíveis para processamento."
                : "O lote em andamento pode terminar. As demais etapas desta execução aguardam até você retomar."}
          </p>
          {queueError && <p role="alert" className="text-danger">{queueError}</p>}
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-outline-secondary" disabled={queueSaving} onClick={() => setQueueCommand(null)}>Voltar</button>
          <button className={`btn ${queueCommand?.action === "cancelar" ? "btn-danger" : "btn-primary"}`}
            disabled={queueSaving} onClick={() => void controlQueue()}>
            {queueSaving ? "Aplicando…" : "Confirmar"}
          </button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={create}
        onHide={() => {
          if (!saving) setCreate(false);
        }}
        centered
        scrollable
        className="op-create-modal"
      >
        <form onSubmit={(e) => void submitCreate(e)}>
          <Modal.Header closeButton closeLabel="Fechar nova execução">
            <Modal.Title>
              Nova execução · {query.data?.periodo?.competencia}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {createError && (
              <div className="op-notice op-error" role="alert">
                {createError}
              </div>
            )}
            <p>
              Cada filial tem uma execução por competência. Para retomar uma etapa, abra a execução existente.
            </p>
            <label className="op-check">
              <input
                type="checkbox"
                checked={automatic}
                disabled={saving}
                onChange={(e) => setAutomatic(e.target.checked)}
              />
              <span>
                Processar Variáveis e Valores após a criação
                <small>
                  O envio ao RM é feito pelo botão Enviar ao RM após o cálculo dos valores.
                </small>
              </span>
            </label>
            <label>
              Buscar filial
              <input type="search" value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)} />
            </label>
            <div className="d-flex flex-wrap align-items-center gap-2 my-3">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                disabled={saving || !eligibleBranches.some((f) => !createIds.includes(f.filial_id))}
                onClick={() => setCreateIds([...eligibleIds])}
              >
                Selecionar filiais disponíveis
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={saving || !selectedCreationIds.length}
                onClick={() => setCreateIds([])}
              >
                Limpar seleção
              </button>
              <span className="op-muted" role="status">
                {selectedCreationIds.length === 1 ? "1 filial selecionada" : `${selectedCreationIds.length} filiais selecionadas`}
              </span>
            </div>
            <fieldset className="op-choices">
              <legend>Filiais</legend>
              {branchNeedle && visibleBranches.length === 0 && <p>Nenhuma filial encontrada.</p>}
              {visibleBranches.map((f) => (
                  <label className="op-check" key={f.filial_id}>
                    <input
                      type="checkbox"
                      checked={eligibleIds.has(f.filial_id) && createIds.includes(f.filial_id)}
                      disabled={saving || !eligibleIds.has(f.filial_id)}
                      onChange={(e) =>
                        setCreateIds((p) =>
                          e.target.checked
                            ? [...p, f.filial_id]
                            : p.filter((id) => id !== f.filial_id),
                        )
                      }
                    />
                    <span>
                      {f.nome}
                      {existingBranches.has(f.filial_id) ? <small>Já tem execução nesta competência</small>
                        : queuedBranches.has(f.filial_id) ? <small>Na fila de criação</small> : null}
                    </span>
                  </label>
                ))}
            </fieldset>
          </Modal.Body>
          <Modal.Footer>
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={saving}
              onClick={() => setCreate(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={saving || !selectedCreationIds.length}
            >
              {saving
                ? "Agendando…"
                : selectedCreationIds.length > 1
                  ? `Criar ${selectedCreationIds.length} execuções`
                  : "Criar execução"}
            </button>
          </Modal.Footer>
        </form>
      </Modal>
      <Modal
        show={showErrors}
        onHide={() => setShowErrors(false)}
        size="lg"
      >
        <Modal.Header closeButton closeLabel="Fechar falhas">
          <Modal.Title>Falhas de criação</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {errorsLoading ? (
            <p role="status">Carregando falhas…</p>
          ) : createErrors?.length ? (
            createErrors.map((e) => (
              <details key={e.queueId}>
                <summary>
                  {e.filialNome} · {e.periodoCompetencia} · {e.status} ·{" "}
                  {dateTime(e.updatedAt)}
                </summary>
                <pre>{e.lastError}</pre>
              </details>
            ))
          ) : (
            <p>Nenhuma falha retornada na consulta.</p>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}
