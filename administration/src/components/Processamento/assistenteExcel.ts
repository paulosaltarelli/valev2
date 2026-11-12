import ExcelJS from "exceljs";
import { criarModeloVisual } from "./relatorioVisual";

type Celula = string | number | null;

// Esta fábrica também é incorporada ao HTML offline. Não depende de variáveis externas.
export function criarWorkbook(
  Excel: typeof ExcelJS,
  tabela: { colunas: string[]; linhas: Celula[][]; parcial?: boolean },
  filtros: [string, string | undefined][],
  visual?: ReturnType<typeof criarModeloVisual>,
) {
  const plano = visual?.analisar(tabela);
  const numeroExcel = (v: string) =>
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v) &&
    v.replace(/[^0-9]/g, "").length <= 15
      ? Number(v)
      : v;
  const workbook = new Excel.Workbook();
  workbook.creator = "Vale IA";
  const resumo = workbook.addWorksheet("Resumo");
  resumo.columns = [{ width: 30 }, { width: 100 }];
  resumo.addRow([
    "VALE IA · RELATÓRIO",
    "Dados existentes, sem recalcular benefícios",
  ]).font = { bold: true, size: 14, color: { argb: "FF163D69" } };
  resumo.addRows([
    ["Linhas no arquivo", tabela.linhas.length],
    [
      "Recorte",
      tabela.parcial
        ? "Parcial — não representa totais completos"
        : "Conjunto retornado pela consulta",
    ],
    ...filtros.filter(
      ([nome]) =>
        nome === "Resumo" || nome === "Competência" || nome === "Filial",
    ),
  ]);
  if (plano && visual) {
    resumo.addRow([]);
    resumo.addRow(["Indicador do recorte", "Valor"]).font = { bold: true };
    plano.indicadores.forEach((i) => {
      const total = visual.somar(tabela.linhas.map((r) => r[i]));
      const row = resumo.addRow([
        plano.colunas[i].titulo,
        total === null ? null : numeroExcel(total),
      ]);
      if (plano.colunas[i].tipo === "moeda")
        row.getCell(2).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    });
  }
  const dados = workbook.addWorksheet("Dados");
  dados.columns = tabela.colunas.map((nome) => ({
    width: Math.max(15, Math.min(45, nome.length + 8)),
  }));
  const header = dados.addRow(
    plano?.colunas.map((c) => c.titulo) ?? tabela.colunas,
  );
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF163D69" },
  };
  for (const linha of tabela.linhas) {
    const adicionada = dados.addRow(
      linha.map((valor, i) => {
        const meta = plano?.colunas[i];
        if (meta?.tipo === "data" && typeof valor === "string" && visual) {
          const local = visual.formatar(valor, "data");
          const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]*(\d{2}):(\d{2}))?/.exec(
            local,
          );
          const precise = /T\d{2}:\d{2}:(\d{2})(?:\.(\d+))?/.exec(valor);
          if (m)
            return new Date(
              Date.UTC(
                Number(m[3]),
                Number(m[2]) - 1,
                Number(m[1]),
                Number(m[4] ?? 0),
                Number(m[5] ?? 0),
                Number(precise?.[1] ?? 0),
                Number((precise?.[2] ?? "").padEnd(3, "0").slice(0, 3)),
              ),
            );
        }
        if (meta && typeof valor === "string") {
          return ["moeda", "inteiro", "decimal"].includes(meta.tipo)
            ? numeroExcel(valor)
            : valor.slice(0, 30000);
        }
        if (typeof valor !== "string") return valor;
        const numerica =
          /valor|total|pago|desconto|saldo|calculad|final|km|diferen|quantidade|contagem|mem[oó]ria|pend[eê]ncia|funcion[aá]rios (?:sem|com)/i.test(
            tabela.colunas[i],
          ) && !/matr[ií]cula|\bid\b|c[oó]digo/i.test(tabela.colunas[i]);
        if (
          numerica &&
          /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(valor) &&
          valor.replace(/[^0-9]/g, "").length <= 15
        )
          return Number(valor);
        return valor.slice(0, 30000);
      }),
    );
    plano?.colunas.forEach((c, i) => {
      const cell = adicionada.getCell(i + 1);
      if (c.tipo === "moeda") cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      if (c.tipo === "inteiro") cell.numFmt = "#,##0";
      if (c.tipo === "decimal") cell.numFmt = "#,##0.00########";
      if (c.tipo === "data") cell.numFmt = "dd/mm/yyyy hh:mm";
      if (["moeda", "inteiro", "decimal"].includes(c.tipo))
        cell.alignment = { horizontal: "right" };
      if (c.tipo === "texto")
        cell.alignment = { wrapText: true, vertical: "top" };
    });
  }
  dados.views = [{ state: "frozen", ySplit: 1 }];
  if (tabela.colunas.length)
    dados.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: tabela.linhas.length + 1, column: tabela.colunas.length },
    };
  const originais = workbook.addWorksheet("Dados originais");
  originais.columns = tabela.colunas.map((nome) => ({
    width: Math.max(16, Math.min(45, nome.length + 8)),
  }));
  originais.addRow(tabela.colunas).font = { bold: true };
  for (const linha of tabela.linhas)
    originais.addRow(
      linha.map((v) => (typeof v === "string" ? v.slice(0, 30000) : v)),
    );
  originais.views = [{ state: "frozen", ySplit: 1 }];
  const fontes = workbook.addWorksheet("Filtros e fontes");
  fontes.columns = [{ width: 30 }, { width: 110 }];
  fontes.addRow(["Critério", "Valor"]).font = { bold: true };
  fontes.addRows([
    ...filtros.map(([nome, valor]) => [nome, valor?.slice(0, 30000) ?? null]),
    ["Base parcial", tabela.parcial ? "Sim" : "Não"],
    [
      "Dados originais",
      "Preservam os nomes e valores de origem, inclusive a precisão textual de datas e decimais.",
    ],
    [
      "Textos longos",
      tabela.linhas.some((r) =>
        r.some((v) => typeof v === "string" && v.length > 30000),
      )
        ? "Há textos limitados a 30.000 caracteres no Excel. O HTML preserva os textos da consulta."
        : "Sem truncamento de textos.",
    ],
    [
      "Precisão",
      "Valores com mais de 15 dígitos são preservados como texto. Vazio não é zero.",
    ],
    [
      "Filtros locais",
      "Operam somente sobre os dados carregados; não consultam novos registros.",
    ],
  ]);
  if (plano) {
    fontes.addRow([]);
    fontes.addRow(["Coluna de origem", "Título / formato"]).font = {
      bold: true,
    };
    plano.colunas.forEach((c) =>
      fontes.addRow([c.nome, c.titulo + " · " + c.tipo]),
    );
  }
  fontes.views = [{ state: "frozen", ySplit: 1 }];
  return workbook;
}

export async function gerarExcel(
  tabela: { colunas: string[]; linhas: Celula[][] },
  filtros: [string, string | undefined][],
) {
  const workbook = criarWorkbook(ExcelJS, tabela, filtros, criarModeloVisual());
  return workbook.xlsx.writeBuffer();
}
