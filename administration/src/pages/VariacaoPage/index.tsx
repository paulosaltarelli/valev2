import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeading } from '../../shared/components/PageHeading';
import { AnalysisNav } from '../../shared/components/AnalysisNav';
import { dateTime, QueryNotice, StatusPill, useOperationQuery } from '../../components/Processamento/OperationCommon';
import { OperationalReportsApi } from '../../utils/api/operationalReportsApi';
import { exportReport, ReportPagination } from '../../components/Relatorios/ReportTools';

const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const display=(value:string|null,type:string|null)=>value===null?'—':(type==='V'?money:number).format(Number(value));
const numeric=(value:string|null)=>value===null?null:Number(value);

export function VariacaoPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [params,setParams]=useSearchParams();
  const options=useOperationQuery(OperationalReportsApi.options,0);
  const periods=options.data?.periodos ?? [];
  const current=periods.find(p=>p.periodo_id===Number(params.get('periodo'))) ?? periods.find(p=>p.ativo) ?? periods[0];
  const availableFetcher = useCallback(() => current ? OperationalReportsApi.closing(String(current.periodo_id)) : Promise.resolve(null), [current?.periodo_id]);
  const available = useOperationQuery(availableFetcher, 0);
  const branchesWithExecution = new Set((available.data?.periodo === current?.periodo_id ? available.data?.rows : [])?.filter(r => r.execucaoId).map(r => r.filialId));
  const branchOptions = [...(options.data?.filiais ?? [])].sort((a,b) => Number(branchesWithExecution.has(b.filial_id)) - Number(branchesWithExecution.has(a.filial_id)) || Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome));
  const previousOptions=periods.filter(p=>current && p.data_inicio<current.data_inicio);
  const previous=previousOptions.find(p=>p.periodo_id===Number(params.get('anterior'))) ?? previousOptions[0];
  const branch=options.data?.filiais.find(f=>f.filial_id===Number(params.get('filial'))) ?? branchOptions.find(f=>f.ativa && branchesWithExecution.has(f.filial_id)) ?? branchOptions.find(f=>f.ativa) ?? branchOptions[0];
  const currentId=current?.periodo_id,previousId=previous?.periodo_id,branchId=branch?.filial_id;
  const fetcher=useCallback(()=>currentId && previousId && branchId ?
    OperationalReportsApi.variation(currentId,previousId,branchId):Promise.resolve(null),[currentId,previousId,branchId]);
  const query=useOperationQuery(fetcher,0);
  const report=query.data?.periodo===current?.competencia && query.data?.anterior===previous?.competencia && query.data?.filial===branch?.nome ? query.data : null;
  const [page,setPage]=useState(1),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  const search=params.get('busca') ?? '',formula=params.get('formula') ?? '',situation=params.get('situacao') ?? '';
  const change=(key:string,value:string)=>{const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);
    if(['periodo','anterior','filial'].includes(key)){next.delete('formula');next.delete('situacao');}if(key==='periodo')next.delete('anterior');
    setParams(next,{replace:true});setPage(1);setExportError('');};
  const rows=(report?.rows ?? []).filter(r=>(r.nome+' '+r.matricula).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) && (!formula || r.formula===formula) && (!situation || r.situacao===situation));
  const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/25)));
  const returnTo=`/variacao-competencias?${params}`;
  async function download() {
    if(!report)return;setExporting(true);setExportError('');
    try { await exportReport(`variacao-${report.anterior.replace('/','-')}-${report.periodo.replace('/','-')}`,
      ['Funcionário','Matrícula','Fórmula','Unidade',report.anterior,report.periodo,'Diferença','Variação (%)','Situação','Observação'],
      rows.map(r=>[r.nome,r.matricula,r.formula,r.tipo==='V'?'R$':r.tipo==='D'?'Dias':'Número',numeric(r.anterior),numeric(r.atual),numeric(r.diferenca),numeric(r.percentual),r.situacao,r.observacao]),
      {Filial:report.filial,Atual:report.periodo,Anterior:report.anterior,Fórmula:formula||'Todas',Busca:search||'Todos os funcionários',Situação:situation||'Todas',Atualização:dateTime(report.updatedAt),
        Critério:'Valores calculados. Ausências não são zero. Variação só para snapshots comparáveis. Percentual indisponível se a base anterior for zero.'});
    } catch {setExportError('Não foi possível gerar o Excel. Tente novamente.');} finally {setExporting(false);}
  }
  return <div className="op-page">
    <PageHeading area="Análise" title="Variação entre competências" description="Compare os valores calculados de cada funcionário e fórmula entre dois períodos."
      actions={<button className="btn btn-primary" disabled={!rows.length || query.loading || !!query.error || exporting} onClick={()=>void download()}>{exporting?'Gerando Excel…':'Exportar Excel'}</button>}/>
    <AnalysisNav/>
    <section className="op-context mb-3" aria-label="Períodos e filial da comparação">
      <label>Competência atual<select value={currentId ?? ''} onChange={e=>change('periodo',e.target.value)} disabled={!periods.length}>
        {!periods.length && <option value="">Nenhuma disponível</option>}{periods.map(p=><option value={p.periodo_id} key={p.periodo_id}>{p.competencia}{p.ativo?' · Ativa':''}</option>)}
      </select></label>
      <label>Comparar com<select value={previousId ?? ''} onChange={e=>change('anterior',e.target.value)} disabled={!previousOptions.length}>
        {!previousOptions.length && <option value="">Sem competência anterior</option>}{previousOptions.map(p=><option value={p.periodo_id} key={p.periodo_id}>{p.competencia}</option>)}
      </select></label>
      <label>Filial<select value={branchId ?? ''} onChange={e=>change('filial',e.target.value)} disabled={!options.data?.filiais.length}>
        {!options.data?.filiais.length && <option value="">Nenhuma disponível</option>}{branchOptions.filter(f=>includeInactive || f.ativa || f.filial_id===branchId).map(f=><option value={f.filial_id} key={f.filial_id}>{f.nome}{f.ativa?'':' · Inativa'}{branchesWithExecution.has(f.filial_id)?' · Com execução':''}</option>)}
      </select></label>
      <label className="ve-check-filter"><input type="checkbox" checked={includeInactive} onChange={e=>setIncludeInactive(e.target.checked)}/> Incluir filiais inativas</label>
      <button className="btn btn-outline-primary" disabled={query.loading || options.loading} onClick={()=>{options.refresh();query.refresh();}}>Atualizar</button>
    </section>
    <QueryNotice {...options}/><QueryNotice {...query}/>
    {exportError && <p className="op-notice op-error" role="alert">{exportError}</p>}
    {options.data && !previous && <p className="op-notice">Selecione uma competência que tenha outro período anterior cadastrado para comparar.</p>}
    {report && <>
      <details className="ve-filter-details mb-3" open={search || formula || situation ? true : undefined}><summary>Filtrar resultados{search || formula || situation ? " · filtros ativos" : ""}</summary>
      <div className="op-context mt-2" aria-label="Filtros dos resultados">
        <label>Funcionário ou matrícula<input type="search" value={search} onChange={e=>change('busca',e.target.value)} placeholder="Buscar na comparação"/></label>
        <label>Fórmula<select value={formula} onChange={e=>change('formula',e.target.value)}><option value="">Todas</option>{[...new Set(report.rows.map(r=>r.formula))].sort().map(f=><option key={f}>{f}</option>)}</select></label>
        <label>Situação<select value={situation} onChange={e=>change('situacao',e.target.value)}><option value="">Todas</option>{[...new Set(report.rows.map(r=>r.situacao))].sort().map(s=><option key={s}>{s}</option>)}</select></label>
      </div>
      </details>
      <div className="op-toolbar">
        <p className="op-muted mb-0">{rows.length} linhas · Uma linha por funcionário e fórmula · {dateTime(report.updatedAt)}</p>
        <div className="d-flex flex-wrap gap-3">
          {report.execucaoAnterior && <Link to={`/processamento/${report.execucaoAnterior}?${new URLSearchParams({aba:'resultados',retorno:returnTo})}`}>Abrir {report.anterior}</Link>}
          {report.execucaoAtual && <Link to={`/processamento/${report.execucaoAtual}?${new URLSearchParams({aba:'resultados',retorno:returnTo})}`}>Abrir {report.periodo}</Link>}
        </div>
      </div>
      {(!report.execucaoAtual || !report.execucaoAnterior) && <p className="op-notice">{!report.execucaoAtual && `Não há execução em ${report.periodo}. `}{!report.execucaoAnterior && `Não há execução em ${report.anterior}. `}A ausência não será tratada como valor zero.</p>}
      <details className="mb-3"><summary>Critérios da comparação</summary><p className="op-muted mt-2">Usamos o valor calculado e a execução atual de cada competência. Fórmulas são relacionadas pelo nome, evento, tipo e polaridade. Mudanças de versão ou expressão impedem a variação automática. “Só na atual/anterior” indica presença na execução, não admissão ou desligamento. Percentuais usam o valor absoluto anterior como base e não são calculados quando ele é zero.</p></details>
      {rows.length ? <div className="op-table-wrap"><div className="op-scroll" tabIndex={0} role="region" aria-label="Comparação dos valores calculados">
        <table className="op-table ve-report-table"><thead><tr>{['Funcionário','Fórmula',report.anterior,report.periodo,'Diferença','Variação','Situação'].map((h,i)=><th scope="col" key={i}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice((currentPage-1)*25,currentPage*25).map(r=><tr key={r.key}>
            <th scope="row">{r.nome}<small>{r.matricula}</small></th><td>{r.formula}<small>{r.tipo==='V'?'R$':r.tipo==='D'?'Dias':'Número'}</small></td>
            <td className="ve-report-number">{display(r.anterior,r.tipo)}</td><td className="ve-report-number">{display(r.atual,r.tipo)}</td>
            <td className="ve-report-number">{display(r.diferenca,r.tipo)}</td><td className="ve-report-number">{r.percentual===null?'—':number.format(Number(r.percentual))+'%'}</td>
            <td><StatusPill label={r.situacao}/>{r.observacao && <details><summary className="op-muted">Entender</summary><p className="mt-1 mb-0">{r.observacao}</p></details>}</td>
          </tr>)}</tbody>
        </table>
      </div></div>:<p>Nenhum resultado encontrado com estes filtros.</p>}
      <ReportPagination page={currentPage} total={rows.length} onPage={setPage}/>
    </>}
  </div>;
}
