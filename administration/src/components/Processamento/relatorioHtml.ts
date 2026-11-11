type Relatorio = {
  texto: string;
  detalhes?: string;
  competencia?: string;
  filial?: string;
  fonte?: string;
  consultadoEm?: string;
  tabela?: {
    colunas: string[];
    linhas: (string | number | null)[][];
    parcial: boolean;
  };
  grafico?: { rotulo: string; valor: number; moeda?: boolean }[];
};

export function escaparHtml(valor: unknown) {
  return String(valor ?? "—").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

export function criarRelatorioHtml(relatorio: Relatorio) {
  const tabela = relatorio.tabela;
  if (!tabela) throw new Error("O resultado não possui tabela.");
  const e = escaparHtml;
  const grafico =
    relatorio.grafico
      ?.filter((item) => Number.isFinite(item.valor))
      .slice(0, 30) ?? [];
  const maior = Math.max(1, ...grafico.map((item) => Math.abs(item.valor)));
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none';">
<title>Relatório Vale IA</title>
<style>
:root{font:15px system-ui,sans-serif;color:#163047;background:#f2f5f8}
*{box-sizing:border-box}body{margin:0}main{max-width:1440px;margin:auto;padding:32px}
header,section{background:white;border:1px solid #dae3eb;border-radius:14px;padding:24px;margin-bottom:20px}
h1{font-size:24px;margin:8px 0 20px}h2{font-size:18px;margin:0 0 16px}.marca{font-weight:700;color:#16627f;letter-spacing:.12em}
.meta,.cards{display:flex;gap:14px;flex-wrap:wrap}.meta span,.card{border:1px solid #dbe5ec;border-radius:8px;padding:12px}
.meta span{flex:1;min-width:180px}.card strong{display:block;font-size:24px}
small{display:block;color:#526679}button,input,select{font:inherit;padding:10px;border:1px solid #c2d0dc;border-radius:7px;background:white;color:inherit}
button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #208bc2}
.toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:16px 0}.toolbar input{flex:1;min-width:220px}
.scroll{overflow:auto;max-height:65vh}table{border-collapse:collapse;width:100%;font-size:13px}
td,th{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #e0e7ed;white-space:nowrap}
th{position:sticky;top:0;background:#eaf2f7}th button{border:0;background:transparent;font-weight:700;padding:0}
tbody tr:nth-child(even){background:#f6f9fc}.grafico{display:grid;gap:14px}.barra{height:12px;border-radius:6px;background:#157896;margin:6px 0}
.negativo{background:#a35e36}.detalhes{white-space:pre-wrap;line-height:1.6;color:#43586a}.aviso{padding:12px;background:#fff2ce}
footer{font-size:12px;color:#526679;line-height:1.6}
@media(max-width:600px){main{padding:12px}header,section{padding:16px}}
@media print{.toolbar,button{display:none!important}.scroll{max-height:none;overflow:visible}main{padding:0}header,section{break-inside:avoid}th{position:static}body{background:white}}
</style></head><body><main>
<header><div class="marca">VALE IA · RELATÓRIO</div><h1>${e(relatorio.texto)}</h1>
<div class="meta"><span><small>Competência</small>${e(relatorio.competencia)}</span>
<span><small>Filial</small>${e(relatorio.filial ?? "Conforme consulta")}</span>
<span><small>Origem</small>${e(relatorio.fonte)}</span>
<span><small>Dados consultados em</small>${e(relatorio.consultadoEm ? new Date(relatorio.consultadoEm).toLocaleString("pt-BR") : "Não informado")}</span></div>
</header>
<section aria-label="Resumo"><div class="cards"><div class="card"><small>Linhas no relatório</small><strong>${tabela.linhas.length}</strong></div>
<div class="card"><small>Colunas</small><strong>${tabela.colunas.length}</strong></div>
<div class="card"><small>Recorte</small><strong>${tabela.parcial ? "Parcial" : "Completo"}</strong></div></div>
${tabela.parcial ? '<p class="aviso">Base parcial. Estes dados não representam totais completos.</p>' : ""}
</section>
${
  grafico.length
    ? `<section><h2>Indicadores da consulta</h2><div class="grafico">${grafico
        .map(
          (item) =>
            `<div><span>${e(item.rotulo)}</span> <strong>${e(item.moeda ? item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : item.valor.toLocaleString("pt-BR"))}</strong>
<div class="barra ${item.valor < 0 ? "negativo" : ""}" style="width:${Math.min(100, (Math.abs(item.valor) / maior) * 100)}%"></div></div>`,
        )
        .join("")}</div></section>`
    : ""
}
<section><h2>Dados</h2>
<div class="toolbar"><input id="busca" aria-label="Filtrar linhas do relatório" placeholder="Buscar nesta tabela…">
<label>Linhas por página <select id="tamanho"><option>25</option><option>50</option><option>100</option><option value="2000">Todas</option></select></label>
<button id="imprimir" type="button">Imprimir / PDF</button></div>
<p id="contagem" role="status"></p><div class="scroll"><table>
<thead><tr>${tabela.colunas.map((coluna) => `<th scope="col"><button type="button">${e(coluna)} ↕</button></th>`).join("")}</tr></thead>
<tbody>${tabela.linhas.map((linha) => `<tr>${linha.map((valor) => `<td>${e(valor)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<div class="toolbar"><button id="anterior" type="button">Anterior</button><span id="pagina"></span><button id="proxima" type="button">Próxima</button></div>
</section>
${relatorio.detalhes ? `<section><h2>Escopo e interpretação</h2><div class="detalhes">${e(relatorio.detalhes)}</div></section>` : ""}
<footer>Snapshot dos registros consultados no Vale Expresso. A busca e a ordenação atuam somente sobre as linhas deste relatório.
Vazio (—), zero e erro mantêm os significados da consulta de origem. O relatório não atualiza dados operacionais.</footer>
</main><script>
(() => {
  const body = document.querySelector('tbody');
  const linhas = Array.from(body.rows);
  const busca = document.getElementById('busca');
  const tamanho = document.getElementById('tamanho');
  let pagina = 0, coluna = -1, sentido = 1;
  const normalizar = valor => valor.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function atualizar() {
    const termo = normalizar(busca.value);
    const filtradas = linhas.filter(linha => normalizar(linha.textContent).includes(termo));
    if(coluna >= 0) filtradas.sort((a,b) => sentido * a.cells[coluna].textContent.localeCompare(b.cells[coluna].textContent,'pt-BR',{numeric:true}));
    const limite = Number(tamanho.value);
    const total = Math.max(1, Math.ceil(filtradas.length / limite));
    pagina = Math.max(0, Math.min(pagina, total - 1));
    linhas.forEach(linha => { linha.hidden = true; });
    filtradas.forEach((linha,i) => { body.appendChild(linha); linha.hidden = i < pagina * limite || i >= (pagina + 1) * limite; });
    document.getElementById('contagem').textContent = filtradas.length + ' de ' + linhas.length + ' linhas';
    document.getElementById('pagina').textContent = 'Página ' + (pagina + 1) + ' de ' + total;
    document.getElementById('anterior').disabled = pagina === 0;
    document.getElementById('proxima').disabled = pagina >= total - 1;
  }
  busca.addEventListener('input', () => { pagina = 0; atualizar(); });
  tamanho.addEventListener('change', () => { pagina = 0; atualizar(); });
  document.querySelectorAll('thead button').forEach((botao,i) => botao.addEventListener('click', () => { sentido = coluna === i ? -sentido : 1; coluna = i; atualizar(); }));
  document.getElementById('anterior').addEventListener('click', () => { pagina--; atualizar(); });
  document.getElementById('proxima').addEventListener('click', () => { pagina++; atualizar(); });
  document.getElementById('imprimir').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => linhas.forEach(linha => { linha.hidden = !normalizar(linha.textContent).includes(normalizar(busca.value)); }));
  window.addEventListener('afterprint', atualizar);
  atualizar();
})();
</script></body></html>`;
}

export function baixarRelatorioHtml(html: string) {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "vale-ia-relatorio.html";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
