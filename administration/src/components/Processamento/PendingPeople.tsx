import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Modal } from "../../shared/components/VeModal";
import { OperacaoApi, type BaseRow, type OperationRow } from "../../utils/api/operacaoApi";
import { QueryNotice, statusLabel, useOperationQuery } from "./OperationCommon";
import { EmployeeFailureDetails } from "./RetryErrors";

function PendingBranch({ row, returnTo }: { row: OperationRow; returnTo: string }) {
  const [page, setPage] = useState(1);
  const [person, setPerson] = useState<BaseRow | null>(null);
  const fetcher = useCallback(() => OperacaoApi.detail(row.id, page, "", "pendencias"), [row.id, page]);
  const query = useOperationQuery(fetcher, 0);
  const href = (b: BaseRow) => `/processamento/${row.id}?${new URLSearchParams({filtro: "pendencias", busca: b.funcionario_id_rm, retorno: returnTo})}`;
  return <>
    <QueryNotice {...query} />
    {person ? <>
      <button type="button" className="btn btn-link px-0 mb-2" onClick={() => setPerson(null)}>← Voltar às pendências</button>
      <EmployeeFailureDetails id={row.id} person={person}/>
      <Link className="btn btn-primary" to={href(person)}>Abrir funcionário para corrigir</Link>
    </> : <>
      {query.data?.bases.map(b => <section key={b.execucao_funcionario_base_id} className="border-bottom py-3">
        <strong>{b.nome_funcionario}</strong><small className="d-block op-muted">{b.funcionario_id_rm} · {statusLabel(b.status) || "Aguardando cálculo"}</small>
        <div className="d-flex flex-wrap gap-2 mt-2">
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setPerson(b)}>Ver erro / detalhe</button>
          <Link className="btn btn-primary btn-sm" to={href(b)}>Abrir funcionário</Link>
        </div>
      </section>)}
      {query.data?.total === 0 && <p>Nenhuma pendência atual nesta filial.</p>}
      {query.data && query.data.total > query.data.pageSize && <div className="d-flex gap-2 align-items-center mt-3">
        <button className="btn btn-outline-secondary btn-sm" disabled={page === 1 || query.loading} onClick={() => setPage(p => p-1)}>Anterior</button>
        <span>Página {page}</span>
        <button className="btn btn-outline-secondary btn-sm" disabled={page*query.data.pageSize >= query.data.total || query.loading} onClick={() => setPage(p => p+1)}>Próxima</button>
      </div>}
    </>}
  </>;
}

export function PendingPeople({ rows, count, returnTo }: { rows: OperationRow[]; count: number; returnTo: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const branches = rows.filter(r => r.errors > 0);
  const row = branches.find(r => r.id === selected) ?? branches[0];
  return <>
    <button type="button" className="btn btn-link p-0" aria-haspopup="dialog" onClick={() => setOpen(true)}>Com pendências <strong>{count}</strong> <span aria-hidden="true">↗</span></button>
    <Modal show={open} onHide={() => setOpen(false)} centered className="op-modal" aria-labelledby="pending-people-title">
      <Modal.Header closeButton><Modal.Title id="pending-people-title">Pendências do cálculo</Modal.Title></Modal.Header>
      <Modal.Body>
        {branches.length > 1 && <label className="d-block mb-2">Filial<select className="form-select mt-1" value={row?.id ?? ""} onChange={e => setSelected(Number(e.target.value))}>{branches.map(r => <option key={r.id} value={r.id}>{r.filial} · {r.errors}</option>)}</select></label>}
        {branches.length === 1 && <p className="op-muted">{row.filial}</p>}
        {open && row && <PendingBranch key={row.id} row={row} returnTo={returnTo}/>}
        {!row && <p>Nenhuma pendência atual. Atualize a tela.</p>}
      </Modal.Body>
    </Modal>
  </>;
}
