import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Modal } from "../../shared/components/VeModal";
import {
  OperacaoApi,
  type BaseRow,
  type Etapa,
  type ResultDetail,
} from "../../utils/api/operacaoApi";
import api from "../../utils/api/Api";
import { EventGroups } from "./EventGroups";
import { RetryErrors, EmployeeFailureDetails } from "./RetryErrors";
import { EmployeeResultsTable } from "./EmployeeResultsTable";
import { ExecucaoApi } from "../../utils/api/execucaoApi";
import {
  dateTime, sqlLocalDateTime,
  errorMessage,
  etapaLabel,
  resultValue,
  SendScope,
  useOperationAction,
  QueryNotice,
  StageCount,
  useOperationQuery,
} from "./OperationCommon";

type MemoryEntry = ResultDetail["memoria_calculo"][number];
type VariableRow = {
  key: string;
  entry: MemoryEntry;
  formulas?: string[];
  sources?: MemoryEntry[];
};

function CalculationMemory({ result: r }: { result: ResultDetail }) {
  const f = r.formulaUtilizada ?? r.formula;
  return (
    <>
      <p>
        Regra {r.codigo_regra_rm || "legado"} · Tipo {f?.tipo || "—"} ·
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
      <VariableTable
        rows={r.memoria_calculo.map((entry) => ({ key: String(entry.memoria_id), entry }))}
      />
    </>
  );
}

function VariableTable({ rows }: { rows: VariableRow[] }) {
  if (!rows.length) {
    return <p className="op-notice">Não há variáveis armazenadas neste recorte.</p>;
  }
  return (
    <div className="op-scroll">
      <table className="op-table">
        <caption className="visually-hidden">
          Variáveis, valores e origens
        </caption>
        <thead>
          <tr>
            <th>Variável</th>
            <th>Valor</th>
            <th>Origem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, entry: m, formulas, sources = [m] }) => (
            <tr key={key}>
              <th scope="row">
                {m.variavel_nome}
                <small>{m.variavel_codigo}</small>
                {formulas?.length ? <small>{formulas.join(" · ")}</small> : null}
              </th>
              <td>
                {Number(m.valor).toLocaleString("pt-BR", {
                  maximumFractionDigits: 4,
                })}
              </td>
              <td>
                {[...new Set(sources.map((source) => source.origem))].join(" · ")}
                <details>
                  <summary>Ver origem e data</summary>
                  {sources.map((source) => (
                    <div key={source.memoria_id}>
                      <p>{source.detalhe || "Sem detalhe adicional"}</p>
                      <small>{sqlLocalDateTime(source.data_registro)}</small>
                    </div>
                  ))}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeVariables({ execucaoId, person }: { execucaoId: number; person: BaseRow }) {
  const fetcher = useCallback(async () => {
    const { results, error } = await OperacaoApi.employeeVariables(execucaoId, person.execucao_funcionario_base_id);
    const grouped = new Map<string, Map<string, Required<VariableRow>>>();
    for (const result of results) {
      const formula = [result.codigo_regra_rm, result.formula.nome].filter(Boolean).join(" · ");
      for (const entry of result.memoria_calculo) {
        const code = entry.variavel_codigo;
        const value = JSON.stringify([result.codigo_regra_rm ?? "", String(entry.valor)]);
        const variants = grouped.get(code) ?? new Map<string, Required<VariableRow>>();
        grouped.set(code, variants);
        const row = variants.get(value) ?? { key: JSON.stringify([code, value]), entry, formulas: [], sources: [] };
        variants.set(value, row);
        if (!row.formulas.includes(formula)) row.formulas.push(formula);
        if (!row.sources.some((source) => source.origem === entry.origem && source.detalhe === entry.detalhe)) {
          row.sources.push(entry);
        }
      }
    }
    const rows = Array.from(grouped.values()).flatMap((variants) =>
      Array.from(variants.values(), (row) => ({
        ...row,
        formulas: row.formulas,
      })),
    ).sort((a, b) => a.entry.variavel_nome.localeCompare(b.entry.variavel_nome, "pt-BR"));
    return { rows, error };
  }, [execucaoId, person.execucao_funcionario_base_id]);
  const query = useOperationQuery(fetcher, 0);
  return (
    <>
      <p><strong>{person.nome_funcionario}</strong> · {person.funcionario_id_rm}</p>
      <QueryNotice {...query} />
      {query.data?.error && (
        <div className="op-notice op-error" role="alert">
          <strong>Falha na consulta de variáveis</strong>
          <div>{query.data.error}</div>
        </div>
      )}
      {query.error && (
        <button type="button" className="btn btn-outline-primary" onClick={query.refresh}>
          Tentar novamente
        </button>
      )}
      {query.data?.rows.some(({ entry }) => entry.variavel_codigo.toUpperCase() === "REGRA_PGTO" && Number(entry.valor) === 3) &&
        query.data.rows.some(({ entry }) => entry.variavel_codigo.toUpperCase() === "KM_FUNC" && Number(entry.valor) === 0) && (
          <p className="op-notice op-warning">KM zerado. A regra de pagamento usa a quilometragem. Confira o cadastro no RM antes de enviar.</p>
        )}
      <EventGroups executionId={execucaoId} baseId={person.execucao_funcionario_base_id} results={person.execucao_funcionario} autoLoad compact />
      {query.data && <VariableTable rows={query.data.rows} />}
    </>
  );
}

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
  const r = query.data;
  const f = r?.formulaUtilizada ?? r?.formula;
  const amount = (value: unknown) => resultValue(value, f?.tipo);
  const valid =
    r &&
    ["PROCESSADO", "ENVIADO_RM"].includes(r.status) &&
    ["RESULTADOS_PROCESSADOS", "ENVIADO_RM", "ERRO_RM"].includes(
      r.execucao_funcionario_base.status,
    );
  return (
    <section
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
            <EventGroups executionId={execucaoId} baseId={r.execucao_funcionario_base_id}
              results={[r]} autoLoad compact />
            {r.formulaUtilizada?.versao != null && <small>Fórmula v{r.formulaUtilizada.versao}</small>}
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
              Calculado<strong>{amount(r.valor_calculado)}</strong>
            </div>
            <div>
              Resultado final<strong>{amount(r.valor_final)}</strong>
              <small>
                {r.ajuste_manual ? "Com ajuste manual" : "Sem ajuste manual"}
              </small>
            </div>
          </div>
          <details className="op-result-memory">
            <summary>Memória de cálculo · {r.memoria_calculo.length} variáveis</summary>
            <CalculationMemory result={r} />
          </details>
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
                Calculado: {amount(r.valor_calculado)} · atual:{" "}
                {amount(r.valor_final)}. O histórico preserva o valor anterior e a nova versão.
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
                  ENVIO_RM_INICIADO: "Tentativa de criação no RM",
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
                  {String(h.detalhe.motivo ?? "")} · {amount(h.detalhe.anterior)}{" "}
                  → {amount(h.detalhe.novo)}
                </p>
              )}
              {h.tipo === "ENVIO_RM" && Boolean(h.detalhe.record) && (
                <p>
                  Evento{" "}
                  {String(
                    (h.detalhe.record as Record<string, unknown>).CODEVENTO,
                  )}{" "}
                  · {amount((h.detalhe.record as Record<string, unknown>).VALOR)}
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
                    {sqlLocalDateTime(a.data_ajuste)} · {a.usuario.nome} ·{" "}
                    {amount(a.valor_anterior)} → {amount(a.valor_novo)}
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
  const [failurePerson, setFailurePerson] = useState<BaseRow | null>(null);
  useEffect(() => setFailurePerson(null), [id]);
  const [showQueue, setShowQueue] = useState(() => params.get("fila") === "1");
  const page = Math.max(1, Number(params.get("pagina")) || 1);
  const search = params.get("busca") ?? "";
  const filter = params.get("filtro") ?? "todos";
  const resultId = Number(params.get("resultado")) || 0;
  const [memoryPerson, setMemoryPerson] = useState<BaseRow | null>(null);
  useEffect(() => setMemoryPerson(null), [id]);
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
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
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
  const reportReturn = ["/falhas-por-causa", "/fechamento", "/variacao-competencias", "/extrato-processamento"].some(path => rawReturn === path || rawReturn?.startsWith(path + "?"));
  const returnTo = rawReturn && (rawReturn === "/dashboard" || rawReturn.startsWith("/processamento?") || reportReturn)
    ? rawReturn
    : `/processamento${exec ? `?periodo=${exec.periodo.periodo_id}` : ""}`;
  const command = useOperationAction(setNotice, () => {
    setSelected([]);
    setSelecting(false);
    refresh();
  });
  const process = (etapa: Etapa, baseIds?: number[]) =>
    void command.run({
      etapa,
      execucaoIds: [id],
      ...(baseIds ? { baseIds } : {}),
      recalcular: etapa !== "ENVIAR_RM",
    });
  const refresh = () => {
    query.refresh();
    summary.refresh();
    errors.refresh();
  };
  const commandDisabled =
    command.busy ||
    query.loading ||
    Boolean(query.error) ||
    Boolean(summary.error);
  return (
    <div className="op-page op-detail-page">
      <Link className="op-back" to={returnTo}>
        ← {rawReturn === "/dashboard" ? "Voltar à Visão geral" : reportReturn ? "Voltar ao relatório" : "Voltar à operação"}
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
      {Boolean(query.data?.sendFailures?.length) && (
        <div className="op-notice op-error" role="alert">
          <strong>Falha no envio ao RM · {query.data!.sendFailures!.length} funcionário(s)</strong>
          {query.data!.sendFailures!.slice(0,3).map(failure=><p key={failure.baseId}>
            <strong>{failure.nome} · {failure.chapa}</strong><br/>{failure.message}
          </p>)}
          <button type="button" className="btn btn-link btn-sm" onClick={()=>setShowQueue(true)}>Ver todas as falhas e o histórico</button>
        </div>
      )}
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
            label="Variáveis calculadas"
            value={row.progresso.variaveisCalculadas}
            total={row.progresso.variaveisPrevistas}
            unit="variáveis"
            detail={`${row.variaveis} de ${row.total} funcionários completos`}
          />
          <div className="op-stage"><StageCount label="Fórmulas calculadas" value={row.progresso.formulasCalculadas} total={row.progresso.formulasPrevistas} unit="fórmulas" detail={`${row.valores} de ${row.total} funcionários completos`} /><button type="button" className="btn btn-link btn-sm p-0" onClick={() => { setSearchDraft(""); setContext({ filtro: "formulas_pendentes", busca: "", pagina: "1", resultado: "" }); }}>Ver funcionários pendentes</button></div>
          <StageCount label="Enviados ao RM" finalStage value={row.rm} total={row.total} />
        </div>
      )}
      {summary.error && (
        <div className="op-notice op-error" role="alert">
          O resumo não pôde ser atualizado. Atualize antes de realizar ações.
        </div>
      )}
      {exec && <section className="op-compact-actions" aria-label="Ações da filial">
        <div className="op-compact-actions-main">
          <span className="op-action-scope">Filial inteira</span>
          <button className="btn btn-outline-primary" disabled={commandDisabled} onClick={() => process("VARIAVEIS")}>Processar variáveis</button>
          <button className="btn btn-outline-primary" disabled={commandDisabled} onClick={() => process("VALORES")}>Calcular valores</button>
          {(!selecting || selected.length > 0) ? <SendScope key={`${id}:${selecting ? selected.join(",") : "todas"}`} executionIds={[id]} personIds={selecting ? selected : undefined} disabled={commandDisabled} onSend={() => process("ENVIAR_RM", selecting ? selected : undefined)} /> : <button className="btn btn-primary" disabled>Enviar ao RM</button>}
        </div>
        <div className="op-compact-actions-secondary">
          <RetryErrors key={id} id={id} disabled={commandDisabled} onDone={refresh} onNotice={setNotice} />
          <button type="button" className="btn btn-link btn-sm" onClick={() => setShowQueue(true)}>Fila e falhas{query.data?.queue.length ? ` · ${query.data.queue.length}` : ""}</button>
          <details className="op-action-options"><summary>Mais opções</summary><div>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? "Encerrar seleção" : "Selecionar para envio"}</button>
            <Link className="btn btn-link btn-sm" to={`/gestao-km?filialId=${exec.filial.filial_id}&execucaoId=${id}&retorno=${encodeURIComponent(`/processamento/${id}?${params}`)}`}>Gestão de KM</Link>
          </div></details>
          {selecting && <span className="op-action-scope">Envio: {selected.length} selecionados</span>}
        </div>
      </section>}
      {exec && (
        <Modal show={showQueue} onHide={() => setShowQueue(false)} centered className="op-modal" aria-labelledby="op-queue-title">
          <Modal.Header closeButton><Modal.Title id="op-queue-title">Fila e falhas</Modal.Title></Modal.Header>
          <Modal.Body>
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
                          ? sqlLocalDateTime(q.next_run_at)
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
          <details open={Boolean(query.data?.sendFailures?.length)}>
            <summary>Mensagens de falhas e histórico técnico</summary>
            <QueryNotice {...errors} />
            {errors.data?.length
              ? errors.data.map((e) => (
                  <details className="op-history-item" key={e.id}>
                    <summary>
                      {e.nomeFuncionario ?? e.funcionarioIdRm ?? "Execução"} ·{" "}
                      {e.tipo ? etapaLabel(e.tipo) : e.source} ·{" "}
                      {sqlLocalDateTime(e.createdAt)}
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
          </Modal.Body>
        </Modal>
      )}
      {row && (row.processing > 0 || row.pending > 0) && (
        <div className="op-notice" role="status">
          {row.processing > 0 ? `${row.processing} itens em processamento` : "Aguardando execução da fila"} · {row.pending} etapas agendadas.
        </div>
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
                <option value="formulas_pendentes">Com fórmulas pendentes</option>
                <option value="pendencias">
                  Com pendências ou erros
                </option>
                <option value="resultados">
                  Com valores calculados / envio pendente
                </option>
                <option value="enviados">Enviadas ao RM</option>
              </select>
            </label>

          </section>

          <div>
            <EmployeeResultsTable bases={query.data?.bases ?? []} selecting={selecting} selected={selected}
              onSelected={setSelected} onVariables={setMemoryPerson} onError={setFailurePerson}
              onOpen={result => setContext({ resultado: String(result) }, false)}
              onProcess={process} disabled={commandDisabled} />
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
          <p className="op-muted">
            Atualizado: {dateTime(query.at)}
          </p>
        </>
      )}
      <Modal show={Boolean(failurePerson)} onHide={() => setFailurePerson(null)} centered scrollable className="op-modal" aria-labelledby="op-failure-title">
        <Modal.Header closeButton><Modal.Title id="op-failure-title">Detalhes da falha</Modal.Title></Modal.Header>
        <Modal.Body>{failurePerson && <EmployeeFailureDetails key={failurePerson.execucao_funcionario_base_id} id={id} person={failurePerson} />}</Modal.Body>
      </Modal>
      <Modal
        show={Boolean(memoryPerson || resultId)}
        onHide={() => memoryPerson ? setMemoryPerson(null) : setContext({ resultado: "" }, false)}
        aria-labelledby="op-result-title"
        className={memoryPerson ? "op-detail-modal op-employee-variables" : "op-detail-modal"}
        size="lg"
        centered
        scrollable
      >
        <Modal.Header closeButton closeLabel={memoryPerson ? "Fechar variáveis" : "Fechar resultado"}>
          <Modal.Title id="op-result-title">{memoryPerson ? "Variáveis do funcionário" : "Detalhes do resultado"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {memoryPerson ? (
            <EmployeeVariables key={memoryPerson.execucao_funcionario_base_id} execucaoId={id} person={memoryPerson} />
          ) : resultId > 0 && (
            <ResultPanel
              key={resultId}
              execucaoId={id}
              resultId={resultId}
              onChanged={refresh}
            />
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}
