import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Icon } from '@iconify/react';
import { useAppContext } from '../../contexts/AppContext/useAppContext';
import { categories, findArticles, helpArticles, type HelpSection } from './content';
import './ajuda.css';
import './formulaReference.css';

function HelpFigure({ section }: { section: HelpSection }) {
 const [open,setOpen]=useState(false);
 const close=useRef<HTMLButtonElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';close.current?.focus();
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}
   if(event.key==='Tab'){event.preventDefault();close.current?.focus();}
  };
  window.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey);};
 },[open]);
 if(!section.image)return null;
 const image=<img src={`/manual-ajuda/${section.image}`} alt={section.imageAlt ?? section.title} loading="lazy" decoding="async" width="1280"/>;
 return <>
  <figure className="help-figure"><button type="button" ref={trigger} onClick={()=>setOpen(true)} aria-label={`Ampliar captura: ${section.title}`}>{image}<span><Icon icon="mdi:magnify-plus-outline" aria-hidden="true"/> Ampliar captura</span></button><figcaption>{section.imageAlt} Captura da interface oficial em ambiente ilustrativo, com dados fictícios.</figcaption></figure>
  {open && <div className="help-lightbox" role="dialog" aria-modal="true" aria-label={`Captura ampliada: ${section.title}`} onClick={()=>{setOpen(false);trigger.current?.focus();}}><button className="help-lightbox-close" type="button" ref={close} onClick={()=>{setOpen(false);trigger.current?.focus();}}>Fechar captura <span aria-hidden="true">×</span></button>{image}</div>}
 </>;
}

export function AjudaPage() {
 const {artigo}=useParams<{artigo?:string}>();
 const [params,setParams]=useSearchParams();
 const query=params.get('busca')??'';
 const category=params.get('categoria')??'';
 const article=helpArticles.find(item=>item.id===artigo);
 const categoryInfo=categories.find(item=>item.id===article?.category);
 const results=useMemo(()=>findArticles(query,category).filter(a=>query||category||a.category!=='tecnica'),[query,category]);
 const {state}=useAppContext();const isAdmin=state.user.perfil==='admin';
 const heading=useRef<HTMLHeadingElement>(null);
 const [copied,setCopied]=useState(false);
 useEffect(()=>{document.title=`${article?.title??'Documentação e ajuda'} | Vale Expresso`;setCopied(false);heading.current?.focus();window.scrollTo(0,0);},[artigo,article?.title]);
 const change=(key:string,value:string)=>{const next=new URLSearchParams(params);value?next.set(key,value):next.delete(key);setParams(next,{replace:true});};
 const copyLink=async()=>{try{await navigator.clipboard.writeText(window.location.href);setCopied(true);}catch{setCopied(false);}};
 const navigation=<nav aria-label="Categorias da ajuda" className="help-categories">
  <Link to="/ajuda" className={!category&&!article?'is-active':''}>Início da ajuda <span>{helpArticles.length}</span></Link>
  {categories.map(item=><Link key={item.id} to={`/ajuda?categoria=${item.id}`} className={(category===item.id||article?.category===item.id)?'is-active':''}><Icon icon={item.icon} aria-hidden="true"/>{item.title}<span>{helpArticles.filter(a=>a.category===item.id).length}</span></Link>)}
 </nav>;
 return <div className="help-page">
  <header className="help-header"><div><p className="help-eyebrow">CENTRAL DE CONHECIMENTO</p><h1 ref={heading} tabIndex={-1}>{article?.title??'Documentação e ajuda'}</h1><p>{article?.summary??'Aprenda a operar o Vale Expresso e entenda o que acontece em cada cálculo.'}</p></div><Icon className="help-header-icon" icon="mdi:book-open-page-variant-outline" aria-hidden="true"/></header>
  {artigo&&!article ? <section className="help-paper"><h2>Guia não encontrado</h2><p>Escolha um guia na central de documentação.</p><Link to="/ajuda">Voltar à ajuda</Link></section> : <div className="help-layout">
   <aside className="help-sidebar">{navigation}<div className="help-version"><strong>Referência da versão oficial</strong><span>Revisado em 17/11/2026</span><span>Sem executar etapas ou alterar dados ao consultar.</span></div>{article&&<nav className="help-toc" aria-label="Neste guia"><strong>Neste guia</strong>{article.sections.map((section,i)=><a href={`#secao-${i+1}`} key={section.title}>{section.title}</a>)}</nav>}</aside>
   <div className="help-main">
    {!article ? <>
     {!query&&!category&&<section className="help-personas" aria-label="Escolha o tipo de ajuda"><Link to="/ajuda?categoria=operacao"><small>PARA QUEM OPERA O SISTEMA</small><strong>Uso do dia a dia →</strong><p>Processar, conferir e resolver pendências. Sem precisar conhecer SQL ou escrever fórmulas.</p></Link><Link to="/ajuda?categoria=tecnica"><small>PARA QUEM CONFIGURA AS REGRAS</small><strong>Referência técnica →</strong><p>Cadastros, consultas SQL, expressões atuais de cada filial e exemplos detalhados de cálculo.</p></Link></section>}
     <form className="help-search" role="search" onSubmit={event=>event.preventDefault()}><label htmlFor="help-search">O que você precisa fazer?</label><div><Icon icon="mdi:magnify" aria-hidden="true"/><input id="help-search" type="search" value={query} onChange={event=>change('busca',event.target.value)} placeholder="Buscar variável, fórmula, envio, erro 500…" autoComplete="off"/></div></form>
     {!query&&!category&&<section className="help-start" aria-labelledby="help-start-title"><p className="help-eyebrow">PRIMEIRO ACESSO?</p><h2 id="help-start-title">Da competência ao envio, um passo de cada vez.</h2><p>Comece pelo roteiro completo ou vá direto ao ponto em que você está.</p><Link className="btn btn-primary" to="/ajuda/primeiros-passos">Ver o fluxo completo <span aria-hidden="true">→</span></Link><ol className="help-flow">{[['competencias','Competência'],['nova-execucao','Execução'],['processar-variaveis','Variáveis'],['calcular-valores','Valores'],['enviar-rm','Envio ao RM']].map(([id,label],i)=><li key={id}><Link to={`/ajuda/${id}`}><span>{i+1}</span>{label}</Link></li>)}</ol></section>}
     <div className="help-results-heading"><h2>{category?categories.find(c=>c.id===category)?.title??'Guias':query?'Resultados da busca':'Guias para a operação'}</h2><span role="status" aria-live="polite">{results.length} {results.length===1?'guia':'guias'}</span>{(query||category)&&<Link to="/ajuda">Limpar filtros</Link>}</div>
     {!results.length&&<div className="help-paper"><h3>Nenhum guia encontrado</h3><p>Tente termos como “variável”, “fixo”, “competência” ou “envio”.</p><Link to="/ajuda">Ver todos os guias</Link></div>}
     {categories.filter(c=>results.some(a=>a.category===c.id)).map(c=><section className="help-group" key={c.id} aria-labelledby={`category-${c.id}`}><h3 id={`category-${c.id}`}><Icon icon={c.icon} aria-hidden="true"/>{c.title}</h3><div className="help-article-list">{results.filter(a=>a.category===c.id).map(a=><Link className="help-article-link" key={a.id} to={`/ajuda/${a.id}`}><div><strong>{a.title}</strong><p>{a.summary}</p>{a.admin&&<small>Cadastro ou manutenção: administrador</small>}</div><span aria-hidden="true">↗</span></Link>)}</div></section>)}
    </> : <article className="help-paper help-article">
     <div className="help-article-top"><Link to={`/ajuda?categoria=${article.category}`}>← {categoryInfo?.title}</Link><div><button type="button" onClick={copyLink}>{copied?'Link copiado':'Copiar link'}</button><button type="button" onClick={()=>window.print()}>Imprimir guia</button><span className="visually-hidden" role="status">{copied?'Link do guia copiado.':''}</span></div></div>
     <div className="help-audience">{article.category==='tecnica'?'REFERÊNCIA TÉCNICA · CADASTROS E REGRAS':'GUIA DO USUÁRIO · OPERAÇÃO E CONFERÊNCIA'}</div>
     {article.category==='tecnica'&&<p className="help-reading-note">Para usar o sistema sem entrar na configuração, consulte os <Link to="/ajuda?categoria=operacao">guias do dia a dia</Link>.</p>}
     {article.admin&&<div className="help-note"><strong>Perfil de administrador</strong><p>Você pode ler este guia em qualquer perfil. A criação e a manutenção dos cadastros exigem acesso de administrador.</p></div>}
     <div className="help-reading-note">Este guia ensina o uso da versão oficial. Exemplos e capturas são ilustrativos; as configurações da sua filial e a memória da execução são a referência do cálculo.</div>
     {article.sections.map((section,i)=><section className="help-section" key={section.title} id={`secao-${i+1}`}><h2><span>{String(i+1).padStart(2,'0')}</span>{section.title}</h2>{section.text?.map(text=><p key={text}>{text}</p>)}{section.steps&&<ol className="help-steps">{section.steps.map(step=><li key={step}>{step}</li>)}</ol>}{section.table&&<div className="help-table-scroll" role="region" aria-label={section.title} tabIndex={0}><table><thead><tr>{section.table.headers.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{section.table.rows.map((row,index)=><tr key={index}>{row.map((cell,n)=>n===0?<th key={n} scope="row">{cell}</th>:<td key={n}>{cell}</td>)}</tr>)}</tbody></table></div>}{section.code&&<div className="help-code"><small>{section.language==='sql'?'SQL · exemplo didático':'Exemplo didático'}</small><pre><code>{section.code}</code></pre></div>}{section.note&&<aside className="help-note"><Icon icon="mdi:information-outline" aria-hidden="true"/><p>{section.note}</p></aside>}<HelpFigure section={section}/></section>)}
     {article.action&&(!article.admin||isAdmin)&&<Link className="btn btn-outline-primary" to={article.action.to}>{article.action.label} ↗</Link>}
     <footer className="help-related"><h2>Continue por aqui</h2>{article.related.map(id=>{const a=helpArticles.find(item=>item.id===id);return a?<Link to={`/ajuda/${id}`} key={id}>{a.title}<span aria-hidden="true">→</span></Link>:null;})}<Link to="/ajuda">Todos os guias →</Link></footer>
    </article>}
   </div>
  </div>}
 </div>;
}
