import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  OperacaoApi,
  type Etapa,
  type ResultDetail,
} from "../../utils/api/operacaoApi";
import api from "../../utils/api/Api";
import { ExecucaoApi } from "../../utils/api/execucaoApi";
import {
  dateTime,
  errorMessage,
  etapaLabel,
  money,
  useOperationAction,
  QueryNotice,
  StageCount,
  statusLabel,
  useOperationQuery,
} from "./OperationCommon";

function ResultPanel({
  execucaoId,
  resultId,
  onChanged,
}: {
  execucaoId: number;
  resultId: number;
  onChanged: () => void;
}) {
  const fetcher = useCallback(
    () => OperacaoApi.result(execucaoId, resultId),
    [execucaoId, resultId],
  );
  const query = useOperationQuery(fetcher, 0);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [historyOlder, setHistoryOlder] = useState<ResultDetail["historico"]>(
    [],
  );
  useEffect(() => {
    setEditing(false);
    setNotice("");
    setHistoryOlder([]);
  }, [resultId]);
  const changed = () => {
    query.refresh();
    onChanged();
  };
  const adjust = async (e: FormEvent) => {
    e.preventDefault();
    const r = query.data;
    if (!r) return;
    setBusy(true);
    setNotice("");
    try {
      await OperacaoApi.adjust(
        execucaoId,
        resultId,
        r.revisao,
        Number(value),
        reason,
      );
      setEditing(false);
      setNotice("Ajuste registrado. A nova versão está disponível para envio.");
      changed();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const older = async () => {
    const all = [...(query.data?.historico ?? []), ...historyOlder];
    if (!all.length) return;
    setBusy(true);
    try {
      const rows = (await api.get(
        `/operacao/${execucaoId}/resultado/${resultId}/historico?antes=${all[all.length - 1].id}`,
      )) as Array<
        Omit<ResultDetail["historico"][number], "detalhe"> & { detalhe: string }
      >;
      setHistoryOlder((prev) => [
        ...prev,
        ...rows.map((h) => ({
          ...h,
          detalhe: JSON.parse(h.detalhe) as Record<string, unknown>,
        })),
      ]);
      if (!rows.length) setNotice("Fim do histórico.");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (query.data) {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [resultId, query.data?.execucao_funcionario_id]);
  const r = query.data;
  const f = r?.formulaUtilizada ?? r?.formula;
  const valid =
    r &&
    ["PROCESSADO", "ENVIADO_RM"].includes(r.status) &&
    ["RESULTADOS_PROCESSADOS", "ENVIADO_RM", "ERRO_RM"].includes(
      r.execucao_funcionario_base.status,
    );
  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className="op-result"
      aria-label="Resultado selecionado"
      aria-busy={query.loading}
    >
      <QueryNotice {...query} />
      {notice && (
        <div className="op-notice" role="status">
          {notice}
        </div>
      )}
      {r && (
        <>
          <header>
            <p className="op-eyebrow">
              Resultado #{resultId} · versão {r.revisao}
            </p>
            <h2>{r.execucao_funcionario_base.nome_funcionario}</h2>
            <p>
              {r.execucao_funcionario_base.funcionario_id_rm} · {f?.nome}
            </p>
          </header>
          <div className="op-result-status">
            <span className="op-status op-neutral">
              {r.enviado_revisao === r.revisao && r.status === "ENVIADO_RM"
                ? "Versão enviada"
                : r.enviado_revisao
                  ? "Alterado após envio"
                  : "Envio pendente"}
            </span>
          </div>
          {r.enviado_revisao && r.enviado_revisao !== r.revisao && (
            <div className="op-notice op-warning">
              O RM recebeu a versão {r.enviado_revisao}. A versão atual é{" "}
              {r.revisao}. O próximo envio atualizará o evento com o valor atual.
            </div>
          )}
          <div className="op-value-pair">
            <div>
              Valor calculado<strong>{money(r.valor_calculado)}</strong>
            </div>
            <div>
              Valor final<strong>{money(r.valor_final)}</strong>
              <small>
                {r.ajuste_manual ? "Com ajuste manual" : "Sem ajuste manual"}
              </small>
            </div>
          </div>
          <h3>Regra e memória deste resultado</h3>
          <p>
            Evento {f?.codEvento || "não configurado"} · tipo {f?.tipo || "—"} ·
            fórmula v{f?.versao ?? "—"}
          </p>
          {(!r.formulaUtilizada ||
            r.formulaUtilizada.snapshot_origem === "CONFERENCIA_LEGADO") && (
            <p className="op-notice op-warning">
              Resultado legado: a fórmula histórica não foi armazenada. A regra
              exibida é a configuração atual; verifique-a ao interpretar este resultado.
            </p>
          )}
          <pre className="op-formula">
            {f?.expressao || "Expressão indisponível"}
          </pre>
          <div className="op-scroll">
            <table className="op-table">
              <caption className="visually-hidden">
                Entradas da fórmula deste resultado
              </caption>
              <thead>
                <tr>
                  <th>Variável</th>
                  <th>Valor</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {r.memoria_calculo.map((m) => (
                  <tr key={m.memoria_id}>
                    <th scope="row">
                      {m.variavel_nome}
                      <small>{m.variavel_codigo}</small>
                    </th>
                    <td>
                      {Number(m.valor).toLocaleString("pt-BR", {
                        maximumFractionDigits: 4,
                      })}
                    </td>
                    <td>
                      {m.origem}
                      <details>
                        <summary>Ver origem e data</summary>
                        <p>{m.detalhe || "Sem detalhe adicional"}</p>
                        <small>{dateTime(m.data_registro)}</small>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!r.memoria_calculo.length && (
              <p className="op-notice">
                Não há entradas armazenadas para este resultado. Confira a regra
                e a origem antes de prosseguir.
              </p>
            )}
          </div>
          <div className="op-actions">
            <button
              className="btn btn-outline-secondary"
              disabled={busy || !valid || Boolean(query.error)}
              onClick={() => {
                setValue(String(r.valor_final ?? ""));
                setReason("");
                setEditing(!editing);
              }}
            >
              Ajustar valor
            </button>
            <button
              className="btn btn-link"
              disabled={busy || editing}
              onClick={query.refresh}
            >
              Atualizar resultado
            </button>
          </div>
          {editing && (
            <form className="op-adjust" onSubmit={(e) => void adjust(e)}>
              <h3>Ajustar valor final</h3>
              <p>
                Calculado: {money(r.valor_calculado)} · atual:{" "}
                {money(r.valor_final)}. O histórico preserva o valor anterior e a nova versão.
              </p>
              <label>
                Novo valor final
                <input
                  type="number"
                  step="0.01"
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <label>
                Motivo do ajuste
                <textarea
                  required
                  minLength={5}
                  maxLength={255}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="op-actions">
                <button className="btn btn-primary" disabled={busy}>
                  Salvar ajuste
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancelar ajuste
                </button>
              </div>
            </form>
          )}
          <h3>Histórico e confirmações do RM</h3>
          {r.metadados_rm_id && (
            <p>
              Identificador no RM: <strong>{r.metadados_rm_id}</strong>
              {!r.historico.some((h) => h.tipo === "ENVIO_RM") &&
                " · registro legado, sem recibo detalhado armazenado nesta versão do sistema."}
            </p>
          )}
          {[...r.historico, ...historyOlder].map((h) => (
            <details className="op-history-item" key={h.id}>
              <summary>
                {{
                  CALCULO: "Cálculo",
                  CONFERENCIA: "Conferência",
                  AJUSTE: "Ajuste",
                  ENVIO_RM: "Confirmado pelo RM",
                  ERRO_RM: "Falha no RM",
                }[h.tipo] ?? h.tipo}{" "}
                · v{h.revisao} · {dateTime(h.registrado_em)}
                {h.usuario_id ? ` · usuário #${h.usuario_id}` : ""}
              </summary>
              {h.tipo === "ENVIO_RM" ? (
                <p>
                  Confirmação no RM:{" "}
                  <strong>{String(h.detalhe.metadadosRmId)}</strong>
                </p>
              ) : null}
              {h.tipo === "AJUSTE" && (
                <p>
                  {String(h.detalhe.motivo ?? "")} · {money(h.detalhe.anterior)}{" "}
                  → {money(h.detalhe.novo)}
                </p>
              )}
              {h.tipo === "ENVIO_RM" && Boolean(h.detalhe.record) && (
                <p>
                  Evento{" "}
                  {String(
                    (h.detalhe.record as Record<string, unknown>).CODEVENTO,
                  )}{" "}
                  · {money((h.detalhe.record as Record<string, unknown>).VALOR)}
                </p>
              )}
              <details>
                <summary>Dados completos do registro</summary>
                <pre>{JSON.stringify(h.detalhe, null, 2)}</pre>
              </details>
            </details>
          ))}
          {!r.historico.length && (
            <p className="op-muted">
              Nenhum evento detalhado registrado. Os eventos passam a ser
              guardados a partir desta atualização.
            </p>
          )}
          {r.historico.length >= 100 && (
            <button
              className="btn btn-link"
              disabled={busy}
              onClick={() => void older()}
            >
              Carregar histórico anterior
            </button>
          )}
          {r.ajuste_manual_fk.length > 0 && (
            <details>
              <summary>Ajustes registrados anteriormente</summary>
              {r.ajuste_manual_fk.map((a) => (
                <div key={a.ajuste_id}>
                  <p>
                    {dateTime(a.data_ajuste)} · {a.usuario.nome} ·{" "}
                    {money(a.valor_anterior)} → {money(a.valor_novo)}
                  </p>
                  <p>{a.motivo}</p>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}

export function ProcessamentoDetalhesPage() {
  const id = Number(useParams().execucaoId);
  const [params, setParams] = useSearchParams();
  const tabs = [
    ["acompanhamento", "Acompanhamento"],
    ["pendencias", "Pendências"],
    ["resultados", "Resultados"],
    ["envios", "Envio ao RM"],
    ["historico", "Histórico"],
  ];
  const requestedTab = params.get("aba") === "conferencia" ? "resultados" : params.get("aba");
  const tab = tabs.some(([key]) => key === requestedTab)
    ? requestedTab!
    : "acompanhamento";
  const page = Math.max(1, Number(params.get("pagina")) || 1);
  const search = params.get("busca") ?? "";
  const filter = params.get("filtro") ?? "todos";
  const resultId = Number(params.get("resultado")) || 0;
  const fetcher = useCallback(
    () => OperacaoApi.detail(id, page, search, filter),
    [id, page, search, filter],
  );
  const query = useOperationQuery(fetcher);
  const summaryFetcher = useCallback(
    () =>
      OperacaoApi.summary(query.data?.execucao.periodo.periodo_id.toString()),
    [query.data?.execucao.periodo.periodo_id],
  );
  const summary = useOperationQuery(summaryFetcher, 20000);
  const row = summary.data?.rows.find((r) => r.id === id);
  const errorsFetcher = useCallback(() => ExecucaoApi.getErrors(id), [id]);
  const errors = useOperationQuery(errorsFetcher, 60000);
  const [selected, setSelected] = useState<number[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [searchDraft, setSearchDraft] = useState(search);
  const [recalculate, setRecalculate] = useState(false);
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
    setRecalculate(false);
  }, [id, page, search, filter]);
  const setContext = (
    entries: Record<string, string>,
    resetSelection = true,
  ) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(entries))
      v ? next.set(k, v) : next.delete(k);
    setParams(next);
    if (resetSelection) {
      setSelected([]);
      setSelecting(false);
    }
  };
  useEffect(() => {
    setSearchDraft(search);
  }, [search]);
  useEffect(() => {
    if (query.data)
      document.title = `${query.data.execucao.filial.nome} · ${query.data.execucao.periodo.competencia} | Vale Expresso`;
  }, [query.data]);
  const exec = query.data?.execucao;
  const rawReturn = params.get("retorno");
  const returnTo = rawReturn?.startsWith("/processamento?")
    ? rawReturn
    : `/processamento${exec ? `?periodo=${exec.periodo.periodo_id}` : ""}`;
  const command = useOperationAction(setNotice, () => {
    setSelected([]);
    setSelecting(false);
    setRecalculate(false);
    refresh();
  });
  const process = (etapa: Etapa) =>
    void command.run({
      etapa,
      execucaoIds: [id],
      ...(selecting ? { baseIds: selected } : {}),
      recalcular: etapa !== "ENVIAR_RM" && recalculate,
    });
  const refresh = () => {
    query.refresh();
    summary.refresh();
  };
  const commandDisabled =
    command.busy ||
    query.loading ||
    Boolean(query.error) ||
    Boolean(summary.error) ||
    (selecting && !selected.length);
  return (
    <div className="op-page">
      <Link className="op-back" to={returnTo}>
        ← Voltar à operação
      </Link>
      <header className="op-page-head">
        <div>
          <p className="op-eyebrow">Execução #{id}</p>
          <h1>{exec?.filial.nome ?? "Detalhe da execução"}</h1>
          <p>
            {exec
              ? `Competência ${exec.periodo.competencia} · criada em ${dateTime(exec.data_execucao)}`
              : "Carregando identificação…"}
          </p>
        </div>
        <button
          className="btn btn-outline-secondary"
          onClick={refresh}
          disabled={query.loading}
        >
          Atualizar
        </button>
      </header>
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
      {row && (
        <div className="op-summary">
          <StageCount
            label="Variáveis"
            value={row.variaveis}
            total={row.total}
          />
          <StageCount label="Valores" value={row.valores} total={row.total} />
          <StageCount label="Enviados ao RM" value={row.rm} total={row.total} />
        </div>
      )}
      {summary.error && (
        <div className="op-notice op-error" role="alert">
          O resumo não pôde ser atualizado. Atualize antes de realizar ações.
        </div>
      )}
      <nav className="op-tabs" aria-label="Etapas da execução">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setContext({ aba: key, resultado: "" })}
          >
            {label}
            {key === "pendencias" && row && row.errors + row.pending > 0
              ? ` (${row.errors + row.pending})`
              : ""}
          </button>
        ))}
      </nav>
      {tab === "pendencias" && (
        <section className="op-panel">
          <h2>Pendências e próximas tentativas</h2>
          {query.data?.queue.length ? (
            <div className="op-scroll">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Pessoa na execução</th>
                    <th>Etapa</th>
                    <th>Situação</th>
                    <th>Próxima tentativa</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.queue.map((q) => (
                    <tr key={q.queue_id}>
                      <td>
                        {q.execucao_funcionario_base.nome_funcionario}
                        <small>
                          {q.execucao_funcionario_base.funcionario_id_rm}
                        </small>
                      </td>
                      <td>{etapaLabel(q.tipo)}</td>
                      <td>
                        {q.status === "PROCESSANDO"
                          ? "Em andamento"
                          : q.tentativas
                            ? "Aguardando nova tentativa"
                            : "Na fila"}
                        <small>{q.tentativas} tentativas concluídas</small>
                      </td>
                      <td>
                        {q.next_run_at
                          ? dateTime(q.next_run_at)
                          : q.status === "PROCESSANDO"
                            ? "Em execução"
                            : "Aguardando disponibilidade"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Não há itens agendados ou em execução na última consulta.</p>
          )}
          <p className="op-muted">
            Uma tentativa agendada é automática. A revisão de retomada exclui
            trabalhos já ativos.
          </p>
          <details>
            <summary>Mensagens de falhas e histórico técnico</summary>
            <QueryNotice {...errors} />
            {errors.data?.length
              ? errors.data.map((e) => (
                  <details className="op-history-item" key={e.id}>
                    <summary>
                      {e.nomeFuncionario ?? e.funcionarioIdRm ?? "Execução"} ·{" "}
                      {e.tipo ? etapaLabel(e.tipo) : e.source} ·{" "}
                      {dateTime(e.createdAt)}
                    </summary>
                    <pre>{e.message}</pre>
                  </details>
                ))
              : !errors.loading &&
                !errors.error && <p>Nenhuma falha retornada na consulta.</p>}
            <p className="op-muted">
              Mensagens históricas podem pertencer a tentativas já resolvidas.
              Use o estado atual da pessoa e da fila para decidir.
            </p>
          </details>
        </section>
      )}
      {row && (row.processing > 0 || row.pending > 0) && (
        <div className="op-notice" role="status">
          {row.processing > 0 ? `${row.processing} itens em processamento` : "Aguardando execução da fila"} · {row.pending} etapas agendadas.
          {row.etapas.includes("VARIAVEIS") && " As variáveis consultam o RM em lotes de até 25 pessoas; as contagens avançam quando cada lote termina."}
        </div>
      )}
      {tab === "envios" && (
        <section className="op-panel">
          <h2>Enviar valores ao RM</h2>
          <p>
            Envie os valores calculados diretamente. Eventos existentes são atualizados;
            versões já enviadas e pessoas com cálculo incompleto ou etapa em andamento ficam fora da fila.
          </p>
          <button
            className="btn btn-primary"
            disabled={commandDisabled}
            onClick={() => process("ENVIAR_RM")}
          >
            {command.busy ? "Agendando…" : `Enviar ${selecting ? "seleção" : "execução"} ao RM`}
          </button>
          <p className="op-muted">
            Abra um resultado abaixo para consultar a versão e a confirmação por
            evento.
          </p>
        </section>
      )}
      {exec && (
        <>
          <section className="op-toolbar">
            <form
              className="op-search"
              onSubmit={(e) => {
                e.preventDefault();
                setContext({ busca: searchDraft, pagina: "1", resultado: "" });
              }}
            >
              <label>
                Nome ou matrícula
                <input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  type="search"
                />
              </label>
              <button className="btn btn-outline-primary">Buscar</button>
            </form>
            <label>
              Mostrar pessoas
              <select
                value={filter}
                onChange={(e) =>
                  setContext({
                    filtro: e.target.value,
                    pagina: "1",
                    resultado: "",
                  })
                }
              >
                <option value="todos">Todas</option>
                <option value="pendencias">
                  Com falha ou resultado parcial
                </option>
                <option value="resultados">
                  Com valores calculados / envio pendente
                </option>
                <option value="enviados">Enviadas ao RM</option>
              </select>
            </label>
            <button
              className="btn btn-outline-secondary"
              onClick={() => {
                setSelecting(!selecting);
                setSelected([]);
              }}
            >
              {selecting ? "Encerrar seleção" : "Selecionar pessoas"}
            </button>
          </section>
          {(tab === "acompanhamento" || tab === "pendencias") && (
            <section className="op-step-actions" aria-label="Processar etapas">
              <div>
                <strong>
                  {selecting
                    ? `${selected.length} pessoas selecionadas nesta página`
                    : "Retomar pendentes da execução inteira"}
                </strong>
                <p>
                  Filtros da lista não alteram o escopo de “execução inteira”.
                  Para um conjunto específico, selecione as pessoas.
                </p>
              </div>
              <div className="op-actions">
                <button
                  className="btn btn-outline-primary"
                  disabled={commandDisabled}
                  onClick={() => process("VARIAVEIS")}
                >
                  Processar Variáveis
                </button>
                <button
                  className="btn btn-outline-primary"
                  disabled={commandDisabled}
                  onClick={() => process("VALORES")}
                >
                  Calcular Valores
                </button>
                {exec && (
                  <Link
                    className="btn btn-link"
                    to={`/gestao-km?filialId=${exec.filial.filial_id}&execucaoId=${id}&retorno=${encodeURIComponent(`/processamento/${id}?${params}`)}`}
                  >
                    Gestão de KM
                  </Link>
                )}
              </div>
              <details>
                <summary>Recálculo de etapas já concluídas</summary>
                <label className="op-check">
                  <input
                    type="checkbox"
                    checked={recalculate}
                    onChange={(e) => setRecalculate(e.target.checked)}
                  />
                  <span>
                    Incluir etapas já concluídas no recálculo. Ajustes manuais e envios anteriores serão preservados no histórico.
                  </span>
                </label>
              </details>
            </section>
          )}
          <div
            className={
              tab === "resultados" || tab === "envios" || tab === "historico"
                ? "op-conference-layout"
                : ""
            }
          >
            <div>
              <div className="op-scroll">
                <table className="op-table op-people">
                  <caption className="visually-hidden">
                    Funcionários e resultados da execução
                  </caption>
                  <thead>
                    <tr>
                      <th>
                        {selecting && (
                          <input type="checkbox" className="me-2" aria-label="Selecionar todas as pessoas desta página"
                            checked={Boolean(query.data?.bases.length) && query.data!.bases.every(b => selected.includes(b.execucao_funcionario_base_id))}
                            onChange={e => setSelected(e.target.checked ? (query.data?.bases.map(b => b.execucao_funcionario_base_id) ?? []) : [])} />
                        )}
                        Pessoa
                      </th>
                      <th>Situação e resultados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data?.bases.map((b) => (
                      <tr key={b.execucao_funcionario_base_id}>
                        <th scope="row">
                          <div className="op-branch-name">
                            {selecting && (
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${b.nome_funcionario}, ${b.funcionario_id_rm}`}
                                checked={selected.includes(
                                  b.execucao_funcionario_base_id,
                                )}
                                onChange={(e) =>
                                  setSelected((prev) =>
                                    e.target.checked
                                      ? [
                                          ...prev,
                                          b.execucao_funcionario_base_id,
                                        ]
                                      : prev.filter(
                                          (x) =>
                                            x !==
                                            b.execucao_funcionario_base_id,
                                        ),
                                  )
                                }
                              />
                            )}
                            <span>{b.nome_funcionario}</span>
                          </div>
                          <small>
                            {b.funcionario_id_rm} · {b.cargo}
                          </small>
                          <small>KM: {b.km ?? "não informado"}</small>
                        </th>
                        <td>
                          <span
                            className={`op-status op-${b.status?.startsWith("ERRO") ? "danger" : "neutral"}`}
                          >
                            {statusLabel(b.status)}
                          </span>
                          {b.execucao_funcionario.map((r) => (
                            <button
                              key={r.execucao_funcionario_id}
                              className="op-result-link"
                              aria-pressed={
                                resultId === r.execucao_funcionario_id
                              }
                              onClick={() =>
                                setContext(
                                  {
                                    aba:
                                      tab === "envios"
                                        ? "envios"
                                        : tab === "historico"
                                          ? "historico"
                                          : "resultados",
                                    resultado: String(
                                      r.execucao_funcionario_id,
                                    ),
                                  },
                                  false,
                                )
                              }
                            >
                              <strong>{r.formula.nome}</strong>
                              <span>
                                {money(r.valor_final)} · v{r.revisao} ·{" "}
                                {r.status === "ENVIADO_RM" &&
                                r.enviado_revisao === r.revisao
                                  ? "Enviado"
                                  : "Ver resultado"}
                                {r.ajuste_manual ? " · ajustado" : ""}
                              </span>
                            </button>
                          ))}
                          {!b.execucao_funcionario.length && (
                            <small>Resultados ainda não disponíveis</small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {query.data && !query.data.bases.length && (
                <div className="op-empty">
                  Nenhuma pessoa neste recorte. Ajuste os filtros.
                </div>
              )}
              <div className="op-pagination">
                <span>
                  {query.data?.total ?? "—"} pessoas no recorte · página {page}{" "}
                  de {Math.max(1, Math.ceil((query.data?.total ?? 0) / 25))}
                </span>
                <button
                  className="btn btn-outline-secondary"
                  disabled={page <= 1}
                  onClick={() =>
                    setContext({ pagina: String(page - 1), resultado: "" })
                  }
                >
                  Anterior
                </button>
                <button
                  className="btn btn-outline-secondary"
                  disabled={page * 25 >= (query.data?.total ?? 0)}
                  onClick={() =>
                    setContext({ pagina: String(page + 1), resultado: "" })
                  }
                >
                  Próxima
                </button>
              </div>
            </div>
            {(tab === "resultados" ||
              tab === "envios" ||
              tab === "historico") &&
              (resultId ? (
                <ResultPanel
                  execucaoId={id}
                  resultId={resultId}
                  onChanged={refresh}
                />
              ) : (
                <div className="op-empty">
                  <h2>Selecione um resultado</h2>
                  <p>
                    Veja valor, regra, memória de cálculo, ajustes e confirmação
                    do RM no mesmo contexto.
                  </p>
                </div>
              ))}
          </div>
          <p className="op-muted">
            Última consulta: {dateTime(query.at)} · atualização automática a
            cada 20 segundos. A ordem da lista permanece estável.
          </p>
        </>
      )}
    </div>
  );
}
