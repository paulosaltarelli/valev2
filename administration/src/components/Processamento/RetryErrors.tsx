import { useCallback, useState } from "react";
import { Modal } from "../../shared/components/VeModal";
import { OperacaoApi, type BaseRow } from "../../utils/api/operacaoApi";
import { QueryNotice, etapaLabel, useOperationAction, useOperationQuery } from "./OperationCommon";

import { pendingRequest, type PendingStage } from "./pending-actions";

export function RetryErrors({ id, periodoId, executionIds, competencia, disabled, onDone, onNotice }: {
  id?: number; periodoId?: number; executionIds?: number[]; competencia?: string; disabled: boolean; onDone: () => void; onNotice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useCallback(() => periodoId ? OperacaoApi.periodPendingScope(periodoId) : OperacaoApi.retryScope(id!), [id, periodoId]);
  const query = useOperationQuery(fetcher, 20000);
  const action = useOperationAction(onNotice, () => { setOpen(false); query.refresh(); onDone(); });
  const scopeKey = (id ? [id] : executionIds ?? []).join(",");
  const sendFetcher = useCallback(() => !open ? Promise.resolve(null) : scopeKey
    ? OperacaoApi.sendScope(scopeKey.split(",").map(Number))
    : Promise.resolve({ eligible: 0, excluded: {} as Record<string, number> }), [open, scopeKey]);
  const send = useOperationQuery(sendFetcher, 0);
  const count = query.data ? query.data.VARIAVEIS.elegiveis + query.data.VALORES.elegiveis : null;
  const run = (stage: PendingStage) => void action.run(pendingRequest(stage, scopeKey ? scopeKey.split(",").map(Number) : [], periodoId));
  return <>
    <button type="button" className="btn btn-outline-primary btn-sm" disabled={disabled || action.busy}
      onClick={() => { setOpen(true); query.refresh(); }}>Processar pendências</button>
    <Modal show={open} onHide={() => !action.busy && setOpen(false)} centered size="lg" className="op-modal" aria-labelledby="op-retry-title">
      <Modal.Header closeButton><Modal.Title id="op-retry-title">Processar pendências</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="op-muted">{periodoId ? `Todas as filiais · ${competencia} · concluídos preservados.` : "Erros e etapas não executadas · concluídos preservados."}</p>
        <QueryNotice {...query} />
        <div className="op-retry-choices op-retry-three">
          {(["VARIAVEIS", "VALORES"] as const).map(stage => <div key={stage}>
            <button type="button" className="btn btn-outline-primary" disabled={disabled || action.busy || query.loading || Boolean(query.error) || !query.data?.[stage].elegiveis}
              onClick={() => run(stage)}>{stage === "VARIAVEIS" ? "Processar variáveis" : "Calcular fórmulas"}<strong>{query.data?.[stage].elegiveis ?? "—"} funcionários</strong>{periodoId && <small>{query.data?.[stage].filiais ?? "—"} filiais</small>}</button>
            {!!query.data?.[stage].bloqueados && <small>{query.data[stage].bloqueados} indisponíveis · confira a fila</small>}
          </div>)}
          <div>
            <button type="button" className="btn btn-outline-primary" disabled={disabled || action.busy || send.loading || Boolean(send.error) || !send.data?.eligible}
              onClick={() => run("ENVIAR_RM")}>Enviar ao RM<strong>{send.data?.eligible ?? "—"} funcionários aptos</strong><small>Confirmados preservados</small></button>
            {send.loading && <small role="status">Consultando envio…</small>}
            {!!send.data?.excluded["Aguardando confirmação do RM"] && <small>{send.data.excluded["Aguardando confirmação do RM"]} aguardam confirmação do RM</small>}
            {send.error && <small role="alert">Não foi possível consultar o envio. <button type="button" className="btn btn-link btn-sm" onClick={send.refresh}>Tentar novamente</button></small>}
          </div>
        </div>
        {count === 0 && send.data?.eligible === 0 && !query.loading && !send.loading && <p role="status" className="op-muted">Nenhuma pendência disponível para processamento.</p>}
      </Modal.Body>
    </Modal>
  </>;
}

export function EmployeeFailureDetails({ id, person }: { id: number; person: BaseRow }) {
  const fetcher = useCallback(() => OperacaoApi.employeeFailures(id, person.execucao_funcionario_base_id), [id, person.execucao_funcionario_base_id]);
  const query = useOperationQuery(fetcher, 0);
  return <>
    <p><strong>{person.nome_funcionario}</strong> · {person.funcionario_id_rm}</p>
    <QueryNotice {...query} />
    {query.data?.map(failure => <section key={failure.etapa} className="op-notice op-error" aria-label={`Falha em ${etapaLabel(failure.etapa)}`}>
      <strong>{etapaLabel(failure.etapa)}</strong>
      {failure.mensagens.map((message, index) => <p className="op-failure-message" key={index}>{message}</p>)}
    </section>)}
    {query.data?.length === 0 && <p>Nenhuma falha atual. Atualize a execução para conferir a situação.</p>}
    {query.error && <button type="button" className="btn btn-outline-primary" onClick={query.refresh}>Tentar carregar novamente</button>}
  </>;
}
