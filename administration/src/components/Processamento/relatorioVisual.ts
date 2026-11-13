export type CelulaVisual = string | number | null;
export type ColunaVisual = {
  nome: string;
  titulo: string;
  tipo: "moeda" | "inteiro" | "decimal" | "data" | "texto" | "identificador";
  tecnica: boolean;
  agregavel: boolean;
};
export type SugestaoVisual = {
  composicao?:{layout:"executivo"|"editorial"|"analitico";secoes:("resumo"|"indicadores"|"grafico"|"composicao"|"detalhe")[];origem:"ia"|"automatico"};
  titulo?: string;
  grafico?: "barras" | "linha" | "rosca";
  dimensao?: string;
  metrica?: string | null;
};
export type PlanoVisual = {
  titulo: string;
  perfil: string;
  dimensao: number;
  metrica: number;
  grafico: "barras" | "linha";
  indicadores: number[];
  colunas: ColunaVisual[];
  orientacao: string;
};

// Fábrica autossuficiente: a mesma lógica é usada no chat e no HTML offline.
export function criarModeloVisual() {
  const normal = (v: unknown) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const chave = (v: string) => normal(v).replace(/[^a-z0-9]/g, "");
  const numeric = (v: unknown) =>
    v !== null &&
    String(v).length <= 100 &&
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(v));
  const nomes: Record<string, string> = {
    filialid: "Código da filial",
    qtdeexecucoes: "Execuções",
    ultimaexecucao: "Última execução",
    qtderegistros: "Registros",
    qtdregistros: "Registros",
    quantidaderegistros: "Registros",
    qtdecompago: "Registros com pagamento",
    qtdecomdesconto: "Registros com desconto",
    totalpago: "Total pago",
    totaldesconto: "Total de descontos",
    totaldescontos: "Total de descontos",
    totalfinanceiro: "Total financeiro",
    funcionariobaseid: "Código do registro",
    nome: "Nome",
    competencia: "Competência",
    matricula: "Matrícula",
  };
  const titulo = (nome: string) =>
    (Object.hasOwn(nomes, chave(nome)) ? nomes[chave(nome)] : undefined) ??
    nome
      .replace(/([a-zá-ú0-9])([A-ZÁ-Ú])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\bQtde\b|\bQtd\b/gi, "Quantidade");
  const coluna = (nome: string, valores: CelulaVisual[]): ColunaVisual => {
    const n = chave(nome),
      preenchidos = valores.filter((v) => v !== null);
    const tecnica = /^(?:id|codigo)|id$/.test(n);
    const identificador =
      tecnica ||
      /matricula|chapa|cpf|cnpj|telefone/.test(n) ||
      n === "execucao";
    const data =
      /data|ultimaexecucao|atualizad|consultadoem/.test(n) ||
      (preenchidos.length > 0 &&
        preenchidos.every((v) => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(String(v))));
    const quantidade =
      /qtde|qtd|quantidade|contagem|registros|resultados|funcionarios|memorias|variaveis|^dias|execucoes/.test(
        n,
      );
    const numero = preenchidos.length > 0 && preenchidos.every(numeric);
    const moeda =
      !quantidade &&
      /valor|pago|desconto|saldo|financeiro|calculado|ajustado|finallocal|reembolso/.test(
        n,
      );
    const tipo = data
      ? "data"
      : identificador
        ? "identificador"
        : numero && moeda
          ? "moeda"
          : numero
            ? quantidade || preenchidos.every((v) => /^-?\d+$/.test(String(v)))
              ? "inteiro"
              : "decimal"
            : "texto";
    const agregavel =
      !/media|medio|percent|porcent|taxa|razao|indice|global|geral|distint|unico/.test(
        n,
      );
    return { nome, titulo: titulo(nome), tipo, tecnica, agregavel };
  };
  const decimal = (v: unknown) => {
    const s = String(v);
    return { n: BigInt(s.replace(".", "")), c: (s.split(".")[1] || "").length };
  };
  const somar = (vs: unknown[]) => {
    const xs = vs.filter(numeric).map(decimal);
    if (!xs.length) return null;
    const c = Math.max(...xs.map((x) => x.c)),
      n = xs.reduce((a, x) => a + x.n * 10n ** BigInt(c - x.c), 0n);
    const s = (n < 0n ? -n : n).toString().padStart(c + 1, "0");
    return (n < 0n ? "-" : "") + (c ? s.slice(0, -c) + "." + s.slice(-c) : s);
  };
  const formatar = (v: unknown, tipo: ColunaVisual["tipo"] = "texto") => {
    if (v === null || v === undefined) return "—";
    const s = String(v);
    if (tipo === "data") {
      if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
        const d = new Date(s);
        if (Number.isFinite(d.getTime()))
          return d.toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
      }
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
      return m
        ? `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : "")
        : s;
    }
    if (["moeda", "inteiro", "decimal"].includes(tipo) && numeric(v)) {
      const [a, b] = s.split("."),
        agrupado = a.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      return (
        (tipo === "moeda" ? "R$ " : "") +
        agrupado +
        (tipo === "moeda" ? "," + (b || "").padEnd(2, "0") : b ? "," + b : "")
      );
    }
    return s;
  };
  const comparar = (a: unknown, b: unknown) => {
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    if (numeric(a) && numeric(b)) {
      const x = decimal(a),
        y = decimal(b),
        c = Math.max(x.c, y.c),
        n = x.n * 10n ** BigInt(c - x.c),
        m = y.n * 10n ** BigInt(c - y.c);
      return n < m ? -1 : n > m ? 1 : 0;
    }
    const mes = (v: unknown) => /^(\d{2})\/(\d{4})$/.exec(String(v));
    const x = mes(a),
      y = mes(b);
    if (x && y)
      return (
        Number(x[2]) * 12 + Number(x[1]) - (Number(y[2]) * 12 + Number(y[1]))
      );
    return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
  };
  const analisar = (
    tabela: { colunas: string[]; linhas: CelulaVisual[][] },
    sugestao?: SugestaoVisual,
  ): PlanoVisual => {
    const colunas = tabela.colunas.map((c, i) =>
      coluna(
        c,
        tabela.linhas.map((r) => r[i]),
      ),
    );
    const metricas = colunas.flatMap((c, i) =>
      ["moeda", "inteiro", "decimal"].includes(c.tipo) ? [i] : [],
    );
    const moedas = metricas.filter((i) => colunas[i].tipo === "moeda");
    const filial = colunas.findIndex((c) =>
      /^filial$|^formula$/i.test(normal(c.nome)),
    );
    const tempo = colunas.findIndex((c) =>
      /^(competencia|periodo|data|mes)$/.test(chave(c.nome)),
    );
    const erros = colunas.some((c) =>
      /erro|falha|estadoatual|situacao/.test(chave(c.nome)),
    );
    const comparacao =
      colunas.some((c) => /diferenca|variacao|anterior/.test(chave(c.nome))) &&
      metricas.length > 0;
    const perfil = comparacao
      ? "Comparação"
      : tempo >= 0 && filial < 0
        ? "Evolução"
        : moedas.length
          ? "Financeiro"
          : erros
            ? "Diagnóstico"
            : "Visão operacional";
    let dimensao =
      filial >= 0
        ? filial
        : tempo >= 0
          ? tempo
          : Math.max(
              0,
              colunas.findIndex((c) => c.tipo === "texto" && !c.tecnica),
            );
    let metrica =
      moedas.find((i) => chave(colunas[i].nome) === "totalfinanceiro") ??
      moedas.find((i) =>
        /valorfinal|finallocal/.test(chave(colunas[i].nome)),
      ) ??
      moedas.find((i) => chave(colunas[i].nome) === "totalpago") ??
      moedas[0] ??
      -1;
    if (perfil === "Diagnóstico") metrica = -1;
    const sd = sugestao?.dimensao
      ? tabela.colunas.indexOf(sugestao.dimensao)
      : -1;
    const sm = sugestao?.metrica
      ? tabela.colunas.indexOf(sugestao.metrica)
      : -1;
    if (sd >= 0 && !colunas[sd].tecnica && colunas[sd].tipo !== "identificador")
      dimensao = sd;
    if (sm >= 0 && metricas.includes(sm)) metrica = sm;
    const temporal =
      colunas[dimensao]?.tipo === "data" ||
      /^(competencia|periodo|mes)$/.test(chave(colunas[dimensao]?.nome ?? ""));
    const grafico =
      temporal && (perfil === "Evolução" || sugestao?.grafico === "linha")
        ? "linha"
        : "barras";
    const indicadores = (moedas.length ? moedas : metricas)
      .filter((i) => i !== dimensao && colunas[i].agregavel)
      .slice(0, 3);
    return {
      titulo:
        sugestao?.titulo?.trim().slice(0, 100) ||
        (perfil === "Financeiro"
          ? "Visão financeira por " + (filial >= 0 ? "filial" : "registro")
          : perfil === "Diagnóstico"
            ? "Diagnóstico de erros e pendências"
            : perfil === "Comparação"
              ? "Comparativo do período"
              : perfil === "Evolução"
                ? "Evolução dos resultados"
                : "Painel de resultados"),
      perfil,
      dimensao,
      metrica,
      grafico,
      indicadores,
      colunas,
      orientacao:
        perfil === "Financeiro"
          ? "Compare os valores e selecione uma filial para examinar os registros."
          : perfil === "Diagnóstico"
            ? "Localize os grupos com erro e abra as evidências de cada registro."
            : perfil === "Comparação"
              ? "Compare os indicadores sem confundir ausência de informação com zero."
              : "Selecione um grupo para passar do resumo ao detalhe.",
    };
  };
  return { normal, numeric, coluna, formatar, somar, comparar, analisar };
}
