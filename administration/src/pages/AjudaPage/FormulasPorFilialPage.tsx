import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { filialApi } from '../../utils/api/filialApi';
import { FormulaApi } from '../../utils/api/formulaApi';
import { VariavelApi } from '../../utils/api/variavelApi';
import type { Filial } from '../../models/FilialModel';
import type { Formula } from '../../models/FormulaModel';
import type { Variavel } from '../../models/VariavelModel';
import { useAppContext } from '../../contexts/AppContext/useAppContext';
import { calculateExample, examples, expressionVariables, number, patternGuide, recognizeExpression, variableGuide, type Pattern } from './formulaReference';
import './ajuda.css';
import './formulaReference.css';

type Row={formula:Formula;pattern:Pattern|null;codes:string[]};
const date=(value:unknown)=>value?String(value).slice(0,10).split('-').reverse().join('/'):'Sem término';
const label=(value:number|null,type:string|null)=>value===null?'Pendente para revisão':type?.trim()==='D'?`${number(value)} dias`:value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function FormulaGuide({row,variables,first}:{row:Row;variables:Variavel[];first:boolean}){
 const {formula:f,pattern,codes}=row;
 const [edgeCases,setEdgeCases]=useState(false);
 const guide=pattern?patternGuide[pattern]:null;
 const eventCode=/^\(:([A-Za-z0-9_]+)\)$/.exec(f.codEvento?.trim()??'')?.[1];
 const dependencies=[...new Set([...codes,...(eventCode?[eventCode]:[])])];
 return <details className="fr-card" id={`fr-formula-${f.formula_id}`} open={first}>
  <summary><div><h2>{f.nome.trim()}</h2><p>#{f.formula_id} · versão {f.versao} · {f.tipo?.trim()==='D'?'Dias':'Valor'} · {f.ativa?'Ativa':'Inativa'}</p></div><span className="fr-expand" aria-hidden="true">+</span></summary>
  <div className="fr-card-body">
   <dl className="fr-metadata"><div><dt>Vigência cadastrada</dt><dd>{date(f.data_inicio_vigencia)} → {date(f.data_fim_vigencia)}</dd></div><div><dt>Evento RM cadastrado</dt><dd><code>{f.codEvento?.trim()||'Não informado'}</code></dd></div><div><dt>Polaridade</dt><dd>{f.polaridade==='-'?'− Desconto':'+ Acréscimo'}</dd></div></dl>
   <h3>Como esta expressão funciona</h3>
   {guide?<><p>{guide.description}</p><ul className="fr-notes">{guide.notes.map(text=><li key={text}>{text}</li>)}</ul></>:<div className="help-note"><p>Esta expressão é nova ou diferente dos padrões já conferidos. Ela é exibida integralmente abaixo; os exemplos automáticos ficam indisponíveis para não presumir uma regra diferente da cadastrada.</p></div>}
   <h3>Variáveis desta fórmula</h3><p className="fr-muted">Somente os códigos referenciados na expressão{eventCode?' e no evento RM':''}. A origem é consultada no cadastro atual da filial.</p>
   <div className="help-table-scroll" role="region" aria-label={`Variáveis de ${f.nome}`} tabIndex={0}><table><thead><tr><th scope="col">Código e significado</th><th scope="col">Origem cadastrada</th></tr></thead><tbody>{dependencies.map(code=>{
    const v=variables.find(item=>item.codigo===code);
    return <tr key={code}><th scope="row"><code>{code}</code><strong className="fr-variable-name">{v?.nome.trim()??'Não encontrada no cadastro ativo'}</strong><p>{variableGuide[code]??'Confira a finalidade e a unidade com o responsável pela consulta RM.'}{code===eventCode?' É referência de evento, não um valor somado na expressão.':''}</p></th><td>{v?<><span>{v.sql_codigo_rm?'Consulta RM':'Valor fixo'}</span><code className="fr-origin">{v.sql_codigo_rm??(v.valor_fixo!=null?String(v.valor_fixo):'Não informado')}</code>{v.sql_codigo_rm?.startsWith('PVE2.')&&<small>Chapas por chamada: {v.chapas_por_chamada??'Sem limite'}</small>}</>:<span>Confirme o código e a situação da variável antes de processar.</span>}</td></tr>;
   })}</tbody></table></div>
   {pattern&&<section className="fr-examples"><h3>Exemplos de cálculo desta expressão</h3><p>Entradas fictícias para entender a regra. Não são resultados de funcionários nem executam etapas. Cada exemplo foi comparado com o motor real do Vale. As modalidades são cenários didáticos, não comprovação de vínculos reais da filial.</p><label className="fr-edge"><input type="checkbox" checked={edgeCases} onChange={e=>setEdgeCases(e.target.checked)}/>Incluir cenários de teto, férias e pendências</label>
    {(edgeCases?examples:examples.slice(0,3)).map(example=>{const result=calculateExample(pattern,example.scope);return <details key={example.title} className="fr-example"><summary><span>{example.title}</span><strong className={result.value===null?'fr-blocked':''}>{label(result.value,f.tipo)}</strong></summary><div><h4>Entradas usadas</h4><dl className="fr-inputs">{codes.map(code=><div key={code}><dt>{code}</dt><dd>{example.scope[code]===undefined?'Não definida':number(example.scope[code])}</dd></div>)}</dl><h4>Conta passo a passo</h4><ol className="help-steps">{result.steps.map(step=><li key={step}>{step}</li>)}</ol>{!codes.includes('FERIAS')&&example.scope.FERIAS>0&&<p className="help-note">FERIAS = {example.scope.FERIAS} não altera diretamente esta expressão, pois o código não é referenciado. Isso não permite concluir que férias sejam ignoradas pelas consultas das outras variáveis.</p>}</div></details>;})}
   </section>}
   <h3>Expressão exata no cadastro atual</h3><p className="fr-muted">Leitura literal, sem simplificar ou substituir a expressão. A versão usada em um processamento antigo pode ser diferente; consulte a memória daquele resultado.</p><div className="help-code"><pre><code>{f.expressao}</code></pre></div>
  </div>
 </details>;
}

export function FormulasPorFilialPage(){
 const [params,setParams]=useSearchParams();
 const [branches,setBranches]=useState<Filial[]>([]);
 const [rows,setRows]=useState<Row[]>([]);
 const [variables,setVariables]=useState<Variavel[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [stamp,setStamp]=useState('');
 const [loadedBranch,setLoadedBranch]=useState<number|null>(null);
 const [refresh,setRefresh]=useState(0);
 const [inactive,setInactive]=useState(false);
 const {state}=useAppContext();
 const requested=params.get('filial')??'';
 const selected=branches.find(b=>String(b.filial_id)===requested)??branches[0];
 useEffect(()=>{document.title='Fórmulas atuais por filial | Vale Expresso';let stopped=false;filialApi.all().then(data=>{if(!stopped){setBranches(data);if(!data.length)setLoading(false);}}).catch(()=>{if(!stopped){setError('Não foi possível consultar as filiais. Verifique sua conexão e seu acesso.');setLoading(false);}});return()=>{stopped=true;};},[]);
 useEffect(()=>{
  if(!selected)return;let stopped=false;setLoading(true);setError('');setRows([]);setVariables([]);setStamp('');setLoadedBranch(null);
  Promise.all([FormulaApi.getByFilialId(selected.filial_id),VariavelApi.getByFilialId(selected.filial_id)]).then(async([formulas,vars])=>{
   const result=await Promise.all(formulas.map(async formula=>({formula,codes:expressionVariables(formula.expressao),pattern:await recognizeExpression(formula.expressao)})));
   if(!stopped){setRows(result);setVariables(vars);setStamp(new Date().toLocaleString('pt-BR'));setLoadedBranch(selected.filial_id);}
  }).catch(()=>{if(!stopped)setError('Não foi possível consultar o cadastro desta filial. Nenhuma regra foi alterada. Tente atualizar ou confirme seu acesso.');}).finally(()=>{if(!stopped)setLoading(false);});
  return()=>{stopped=true;};
 },[selected?.filial_id,refresh]);
 const shown=rows.filter(r=>inactive||r.formula.ativa);
 const missing=['Valor Reembolso passado','Valor Descontar passado','Valor Futuro'].filter(name=>!rows.some(r=>r.formula.ativa&&r.formula.nome.trim().replace(/\s+/g,' ').toLocaleLowerCase()===name.toLocaleLowerCase()));
 return <div className="help-page fr-page"><Link className="op-back" to="/ajuda?categoria=tecnica">← Referência técnica</Link><header className="help-header"><div><p className="help-eyebrow">REFERÊNCIA TÉCNICA · LEITURA DO CADASTRO OFICIAL</p><h1>Fórmulas atuais por filial</h1><p>Expressões, variáveis e exemplos conferidos com o motor de cálculo do Vale.</p></div></header>
  <div className="help-note"><p>Você quer apenas processar e conferir resultados? Use o <Link to="/ajuda/conferencia-dia-a-dia">guia de conferência do dia a dia</Link>, sem precisar entender SQL ou expressões. Esta página detalha as regras técnicas.</p></div>
  <div className="fr-context"><div><label htmlFor="fr-branch">Filial</label><select id="fr-branch" value={selected?.filial_id??''} onChange={event=>{const next=new URLSearchParams(params);next.set('filial',event.target.value);setParams(next);}} disabled={!branches.length}>{branches.map(b=><option key={b.filial_id} value={b.filial_id}>{b.nome}{b.ativa?'':' · Inativa'}</option>)}</select></div><button type="button" className="btn btn-outline-primary" disabled={loading||!selected} onClick={()=>setRefresh(v=>v+1)}>Atualizar cadastro</button></div>
  {error&&<div className="help-note" role="alert"><p>{error}</p></div>}
  {!error&&(loading||(selected&&loadedBranch!==selected.filial_id))&&<p role="status">Consultando fórmulas e variáveis atuais…</p>}
  {!loading&&!error&&!branches.length&&<p>Nenhuma filial disponível para consulta.</p>}
  {!loading&&!error&&selected&&loadedBranch===selected.filial_id&&<>
   <div className="fr-snapshot"><strong>{selected.nome}</strong><span>Coligada RM {selected.codcoligada} · Filial RM {selected.codfilial} · {rows.filter(r=>r.formula.ativa).length} fórmulas ativas · {variables.length} variáveis ativas</span><small>Cadastro consultado em {stamp}. Não usa dados de funcionários. Atualize após editar uma regra.</small></div>
   {!!missing.length&&<aside className="help-note"><p>Não há fórmula ativa com estes nomes nesta filial: {missing.join('; ')}. Não são criadas ou presumidas regras ausentes. Confira abaixo se o cadastro utiliza fórmulas suplementares.</p></aside>}
   <label className="fr-edge"><input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>Incluir fórmulas inativas</label>
   <nav className="fr-jump" aria-label="Fórmulas desta filial">{shown.map(row=><a key={row.formula.formula_id} href={`#fr-formula-${row.formula.formula_id}`}>{row.formula.nome.trim()}</a>)}</nav>
   {shown.map((row,i)=><FormulaGuide key={`${selected.filial_id}:${row.formula.formula_id}:${stamp}`} row={row} variables={variables} first={i===0}/>)}
   {!shown.length&&<p>Nenhuma fórmula neste recorte.</p>}
   <section className="help-paper fr-inventory"><h2>Inventário completo de variáveis ativas</h2><p>O cadastro pode ter variáveis que não aparecem diretamente nas fórmulas exibidas. A existência do código não significa que será aplicado automaticamente.</p><div className="help-table-scroll"><table><thead><tr><th scope="col">Código</th><th scope="col">Significado</th><th scope="col">Origem</th></tr></thead><tbody>{variables.map(v=><tr key={v.codigo}><th scope="row"><code>{v.codigo}</code></th><td><strong>{v.nome.trim()}</strong><p>{variableGuide[v.codigo]??'Confira a finalidade na consulta de origem.'}</p></td><td><code>{v.sql_codigo_rm??(v.valor_fixo!=null?String(v.valor_fixo):'Não informada')}</code></td></tr>)}</tbody></table></div></section>
   {state.user.perfil==='admin'&&<Link to={`/filial/formulas/${selected.filial_id}`} className="btn btn-outline-primary">Abrir cadastro técnico de fórmulas ↗</Link>}
  </>}
 </div>;
}
