import { ReportFilters } from "../../shared/components/ReportFilters";
import { VisualSummary } from "../../shared/components/VisualSummary";
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeading } from '../../shared/components/PageHeading';
import { AnalysisNav } from '../../shared/components/AnalysisNav';
import { dateTime, QueryNotice, StatusPill, useOperationQuery } from '../../components/Processamento/OperationCommon';
import { OperationalReportsApi } from '../../utils/api/operationalReportsApi';
import { exportReport, ReportPagination } from '../../components/Relatorios/ReportTools';

export function FechamentoPage() {
  const [params,setParams]=useSearchParams();
  const period=params.get('periodo') ?? '';
  const search=params.get('busca') ?? '';
  const situation=params.get('situacao') ?? '';
  const [showDetails, setShowDetails] = useState(false);
  const [page,setPage]=useState(1);
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  const fetcher=useCallback(()=>OperationalReportsApi.closing(period),[period]);
  const query=useOperationQuery(fetcher,0);
  const change=(key:string,value:string)=>{const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);setParams(next,{replace:true});setPage(1);setExportError('');};
  const rows=(query.data?.rows ?? []).filter(r=>r.filial.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) && (!situation || r.situacao===situation));
  const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/25)));
  const competencia=query.data?.periodos.find(p=>p.periodo_id===query.data?.periodo)?.competencia ?? '';
  const returnTo=`/fechamento?${params}`;
  const href=(id:number,tab:string)=>`/processamento/${id}?${new URLSearchParams({aba:tab,retorno:returnTo})}`;
  async function download() {
    setExporting(true);setExportError('');
    try { await exportReport(`fechamento-${competencia.replace('/','-')}`,
      ['Filial','Situação','Funcionários na execução','Cálculo completo','Cálculo parcial','Sem cálculo','Com erro','Aguardando envio','Enviados ao RM'],
      rows.map(r=>[r.filial,r.situacao,r.counts?.total ?? null,r.counts?.completos ?? null,r.counts?.parciais ?? null,r.counts?.semCalculo ?? null,r.counts?.comErro ?? null,r.counts?.aguardandoEnvio ?? null,r.counts?.enviados ?? null]),
      {Competência:competencia,Busca:search||'Todas as filiais',Situação:situation||'Todas',Atualização:dateTime(query.data?.updatedAt),
        Critério:'Uma execução atual por filial. Erros e envio são recortes dos funcionários; não somar todas as colunas.'});
    } catch {setExportError('Não foi possível gerar o Excel. Tente novamente.');} finally {setExporting(false);}
  }
  return <div className="op-page">
    <PageHeading area="Análise" title="Fechamento por filial" description="Veja o que falta concluir em cada filial nesta competência."
      actions={<button className="btn btn-primary" disabled={!rows.length || query.loading || !!query.error || exporting} onClick={()=>void download()}>{exporting?'Gerando Excel…':'Exportar Excel'}</button>} />
    <AnalysisNav />
    <ReportFilters summary={competencia + " · " + (search ? `Busca: ${search}` : "Todas as filiais") + (situation ? ` · ${situation}` : "")}>
      <section className="op-context mb-3" aria-label="Filtros do fechamento">
      <label>Competência<select value={period || query.data?.periodo || ''} onChange={e=>change('periodo',e.target.value)} disabled={!query.data?.periodos.length}>
        {!query.data?.periodos.length && <option value="">Nenhuma disponível</option>}
        {query.data?.periodos.map(p=><option key={p.periodo_id} value={p.periodo_id}>{p.competencia}{p.ativo?' · Ativa':''}</option>)}
      </select></label>
      <label>Buscar filial<input type="search" value={search} onChange={e=>change('busca',e.target.value)} placeholder="Nome da filial" /></label>
      <label>Situação<select value={situation} onChange={e=>change('situacao',e.target.value)}><option value="">Todas</option>
        {[...new Set(query.data?.rows.map(r=>r.situacao))].sort().map(s=><option key={s}>{s}</option>)}
      </select></label>
      <button className="btn btn-outline-primary" disabled={query.loading} onClick={query.refresh}>Atualizar</button>
    </section>
      </ReportFilters>
    <QueryNotice {...query} />
    {exportError && <p className="op-notice op-error" role="alert">{exportError}</p>}
    {query.data && <>
      <VisualSummary items={[
{label:'Filiais no recorte',value:rows.length,icon:'tabler:building'},
{label:'Filiais com erro',value:rows.filter(r=>(r.counts?.comErro ?? 0)>0).length,icon:'tabler:alert-circle',tone:'danger'},
{label:'Filiais aguardando envio',value:rows.filter(r=>(r.counts?.aguardandoEnvio ?? 0)>0).length,icon:'tabler:clock',tone:'info'}
]} />
      <small className="op-muted">Atualizado em {dateTime(query.data.updatedAt)}</small>
      <details className="mb-3"><summary>Como ler as contagens</summary><p className="op-muted mt-2">“—” indica ausência de execução. Completo, parcial e sem cálculo dividem os funcionários da execução. “Com erro” pode incluir pessoas com resultados parciais ou falha de envio. As colunas de envio são um recorte dos cálculos completos. Filiais sem execução não têm quantidade de funcionários conhecida.</p></details>
      <label className="ve-check-filter mb-3"><input type="checkbox" checked={showDetails} onChange={e=>setShowDetails(e.target.checked)}/> Exibir todas as contagens</label>
      {rows.length ? <div className="op-table-wrap"><div className="op-scroll" tabIndex={0} role="region" aria-label="Fechamento das filiais">
        <table className="op-table ve-report-table"><thead><tr>
          {['Filial','Situação','Funcionários',...(showDetails ? ['Cálculo completo','Cálculo parcial','Sem cálculo'] : []),'Com erro','Aguardando envio',...(showDetails ? ['Enviados ao RM'] : [])].map(h=><th scope="col" key={h}>{h}</th>)}
        </tr></thead><tbody>{rows.slice((currentPage-1)*25,currentPage*25).map(r=><tr key={r.filialId}>
          <th scope="row">{r.execucaoId?<Link to={href(r.execucaoId,'acompanhamento')}>{r.filial}</Link>:<Link to={`/processamento?periodo=${query.data?.periodo}`}>{r.filial}</Link>}{!r.ativa && <small>Inativa atualmente</small>}</th>
          <td><StatusPill label={r.situacao === 'Cálculo concluído' ? 'Pronto para envio' : r.situacao}/></td><td>{r.counts?.total ?? '—'}</td>{showDetails && <><td>{r.counts?.completos ?? '—'}</td><td>{r.counts?.parciais ?? '—'}</td><td>{r.counts?.semCalculo ?? '—'}</td></>}
          <td>{r.execucaoId && r.counts?.comErro ? <Link className="op-danger" to={href(r.execucaoId,'pendencias')}>{r.counts.comErro} · Ver</Link>:r.counts?.comErro ?? '—'}</td>
          <td>{r.execucaoId && r.counts?.aguardandoEnvio ? <Link to={href(r.execucaoId,'envios')}>{r.counts.aguardandoEnvio} · Ver</Link>:r.counts?.aguardandoEnvio ?? '—'}</td>
          {showDetails && <td>{r.counts?.enviados ?? '—'}</td>}
        </tr>)}</tbody></table>
      </div></div>:<p>Nenhuma filial encontrada com estes filtros.</p>}
      <ReportPagination page={currentPage} total={rows.length} onPage={setPage}/>
    </>}
  </div>;
}
