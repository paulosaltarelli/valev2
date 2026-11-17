import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Modal } from '../../shared/components/VeModal';
import { OperationalReportsApi } from '../../utils/api/operationalReportsApi';
import { exportReport } from '../Relatorios/ReportTools';
import { dateTime, QueryNotice, useOperationQuery } from './OperationCommon';
export function OperationReportTools({periodo, visibleExecutionIds}:{periodo:string; visibleExecutionIds:number[]}) {
  const [params,setParams] = useSearchParams();
  const [open,setOpen] = useState(params.get('detalhes') === '1');
  const [busy,setBusy] = useState(false),[error,setError] = useState('');
  const fetcher=useCallback(()=>OperationalReportsApi.closing(periodo),[periodo]);
  const query=useOperationQuery(fetcher,0);
  const focus=params.get('foco') ?? '';
  const situation=params.get('situacao') ?? '';
  const needle=(params.get('busca') ?? '').trim().toLocaleLowerCase('pt-BR');
  const branch=params.get('filial');
  const rows=(query.data?.rows ?? []).filter(r=>(!branch || r.filialId===Number(branch)) && r.filial.toLocaleLowerCase('pt-BR').includes(needle))
    .filter(r=>focus==='erro' || situation==='acao' ? !!r.counts?.comErro : focus==='envio' || situation==='envio' ? !!r.counts?.aguardandoEnvio : focus==='enviados' || situation==='enviado' ? !!r.counts?.total && r.counts.enviados===r.counts.total : focus==='semexecucao' ? !r.execucaoId : !situation || situation==='todas' || visibleExecutionIds.includes(r.execucaoId ?? -1) || r.situacao===situation);
  const competencia=query.data?.periodos.find(p=>p.periodo_id===query.data?.periodo)?.competencia ?? '';
  const returnTo=`/processamento?${params}`;
  const close=()=>{setOpen(false);const next=new URLSearchParams(params);next.delete('detalhes');setParams(next,{replace:true});};
  async function download() {
    setBusy(true);setError('');
    try {await exportReport(`acompanhamento-${competencia.replace('/','-')}`,
      ['Filial','Situação','Funcionários na execução','Cálculo completo','Cálculo parcial','Sem cálculo','Com erro','Aguardando envio','Enviados ao RM'],
      rows.map(r=>[r.filial,r.situacao==='Cálculo concluído'?'Pronto para envio':r.situacao,r.counts?.total??null,r.counts?.completos??null,r.counts?.parciais??null,r.counts?.semCalculo??null,r.counts?.comErro??null,r.counts?.aguardandoEnvio??null,r.counts?.enviados??null]),
      {Competência:competencia,Atualização:dateTime(query.data?.updatedAt),Critério:'Execução atual por filial; fórmulas ativas e regras de transporte. Erros e envios são recortes, não somar todas as colunas.'});
    } catch {setError('Não foi possível gerar o Excel. Tente novamente.');} finally {setBusy(false);}
  }
  return <>
    <div className="op-toolbar mb-3" aria-label="Consultas da competência">
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-outline-primary btn-sm" onClick={()=>{query.refresh();setOpen(true);}}>Contagens e exportação</button>
        <Link className="btn btn-outline-primary btn-sm" to={`/falhas-por-causa?periodo=${periodo}`}>Ver erros por causa</Link>
        <button className="btn btn-outline-secondary btn-sm" onClick={()=>{const next=new URLSearchParams(params);next.set('foco','semexecucao');next.delete('situacao');query.refresh();setParams(next,{replace:true});setOpen(true);}}>Filiais sem execução</button>
      </div>
    </div>
    <Modal show={open} onHide={close} centered size="xl" className="op-modal" aria-labelledby="op-counts-title">
      <Modal.Header closeButton><Modal.Title id="op-counts-title">Acompanhamento · {competencia}</Modal.Title></Modal.Header>
      <Modal.Body>
        <div className="op-toolbar mb-3"><label>Mostrar<select value={focus} onChange={e=>{const next=new URLSearchParams(params);next.delete('situacao');e.target.value?next.set('foco',e.target.value):next.delete('foco');setParams(next,{replace:true});}}><option value="">Todas as filiais</option><option value="erro">Com erro</option><option value="envio">Aguardando envio</option><option value="enviados">Enviadas ao RM</option><option value="semexecucao">Sem execução</option></select></label>
          <button className="btn btn-primary" disabled={busy||query.loading||!!query.error||!rows.length} onClick={()=>void download()}>{busy?'Gerando Excel…':'Exportar Excel'}</button>
        </div>
        <QueryNotice {...query}/>{error&&<p role="alert" className="op-error">{error}</p>}
        <div className="op-scroll" tabIndex={0} role="region" aria-label="Contagens por filial"><table className="op-table" style={{minWidth:960}}><thead><tr>{['Filial','Funcionários','Completos','Parciais','Sem cálculo','Erros','A enviar','Enviados'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.filialId}><th scope="row"><Link to={r.execucaoId?`/processamento/${r.execucaoId}?${new URLSearchParams({retorno:returnTo})}`:`/processamento?periodo=${periodo}&filial=${r.filialId}&acao=nova`}>{r.filial}</Link>{!r.execucaoId&&<small>Sem execução</small>}</th>{(['total','completos','parciais','semCalculo','comErro','aguardandoEnvio','enviados'] as const).map(k=><td key={k}>{k==='comErro'&&r.counts?.comErro&&r.execucaoId?<Link className="op-danger" to={`/processamento/${r.execucaoId}?${new URLSearchParams({filtro:'erros',retorno:returnTo})}`}>{r.counts.comErro} ↗</Link>:r.counts?.[k]??'—'}</td>)}</tr>)}</tbody></table></div>
        {!query.loading&&!query.error&&!rows.length&&<p>Nenhuma filial neste recorte.</p>}
      </Modal.Body>
    </Modal>
  </>;
}
