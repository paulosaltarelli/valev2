import type {
  criarModeloVisual,
  CelulaVisual,
  PlanoVisual,
} from "./relatorioVisual";
import type { criarWorkbook } from "./assistenteExcel";

// Código fixo do produto, incorporado ao HTML. Dados entram apenas por textContent.
export function iniciarRelatorio(
  dados: {
    tabela: { colunas: string[]; linhas: CelulaVisual[][]; parcial: boolean };
    filtros: [string, string | undefined][];
    plano: PlanoVisual;
  },
  visual: ReturnType<typeof criarModeloVisual>,
  workbook: typeof criarWorkbook,
) {
  const $ = (id: string) => document.getElementById(id)!;
  const select = (id: string) => $(id) as HTMLSelectElement;
  const input = (id: string) => $(id) as HTMLInputElement;
  const { tabela, plano } = dados,
    { colunas, linhas } = tabela;
  const { formatar, somar, comparar, normal } = visual;
  let pagina = 0,
    sort = -1,
    sentido = 1,
    selecao: { i: number; key: string } | null = null;
  let recorte: CelulaVisual[][] = [];
  const filtros: {
    el: HTMLSelectElement | HTMLInputElement;
    select: boolean;
    i: number;
  }[] = [];
  const valor = (v: unknown) => (v === null ? "Sem informação" : String(v));
  const option = (el: HTMLSelectElement, value: string, label: string) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    el.appendChild(o);
  };
  const formatMetric = (v: unknown, m: number) =>
    formatar(v, m < 0 ? "inteiro" : plano.colunas[m].tipo);
  const visao = (analitica: boolean) => {
    $("analitico").hidden = !analitica;
    $("visao-sintetica").setAttribute("aria-pressed", String(!analitica));
    $("visao-analitica").setAttribute("aria-pressed", String(analitica));
  };
  const popularFiltro = (i: number, container: HTMLElement) => {
    const c = plano.colunas[i],
      label = document.createElement("label"),
      caption = document.createElement("span");
    caption.textContent = c.titulo;
    label.appendChild(caption);
    const valores = [
      ...new Map(linhas.map((r) => [JSON.stringify(r[i]), r[i]])).values(),
    ];
    const lista =
      valores.length <= 80 &&
      valores.every((v) => String(v ?? "").length < 100);
    const el = document.createElement(lista ? "select" : "input") as
      | HTMLSelectElement
      | HTMLInputElement;
    el.setAttribute("aria-label", "Filtrar " + c.titulo);
    if (lista) {
      option(el as HTMLSelectElement, "", "Todos");
      valores
        .sort(comparar)
        .forEach((v) =>
          option(
            el as HTMLSelectElement,
            JSON.stringify(v),
            formatar(v, c.tipo),
          ),
        );
    } else {
      (el as HTMLInputElement).type = "search";
      (el as HTMLInputElement).placeholder = "Buscar nesta coluna";
    }
    el.addEventListener(lista ? "change" : "input", () => {
      pagina = 0;
      atualizar();
    });
    label.appendChild(el);
    container.appendChild(label);
    filtros.push({ el, select: lista, i });
  };
  const principais = [
    ...new Set([
      plano.dimensao,
      ...plano.colunas.flatMap((c, i) =>
        /estado|status|situacao|funcionario|formula/.test(normal(c.nome))
          ? [i]
          : [],
      ),
    ]),
  ]
    .filter((i) => i >= 0 && i < colunas.length)
    .slice(0, 3);
  principais.forEach((i) => popularFiltro(i, $("filtros-principais")));
  plano.colunas.forEach((c, i) => {
    if (!principais.includes(i)) popularFiltro(i, $("filtros-adicionais"));
    if (!c.tecnica && c.tipo !== "identificador")
      option(select("dimensao"), String(i), c.titulo);
  });
  if (!select("dimensao").options.length)
    plano.colunas.forEach((c, i) =>
      option(select("dimensao"), String(i), c.titulo),
    );
  select("dimensao").value = String(plano.dimensao);
  option(select("metrica"), "-1", "Contagem de registros");
  plano.colunas.forEach((c, i) => {
    if (["moeda", "inteiro", "decimal"].includes(c.tipo))
      option(select("metrica"), String(i), c.titulo);
  });
  select("metrica").value = String(plano.metrica);
  select("tipo-grafico").value = plano.grafico;
  const filterRows = (comSelecao: boolean) =>
    linhas.filter(
      (r) =>
        normal(r.map(valor).join(" ")).includes(normal(input("busca").value)) &&
        filtros.every(
          (f) =>
            !f.el.value ||
            (f.select
              ? JSON.stringify(r[f.i]) === f.el.value
              : normal(r[f.i]).includes(normal(f.el.value))),
        ) &&
        (!comSelecao ||
          !selecao ||
          JSON.stringify(r[selecao.i]) === selecao.key),
    );
  const grupos = (rs: CelulaVisual[][], d: number, m: number) => {
    const map = new Map<
      string,
      {
        key: string;
        label: CelulaVisual;
        values: CelulaVisual[];
        count: number;
      }
    >();
    rs.forEach((r) => {
      const key = JSON.stringify(r[d]);
      if (!map.has(key))
        map.set(key, { key, label: r[d], values: [], count: 0 });
      const g = map.get(key)!;
      g.count++;
      if (m >= 0) g.values.push(r[m]);
    });
    return [...map.values()].map((g) => ({
      ...g,
      value:
        m < 0
          ? String(g.count)
          : plano.colunas[m].agregavel
            ? somar(g.values)
            : g.values.length === 1
              ? g.values[0] === null
                ? null
                : String(g.values[0])
              : null,
    }));
  };
  type Grupo = ReturnType<typeof grupos>[number];
  const escolher = (i: number, key: string) => {
    selecao = selecao?.i === i && selecao.key === key ? null : { i, key };
    pagina = 0;
    visao(true);
    atualizar();
  };
  const ativo = (d: number, g: Grupo) =>
    !!selecao && selecao.i === d && selecao.key === g.key;
  const cores = [
    "#087eaa",
    "#18a89b",
    "#4e65b8",
    "#d29a36",
    "#9872b8",
    "#647f94",
    "#cf7565",
    "#8ba946",
  ];
  function kpis() {
    const container = $("indicadores");
    container.replaceChildren();
    const criar = (
      label: string,
      v: unknown,
      tipo: "inteiro" | "moeda" | "decimal" = "inteiro",
      nota = "",
    ) => {
      const card = document.createElement("article");
      card.className = "kpi";
      const caption = document.createElement("span"),
        strong = document.createElement("strong"),
        small = document.createElement("small");
      caption.textContent = label;
      strong.textContent = formatar(v, tipo);
      strong.title = String(v ?? "Sem informação");
      small.textContent = nota;
      card.append(caption, strong, small);
      container.appendChild(card);
    };
    criar(
      "Registros no recorte",
      recorte.length,
      "inteiro",
      `${linhas.length} carregados na consulta`,
    );
    const branch = plano.colunas.findIndex((c) => normal(c.nome) === "filial");
    if (branch >= 0 && plano.perfil === "Diagnóstico")
      criar(
        "Filiais no recorte",
        new Set(recorte.filter((r) => r[branch] !== null).map((r) => r[branch]))
          .size,
        "inteiro",
        "Filiais com registros no recorte",
      );
    plano.indicadores
      .slice(0, branch >= 0 && plano.perfil === "Diagnóstico" ? 2 : 3)
      .forEach((i) => {
        const c = plano.colunas[i];
        const ausentes = recorte.filter((r) => r[i] === null).length;
        criar(
          c.titulo,
          somar(recorte.map((r) => r[i])),
          c.tipo as "moeda" | "inteiro" | "decimal",
          ausentes
            ? `${ausentes} registro(s) sem valor`
            : "Soma dos valores informados",
        );
      });
  }
  function barras(gs: Grupo[], d: number, m: number) {
    const container = $("grafico");
    container.replaceChildren();
    const max = Math.max(1, ...gs.map((g) => Math.abs(Number(g.value) || 0)));
    gs.slice(0, 15).forEach((g) => {
      const b = document.createElement("button");
      b.className = "bar";
      b.type = "button";
      b.setAttribute("aria-pressed", String(ativo(d, g)));
      const label = document.createElement("span"),
        track = document.createElement("span"),
        fill = document.createElement("span"),
        value = document.createElement("strong");
      label.textContent = valor(g.label);
      label.title = valor(g.label);
      track.className = "bar-track";
      fill.className = "bar-fill";
      if (Number(g.value) < 0) fill.classList.add("negativo");
      fill.style.width =
        (Number.isFinite(max)
          ? (100 * Math.abs(Number(g.value) || 0)) / max
          : 0) + "%";
      track.appendChild(fill);
      value.textContent = formatMetric(g.value, m);
      value.title = String(g.value ?? "Sem informação");
      b.append(label, track, value);
      b.onclick = () => escolher(d, g.key);
      container.appendChild(b);
    });
    $("grafico-nota").textContent =
      gs.length > 15
        ? "15 maiores grupos. Os indicadores e o Excel incluem todo o recorte."
        : gs.length
          ? "Selecione uma barra para abrir o detalhe."
          : "Não há dados para os filtros selecionados.";
  }
  const svgEl = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number> = {},
  ) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  };
  function linha(gs: Grupo[], d: number, m: number) {
    const container = $("grafico");
    container.replaceChildren();
    const data = gs
      .filter((g) => g.value !== null && Number.isFinite(Number(g.value)))
      .sort((a, b) => comparar(a.label, b.label));
    if (data.length < 2) {
      barras(gs, d, m);
      $("grafico-nota").textContent =
        "São necessários dois pontos com valor para uma evolução. Exibindo barras.";
      return;
    }
    const plot = svgEl("svg", {
        viewBox: "0 0 700 260",
        role: "group",
        "aria-label":
          "Evolução de " + (m < 0 ? "registros" : plano.colunas[m].titulo),
      }),
      ys = data.map((g) => Number(g.value)),
      min = Math.min(0, ...ys),
      max = Math.max(1, ...ys),
      x = (i: number) => 55 + (i * 600) / Math.max(1, data.length - 1),
      y = (n: number) => 210 - ((n - min) / (max - min)) * 170;
    [0, 1, 2, 3].forEach((i) => {
      const v = min + ((max - min) * i) / 3;
      plot.appendChild(
        svgEl("line", {
          x1: 55,
          x2: 660,
          y1: y(v),
          y2: y(v),
          stroke: "#e3ebf1",
        }),
      );
      const t = svgEl("text", { x: 5, y: y(v) + 4, class: "axis" });
      t.textContent = Number(v).toLocaleString("pt-BR", {
        notation: "compact",
        maximumFractionDigits: 1,
      });
      plot.appendChild(t);
    });
    plot.appendChild(
      svgEl("polyline", {
        points: data.map((g, i) => `${x(i)},${y(Number(g.value))}`).join(" "),
        fill: "none",
        stroke: "#087eaa",
        "stroke-width": 3,
      }),
    );
    data.forEach((g, i) => {
      const point = svgEl("circle", {
        cx: x(i),
        cy: y(Number(g.value)),
        r: ativo(d, g) ? 8 : 6,
        fill: ativo(d, g) ? "#d29a36" : "#087eaa",
        tabindex: 0,
        role: "button",
        "aria-label": `${valor(g.label)}: ${formatMetric(g.value, m)}`,
      });
      const title = svgEl("title");
      title.textContent = `${valor(g.label)} · ${formatMetric(g.value, m)}`;
      point.appendChild(title);
      point.onclick = () => escolher(d, g.key);
      point.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          escolher(d, g.key);
        }
      };
      plot.appendChild(point);
      if (data.length <= 12 || i === 0 || i === data.length - 1) {
        const t = svgEl("text", {
          x: x(i),
          y: 242,
          "text-anchor": "middle",
          class: "axis",
        });
        t.textContent = formatar(g.label, plano.colunas[d].tipo).slice(0, 18);
        plot.appendChild(t);
      }
    });
    container.appendChild(plot);
    $("grafico-nota").textContent =
      "Selecione um ponto para abrir os registros que compõem o período.";
  }
  function composicao(base: CelulaVisual[][], d: number, m: number) {
    const estado = plano.colunas.findIndex((c) =>
        /estado|status|situacao/.test(normal(c.nome)),
      ),
      dim = plano.perfil === "Diagnóstico" && estado >= 0 ? estado : d,
      met = dim === estado && plano.perfil === "Diagnóstico" ? -1 : m;
    const gs = grupos(base, dim, met)
        .filter((g) => g.value !== null)
        .sort((a, b) =>
          a.value === null
            ? b.value === null
              ? 0
              : 1
            : b.value === null
              ? -1
              : comparar(b.value, a.value),
        ),
      container = $("composicao");
    container.replaceChildren();
    $("composicao-titulo").textContent =
      dim === estado ? "Situação dos registros" : "Participação no recorte";
    const total = Number(somar(gs.map((g) => g.value))),
      permitido =
        (met < 0 || plano.colunas[met].agregavel) &&
        gs.length > 0 &&
        gs.length <= 8 &&
        total > 0 &&
        Number.isFinite(total) &&
        gs.every((g) => Number(g.value) >= 0);
    if (!permitido) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = gs.length
        ? "Uma composição percentual não é adequada a estes dados. Consulte o ranking e os valores exatos."
        : "Não há valores informados para composição.";
      container.appendChild(p);
      return;
    }
    const plot = svgEl("svg", {
      viewBox: "0 0 220 220",
      class: "donut",
      role: "group",
      "aria-label": "Participação por " + plano.colunas[dim].titulo,
    });
    plot.appendChild(
      svgEl("circle", {
        cx: 110,
        cy: 110,
        r: 76,
        fill: "none",
        stroke: "#edf3f7",
        "stroke-width": 28,
      }),
    );
    let offset = 0;
    const legenda = document.createElement("div");
    legenda.className = "legend";
    gs.forEach((g, i) => {
      const share = (Number(g.value) / total) * 100,
        ring = svgEl("circle", {
          cx: 110,
          cy: 110,
          r: 76,
          fill: "none",
          stroke: cores[i % cores.length],
          "stroke-width": ativo(dim, g) ? 34 : 28,
          pathLength: 100,
          "stroke-dasharray": `${share} ${100 - share}`,
          "stroke-dashoffset": -offset,
          transform: "rotate(-90 110 110)",
          tabindex: 0,
          role: "button",
          "aria-label": valor(g.label) + ": " + share.toFixed(1) + "%",
        });
      offset += share;
      const t = svgEl("title");
      t.textContent = valor(g.label) + " · " + formatMetric(g.value, met);
      ring.appendChild(t);
      ring.onclick = () => escolher(dim, g.key);
      ring.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          escolher(dim, g.key);
        }
      };
      plot.appendChild(ring);
      const b = document.createElement("button"),
        dot = document.createElement("i"),
        name = document.createElement("span"),
        v = document.createElement("strong");
      b.type = "button";
      b.setAttribute("aria-pressed", String(ativo(dim, g)));
      dot.style.background = cores[i % cores.length];
      name.textContent = valor(g.label);
      name.title = valor(g.label);
      v.textContent =
        share.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
      b.append(dot, name, v);
      b.onclick = () => escolher(dim, g.key);
      legenda.appendChild(b);
    });
    const center = svgEl("text", {
      x: 110,
      y: 108,
      "text-anchor": "middle",
      class: "donut-label",
    });
    center.textContent = gs.length + " grupos";
    plot.appendChild(center);
    const caption = svgEl("text", {
      x: 110,
      y: 128,
      "text-anchor": "middle",
      class: "axis",
    });
    caption.textContent = "do recorte";
    plot.appendChild(caption);
    container.append(plot, legenda);
  }
  function tabelaDetalhe(imprimir = false) {
    const indices = plano.colunas.flatMap((c, i) =>
        !c.tecnica || input("tecnicos").checked ? [i] : [],
      ),
      head = $("cabecalho");
    head.replaceChildren();
    indices.forEach((i) => {
      const th = document.createElement("th"),
        b = document.createElement("button");
      b.textContent =
        plano.colunas[i].titulo +
        (sort === i ? (sentido === 1 ? " ↑" : " ↓") : " ↕");
      b.title = "Coluna de origem: " + colunas[i];
      b.onclick = () => {
        sentido = sort === i ? -sentido : 1;
        sort = i;
        atualizar();
      };
      th.appendChild(b);
      head.appendChild(th);
    });
    const tamanho = Number(select("tamanho").value),
      total = Math.max(1, Math.ceil(recorte.length / tamanho));
    pagina = Math.max(0, Math.min(pagina, total - 1));
    const body = $("corpo");
    body.replaceChildren();
    (imprimir
      ? recorte
      : recorte.slice(pagina * tamanho, (pagina + 1) * tamanho)
    ).forEach((row) => {
      const tr = document.createElement("tr");
      indices.forEach((i) => {
        const td = document.createElement("td"),
          meta = plano.colunas[i],
          text = formatar(row[i], meta.tipo);
        td.className = meta.tipo;
        td.title = row[i] === null ? "Sem informação" : String(row[i]);
        if (text.length > 180) {
          const details = document.createElement("details"),
            summary = document.createElement("summary"),
            p = document.createElement("p");
          summary.textContent = text.slice(0, 155) + "…";
          p.textContent = text;
          details.append(summary, p);
          td.appendChild(details);
        } else td.textContent = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    if (!recorte.length) {
      const tr = document.createElement("tr"),
        td = document.createElement("td");
      td.colSpan = Math.max(1, indices.length);
      td.className = "empty";
      td.textContent = "Nenhum registro corresponde a este recorte.";
      tr.appendChild(td);
      body.appendChild(tr);
    }
    $("contagem").textContent =
      recorte.length + " de " + linhas.length + " registros";
    $("pagina").textContent = "Página " + (pagina + 1) + " de " + total;
    ($("anterior") as HTMLButtonElement).disabled = pagina === 0;
    ($("proxima") as HTMLButtonElement).disabled = pagina >= total - 1;
  }
  function atualizar() {
    recorte = filterRows(true);
    if (sort >= 0)
      recorte.sort((a, b) =>
        a[sort] === null
          ? b[sort] === null
            ? 0
            : 1
          : b[sort] === null
            ? -1
            : sentido * comparar(a[sort], b[sort]),
      );
    const d = Number(select("dimensao").value),
      m = Number(select("metrica").value),
      base = filterRows(false),
      gs = grupos(base, d, m).sort((a, b) =>
        a.value === null
          ? b.value === null
            ? 0
            : 1
          : b.value === null
            ? -1
            : comparar(b.value, a.value),
      );
    kpis();
    $("selecao").hidden = !selecao;
    $("selecao-texto").textContent = selecao
      ? plano.colunas[selecao.i].titulo + ": " + valor(JSON.parse(selecao.key))
      : "";
    const temporal =
      plano.colunas[d]?.tipo === "data" ||
      /^(competencia|periodo|mes)$/.test(normal(colunas[d]));
    if (select("tipo-grafico").value === "linha" && temporal) linha(gs, d, m);
    else {
      barras(gs, d, m);
      if (select("tipo-grafico").value === "linha")
        $("grafico-nota").textContent =
          "Sem eixo temporal nesta dimensão. Exibindo ranking em barras.";
    }
    composicao(base, d, m);
    tabelaDetalhe();
    $("export-status").textContent = "";
    $("recorte-status").textContent =
      recorte.length === linhas.length
        ? "Exibindo toda a base retornada"
        : "Recorte local: " +
          recorte.length +
          " de " +
          linhas.length +
          " registros";
  }
  input("busca").oninput = () => {
    pagina = 0;
    atualizar();
  };
  select("dimensao").onchange = () => {
    selecao = null;
    atualizar();
  };
  select("metrica").onchange = atualizar;
  select("tipo-grafico").onchange = atualizar;
  select("tamanho").onchange = () => {
    pagina = 0;
    tabelaDetalhe();
  };
  input("tecnicos").onchange = () => tabelaDetalhe();
  $("limpar").onclick = () => {
    input("busca").value = "";
    filtros.forEach((f) => (f.el.value = ""));
    selecao = null;
    pagina = 0;
    atualizar();
  };
  $("remover-selecao").onclick = () => {
    selecao = null;
    atualizar();
  };
  $("anterior").onclick = () => {
    pagina--;
    tabelaDetalhe();
  };
  $("proxima").onclick = () => {
    pagina++;
    tabelaDetalhe();
  };
  $("visao-sintetica").onclick = () => visao(false);
  $("visao-analitica").onclick = () => visao(true);
  $("imprimir").onclick = () => window.print();
  let ocultoAntesImpressao = false;
  window.addEventListener("beforeprint", () => {
    ocultoAntesImpressao = $("analitico").hidden;
    $("analitico").hidden = false;
    tabelaDetalhe(true);
  });
  window.addEventListener("afterprint", () => {
    $("analitico").hidden = ocultoAntesImpressao;
    tabelaDetalhe();
  });
  $("excel-filtrado").onclick = async () => {
    const b = $("excel-filtrado") as HTMLButtonElement,
      rs = recorte.slice();
    b.disabled = true;
    $("export-status").textContent = "Preparando Excel do recorte…";
    try {
      const locais: [string, string][] = filtros
        .filter((f) => f.el.value)
        .map((f) => [
          "Filtro local · " + plano.colunas[f.i].titulo,
          f.select ? valor(JSON.parse(f.el.value)) : f.el.value,
        ]);
      if (input("busca").value)
        locais.push(["Busca local", input("busca").value]);
      if (selecao)
        locais.push([
          "Seleção no gráfico",
          plano.colunas[selecao.i].titulo +
            " = " +
            valor(JSON.parse(selecao.key)),
        ]);
      const Excel = (
          window as unknown as { ExcelJS: Parameters<typeof workbook>[0] }
        ).ExcelJS,
        bytes = await workbook(
          Excel,
          { colunas, linhas: rs, parcial: tabela.parcial },
          [...dados.filtros, ...locais],
          visual,
        ).xlsx.writeBuffer();
      const url = URL.createObjectURL(
          new Blob([bytes], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "vale-ia-recorte.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      $("export-status").textContent =
        "Excel gerado com " + rs.length + " registro(s) do recorte.";
    } catch {
      $("export-status").textContent =
        "Não foi possível gerar o recorte. O Excel da consulta continua disponível.";
    } finally {
      b.disabled = false;
    }
  };
  atualizar();
}
