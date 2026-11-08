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

export function ProcessamentoPage() {
  const [params, setParams] = useSearchParams();
  const periodo = params.get("periodo") ?? "";
  const filial = params.get("filial") ?? "";
  const situation = params.get("situacao");
  const filter = situation === "conferencia" ? "envio" : situation ?? "todas";
  const history = params.get("visao") === "historico";
  const fetcher = useCallback(() => OperacaoApi.summary(periodo), [periodo]);
  const query = useOperationQuery(fetcher);
  const queueFetcher = useCallback(() => ExecucaoApi.getCreateQueueItems(), []);
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
  const visibleBranches = filiais.filter((f) => f.ativa &&
    f.nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes(branchNeedle));
  const totals = current.reduce(
    (a, r) => ({
      total: a.total + r.total,
      variaveis: a.variaveis + r.variaveis,
      valores: a.valores + r.valores,
      rm: a.rm + r.rm,
    }),
    { total: 0, variaveis: 0, valores: 0, rm: 0 },
  );
  const filialOptions = Array.from(
    new Map(
      (query.data?.rows ?? []).map((r) => [r.filialId, r.filial]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const activeCreation = (creation.data ?? []).filter((q) =>
    ["PENDENTE", "PROCESSANDO"].includes(q.status),
  );
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
    if (!query.data?.periodo) return;
    setSaving(true);
    setCreateError("");
    try {
      const r = await ExecucaoApi.enqueueCreateExecucaoBatch({
        filialIds: createIds,
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
              Consulta atualizada em <strong>{dateTime(query.at)}</strong>
            </>
          )}
          <button
            className="btn btn-outline-secondary"
            onClick={query.refresh}
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
              label="Variáveis concluídas"
              value={totals.variaveis}
              total={totals.total}
            />
            <StageCount
              label="Valores concluídos"
              value={totals.valores}
              total={totals.total}
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
            . Contagens por funcionário.
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
                    <th>Valores</th>
                    <th>RM</th>
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
                    const stageDone = singleStage === "VARIAVEIS" ? r.variaveis
                      : singleStage === "VALORES" ? r.valores
                      : singleStage === "ENVIAR_RM" ? r.rm
                      : null;
                    const progressMax = r.total * (stageDone === null ? 3 : 1);
                    const progressValue = stageDone ?? (r.variaveis + r.valores + r.rm);
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
                        <td data-label="Variáveis">
                          <StageCount
                            label="Variáveis"
                            value={r.variaveis}
                            total={r.total}
                            showBar={false}
                          />
                        </td>
                        <td data-label="Valores">
                          <StageCount
                            label="Valores"
                            value={r.valores}
                            total={r.total}
                            showBar={false}
                          />
                        </td>
                        <td data-label="RM">
                          <StageCount label="RM" value={r.rm} total={r.total} showBar={false} />
                        </td>
                        <td>
                          <span className={`op-status op-${s.tone}`}>
                            {s.label}
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
              Selecione as filiais para esta competência. Execuções anteriores
              permanecem no histórico.
            </p>
            <label>
              Buscar filial
              <input type="search" value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)} />
            </label>
            <p className="op-muted mt-2" role="status">
              {createIds.length === 1 ? "1 filial selecionada" : `${createIds.length} filiais selecionadas`}
              {createIds.length > 0 && ` · ${filiais.filter((f) => createIds.includes(f.filial_id)).map((f) => f.nome).join(", ")}`}
            </p>
            <fieldset className="op-choices">
              <legend>Filiais</legend>
              {branchNeedle && visibleBranches.length === 0 && <p>Nenhuma filial encontrada.</p>}
              {visibleBranches.map((f) => (
                  <label className="op-check" key={f.filial_id}>
                    <input
                      type="checkbox"
                      checked={createIds.includes(f.filial_id)}
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
                      {current.some((r) => r.filialId === f.filial_id) && (
                        <small>Já possui execução nesta competência</small>
                      )}
                    </span>
                  </label>
                ))}
            </fieldset>
            <label className="op-check">
              <input
                type="checkbox"
                checked={automatic}
                onChange={(e) => setAutomatic(e.target.checked)}
              />
              <span>
                Processar Variáveis e Valores após a criação
                <small>
                  O envio ao RM é feito pelo botão Enviar ao RM após o cálculo dos valores.
                </small>
              </span>
            </label>
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
              disabled={saving || !createIds.length}
            >
              {saving
                ? "Agendando…"
                : createIds.length > 1
                  ? `Criar ${createIds.length} execuções`
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
