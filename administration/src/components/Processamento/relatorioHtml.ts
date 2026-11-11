import { criarWorkbook } from "./assistenteExcel";

export type RelatorioVale = {
  texto: string;
  detalhes?: string;
  competencia?: string;
  filial?: string;
  matricula?: string;
  fonte?: string;
  consultadoEm?: string;
  tabela?: {
    colunas: string[];
    linhas: (string | number | null)[][];
    parcial: boolean;
  };
};

export function escaparHtml(valor: unknown) {
  return String(valor ?? "—").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export function filtrosRelatorio(
  r: RelatorioVale,
): [string, string | undefined][] {
  return [
    ["Competência", r.competencia],
    ["Filial", r.filial],
    ["Matrícula", r.matricula],
    ["Origem", r.fonte],
    ["Consultado em", r.consultadoEm],
    ["Resumo", r.texto],
    ["Observações", r.detalhes],
  ];
}

export function criarRelatorioHtml(
  relatorio: RelatorioVale,
  recursos: { excelRuntime: string; logo: string; excelBase64: string },
) {
  if (!relatorio.tabela) throw new Error("O resultado não possui tabela.");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(recursos.logo))
    throw new Error("Logo oficial indisponível.");
  if (/<\/script/i.test(recursos.excelRuntime))
    throw new Error("Biblioteca de exportação inválida.");
  const e = escaparHtml;
  const json = JSON.stringify({
    tabela: relatorio.tabela,
    filtros: filtrosRelatorio(relatorio),
  })
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none';">
<title>Vale IA · Relatório interativo</title><style>
:root{font:14px system-ui,sans-serif;color:#163047;background:#eff4fa;--blue:#163d69;--accent:#008bb8}*{box-sizing:border-box}body{margin:0}main{max-width:1560px;margin:auto;padding:28px}header,.panel{background:white;border:1px solid #dce5ee;border-radius:14px;padding:22px;margin-bottom:18px}header{border-top:5px solid var(--accent)}.brand{display:flex;gap:18px;align-items:center}.brand img{width:86px;height:54px;object-fit:contain}.brand strong{letter-spacing:.13em;color:var(--blue)}h1{font-size:22px;margin:8px 0;white-space:pre-wrap}h2{font-size:17px;margin:0 0 14px}.meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:20px}.meta span{overflow-wrap:anywhere}small{display:block;color:#587084;font-size:12px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.card{background:white;border:1px solid #dce5ee;border-radius:12px;padding:18px;border-left:4px solid var(--accent)}.card strong{display:block;font-size:25px;margin-top:8px}.toolbar,.exports{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}button,input,select,a.export{font:inherit;border:1px solid #becddb;border-radius:7px;padding:9px 12px;background:white;color:var(--blue)}button,a.export{cursor:pointer}a.export{text-decoration:none}button:disabled{opacity:.5}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #26a3d8}input,select{max-width:100%}.search{flex:1;min-width:210px}.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.filters label span{display:block;margin-bottom:5px;color:#587084}.filters input,.filters select{width:100%}.layout{display:grid;grid-template-columns:minmax(300px,1fr) minmax(300px,1fr);gap:18px}.layout .panel{min-width:0}.chart{display:grid;gap:8px;max-height:440px;overflow:auto}.bar{display:grid;grid-template-columns:minmax(80px,1fr) minmax(90px,2fr) minmax(50px,auto);gap:12px;align-items:center;text-align:left;border:0;border-bottom:1px solid #edf2f7;padding:10px 0;color:inherit;width:100%}.bar[aria-pressed=true]{background:#e5f3fa}.track{height:14px;background:#eaf0f7;border-radius:5px;overflow:hidden}.fill{height:100%;background:var(--accent);border-radius:5px}.negative .fill{background:#ae633a}.bar strong{text-align:right;font-variant-numeric:tabular-nums}.scroll{overflow:auto;max-height:65vh}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:11px 12px;border-bottom:1px solid #e0e7ed;white-space:nowrap}th{position:sticky;top:0;background:#e9f1f8}th button{border:0;padding:0;background:transparent;font-weight:700}tr:nth-child(even){background:#f7fafe}.notice{padding:12px;background:#fff1ce;border-radius:8px;line-height:1.5}.details{white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere}footer{color:#587084;line-height:1.6;font-size:12px}.selection{padding:8px 12px;background:#e5f3fa;border-radius:6px}.status{min-height:20px;color:#587084}
@media(max-width:800px){main{padding:12px}.meta,.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.layout{grid-template-columns:1fr}header,.panel{padding:16px}h1{font-size:19px}}@media print{button,input,select,.exports,.toolbar,.filters{display:none!important}main{padding:0}.scroll,.chart{max-height:none;overflow:visible}.cards,.layout{break-inside:avoid}.panel{break-inside:avoid}th{position:static}body{background:white}}
</style></head><body><main>
<header><div class="brand"><img src="${recursos.logo}" alt="Expresso Nepomuceno"><div><strong>VALE IA · INTELIGÊNCIA OPERACIONAL</strong><small>Relatório interativo · dados do Vale Expresso</small></div></div><h1>${e(relatorio.texto)}</h1>
<div class="meta"><span><small>Competência consultada</small>${e(relatorio.competencia)}</span><span><small>Filiais consultadas</small>${e(relatorio.filial ?? "Conforme consulta")}</span><span><small>Origem</small>${e(relatorio.fonte)}</span><span><small>Atualização da consulta</small>${e(relatorio.consultadoEm ? new Date(relatorio.consultadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informada")}</span></div>
<div class="exports"><a class="export" id="excel-original" download="vale-ia-dados.xlsx" href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${e(recursos.excelBase64)}">Excel da consulta</a><button id="excel-filtrado">Excel do recorte filtrado</button><button id="imprimir">Imprimir / PDF</button></div><p id="export-status" class="status" role="status"></p>
${relatorio.tabela.parcial ? '<p class="notice">BASE PARCIAL: a consulta atingiu um limite. Indicadores e exportações refletem somente as linhas carregadas, não totais completos.</p>' : ""}</header>
<section class="cards" aria-label="Indicadores"><div class="card"><small>Linhas no recorte local</small><strong id="kpi-linhas"></strong></div><div class="card"><small id="kpi-metrica-label">Indicador</small><strong id="kpi-metrica"></strong></div><div class="card"><small>Grupos no recorte</small><strong id="kpi-grupos"></strong></div><div class="card"><small>Valores ausentes no indicador</small><strong id="kpi-ausentes"></strong></div></section>
<section class="panel"><h2>Explore o recorte</h2><p>Os filtros abaixo atuam somente sobre os dados carregados. Não executam novas consultas ao banco.</p><div class="toolbar"><input id="busca" class="search" aria-label="Buscar nos dados" placeholder="Buscar nos dados…"><button id="limpar">Limpar filtros</button></div><div id="filtros" class="filters"></div><p id="selecao" class="selection" hidden></p></section>
<div class="layout"><section class="panel"><h2>Distribuição · clique para filtrar</h2><div class="toolbar"><label>Agrupar por <select id="dimensao"></select></label><label>Indicador <select id="metrica"></select></label></div><p id="grafico-nota" class="status"></p><div id="grafico" class="chart"></div></section><section class="panel"><h2>Leitura do relatório</h2><p>Selecione uma barra para detalhar o grupo na tabela. Indicadores, gráfico e Excel do recorte acompanham a mesma seleção.</p><p>Somar um indicador agrega os valores retornados pela consulta; não recalcula benefícios. Colunas de contagem podem contar registros por fórmula, e não pessoas únicas.</p><p>Vazio é exibido como — e não é convertido em zero. Valores com mais de 15 dígitos permanecem como texto no Excel para preservar precisão.</p><details><summary>Critérios e observações</summary><p class="details">${e(relatorio.detalhes ?? "Conforme dados e filtros da consulta.")}</p></details></section></div>
<section class="panel"><h2>Dados detalhados</h2><div class="toolbar"><label>Linhas por página <select id="tamanho"><option>25</option><option>50</option><option>100</option><option value="2000">Todas</option></select></label><span id="contagem" role="status"></span></div><div class="scroll"><table><thead><tr>${relatorio.tabela.colunas.map((c, i) => `<th scope="col"><button data-sort="${i}">${e(c)} ↕</button></th>`).join("")}</tr></thead><tbody></tbody></table></div><div class="toolbar"><button id="anterior">Anterior</button><span id="pagina"></span><button id="proxima">Próxima</button></div></section>
<footer>Snapshot dos registros do Vale Expresso. Nenhuma alteração operacional é realizada. HTML e Excel da consulta contêm a mesma base. O Excel do recorte considera todos os filtros locais, independentemente da paginação.</footer>
</main><script id="dados" type="application/json">${json}</script><script>${recursos.excelRuntime}</script><script>
const criarWorkbook = ${criarWorkbook.toString()};
(() => {
const dados=JSON.parse(document.getElementById('dados').textContent), tabela=dados.tabela, colunas=tabela.colunas, linhas=tabela.linhas;
const $=id=>document.getElementById(id), texto=v=>v===null?'—':String(v), normal=v=>texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const numeric=v=>v!==null&&/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$/.test(String(v));
const decimal=v=>{const s=String(v);return {n:BigInt(s.replace('.','')),c:(s.split('.')[1]||'').length}};
const somar=values=>{const parsed=values.filter(numeric).map(decimal);if(!parsed.length)return null;const c=Math.max(...parsed.map(x=>x.c));const n=parsed.reduce((a,x)=>a+x.n*10n**BigInt(c-x.c),0n);const neg=n<0n;let s=(neg?-n:n).toString().padStart(c+1,'0');return (neg?'-':'')+(c?s.slice(0,-c)+'.'+s.slice(-c):s)};
const format=v=>{if(v===null)return '—';const [a,b]=String(v).split('.');return a.replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.')+(b!==undefined?','+b:'')};
const compare=(a,b)=>{if(numeric(a)&&numeric(b)){const x=decimal(a),y=decimal(b),c=Math.max(x.c,y.c),n=x.n*10n**BigInt(c-x.c),m=y.n*10n**BigInt(c-y.c);return n<m?-1:n>m?1:0}return texto(a).localeCompare(texto(b),'pt-BR',{numeric:true})};
let pagina=0,sort=-1,sentido=1,selecao=null,recorte=[],grupos=[];
const filtros=[];
colunas.forEach((nome,i)=>{const label=document.createElement('label'),span=document.createElement('span');span.textContent=nome;label.appendChild(span);const values=[...new Map(linhas.map(row=>[JSON.stringify(row[i]),row[i]])).values()];const select=values.length<=80;const el=document.createElement(select?'select':'input');el.setAttribute('aria-label','Filtrar '+nome);if(select){const any=document.createElement('option');any.value='';any.textContent='Todos';el.appendChild(any);values.sort(compare).forEach(v=>{const opt=document.createElement('option');opt.value=JSON.stringify(v);opt.textContent=texto(v);el.appendChild(opt)})}else{el.type='search';el.placeholder='Buscar nesta coluna'}el.addEventListener(select?'change':'input',()=>{pagina=0;atualizar()});label.appendChild(el);$('filtros').appendChild(label);filtros.push({el,select,i});const opt=document.createElement('option');opt.value=String(i);opt.textContent=nome;$('dimensao').appendChild(opt)});
const count=document.createElement('option');count.value='-1';count.textContent='Contagem de linhas';$('metrica').appendChild(count);
colunas.forEach((nome,i)=>{if(!/(^id|\\bid\\b|matricula|matrícula|codigo|código|coligada|codfilial|versao|versão|execucao|execução)/i.test(nome)&&linhas.some(r=>numeric(r[i]))&&linhas.every(r=>r[i]===null||numeric(r[i]))){const opt=document.createElement('option');opt.value=String(i);opt.textContent=nome;$('metrica').appendChild(opt)}});
const dimInicial=colunas.findIndex(c=>/^filial$|^formula$|^fórmula$|status|estado/i.test(c));if(dimInicial>=0)$('dimensao').value=String(dimInicial);
const metInicial=colunas.findIndex(c=>/total|valor|calculado|desconto|pago|saldo/i.test(c));if([...$('metrica').options].some(o=>o.value===String(metInicial)))$('metrica').value=String(metInicial);
function filtrar(){return linhas.filter(row=>normal(row.map(texto).join(' ')).includes(normal($('busca').value))&&filtros.every(f=>!f.el.value||(f.select?JSON.stringify(row[f.i])===f.el.value:normal(row[f.i]).includes(normal(f.el.value))))&&(!selecao||JSON.stringify(row[selecao.i])===selecao.key))}
function atualizar(){
$('export-status').textContent='';
recorte=filtrar();if(sort>=0)recorte.sort((a,b)=>sentido*compare(a[sort],b[sort]));const d=Number($('dimensao').value),m=Number($('metrica').value);const map=new Map();recorte.forEach(row=>{const key=JSON.stringify(row[d]);if(!map.has(key))map.set(key,{key,label:row[d],values:[],count:0});const g=map.get(key);g.count++;if(m>=0)g.values.push(row[m])});grupos=[...map.values()].map(g=>({...g,value:m<0?String(g.count):somar(g.values)})).sort((a,b)=>compare(b.value,a.value));
$('kpi-linhas').textContent=format(recorte.length);$('kpi-metrica-label').textContent=m<0?'Contagem de linhas':'Soma · '+colunas[m];$('kpi-metrica').textContent=format(m<0?recorte.length:somar(recorte.map(r=>r[m])));$('kpi-grupos').textContent=format(grupos.length);$('kpi-ausentes').textContent=m<0?'0':String(recorte.filter(r=>r[m]===null).length);
$('selecao').hidden=!selecao;$('selecao').textContent=selecao?'Seleção no gráfico: '+colunas[selecao.i]+' = '+texto(JSON.parse(selecao.key))+' · use Limpar filtros para remover.':'';
const chart=$('grafico');chart.replaceChildren();const max=Math.max(1,...grupos.map(g=>Math.abs(Number(g.value)||0)));grupos.slice(0,30).forEach(g=>{const b=document.createElement('button');b.type='button';b.className='bar'+(Number(g.value)<0?' negative':'');b.setAttribute('aria-pressed',String(!!selecao&&selecao.key===g.key&&selecao.i===d));const label=document.createElement('span');label.textContent=texto(g.label);const track=document.createElement('span');track.className='track';const fill=document.createElement('span');fill.className='fill';fill.style.display='block';fill.style.width=String(100*Math.abs(Number(g.value)||0)/max)+'%';track.appendChild(fill);const val=document.createElement('strong');val.textContent=format(g.value);b.append(label,track,val);b.addEventListener('click',()=>{selecao=selecao&&selecao.i===d&&selecao.key===g.key?null:{i:d,key:g.key};pagina=0;atualizar()});chart.appendChild(b)});$('grafico-nota').textContent=grupos.length>30?'Exibindo os 30 primeiros grupos. Os indicadores e o Excel incluem todos os grupos do recorte.':grupos.length?'Todos os grupos do recorte.':'Sem dados para os filtros selecionados.';
renderTabela(false);
}
function renderTabela(impressao){const tamanho=Number($('tamanho').value),total=Math.max(1,Math.ceil(recorte.length/tamanho));pagina=Math.max(0,Math.min(pagina,total-1));const tbody=document.querySelector('tbody');tbody.replaceChildren();(impressao?recorte:recorte.slice(pagina*tamanho,(pagina+1)*tamanho)).forEach(row=>{const tr=document.createElement('tr');row.forEach(v=>{const td=document.createElement('td');td.textContent=texto(v);tr.appendChild(td)});tbody.appendChild(tr)});$('contagem').textContent=recorte.length+' de '+linhas.length+' linhas carregadas';$('pagina').textContent='Página '+(pagina+1)+' de '+total;$('anterior').disabled=pagina===0;$('proxima').disabled=pagina>=total-1}
$('busca').addEventListener('input',()=>{pagina=0;atualizar()});$('tamanho').addEventListener('change',()=>{pagina=0;atualizar()});$('dimensao').addEventListener('change',()=>{selecao=null;atualizar()});$('metrica').addEventListener('change',atualizar);$('anterior').onclick=()=>{pagina--;renderTabela(false)};$('proxima').onclick=()=>{pagina++;renderTabela(false)};$('limpar').onclick=()=>{filtros.forEach(f=>f.el.value='');$('busca').value='';selecao=null;pagina=0;atualizar()};document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.sort);sentido=sort===i?-sentido:1;sort=i;atualizar()});$('imprimir').onclick=()=>window.print();window.addEventListener('beforeprint',()=>renderTabela(true));window.addEventListener('afterprint',()=>renderTabela(false));
$('excel-filtrado').onclick=async()=>{const botao=$('excel-filtrado'),linhasExportadas=recorte.slice();botao.disabled=true;$('export-status').textContent='Gerando Excel do recorte…';try{const locais=filtros.filter(f=>f.el.value).map(f=>["Filtro local · "+colunas[f.i],f.select?texto(JSON.parse(f.el.value)):f.el.value]);if($('busca').value)locais.push(['Busca local',$('busca').value]);if(selecao)locais.push(['Seleção no gráfico · '+colunas[selecao.i],texto(JSON.parse(selecao.key))]);const bytes=await criarWorkbook(window.ExcelJS,{colunas,linhas:linhasExportadas,parcial:tabela.parcial},[...dados.filtros,...locais,['Linhas no recorte',String(linhasExportadas.length)]]).xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='vale-ia-recorte.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$('export-status').textContent='Excel gerado com '+linhasExportadas.length+' linha(s) do recorte exportado.'}catch{$('export-status').textContent='Falha ao gerar Excel. Use o Excel da consulta ou tente novamente.'}finally{botao.disabled=false}};
atualizar();
})();</script></body></html>`;
}
