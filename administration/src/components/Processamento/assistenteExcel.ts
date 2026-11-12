import ExcelJS from "exceljs";

type Celula = string | number | null;

// Esta fábrica também é incorporada ao HTML offline. Não depende de variáveis externas.
export function criarWorkbook(
  Excel: typeof ExcelJS,
  tabela: { colunas: string[]; linhas: Celula[][]; parcial?: boolean },
  filtros: [string, string | undefined][],
) {
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
  const dados = workbook.addWorksheet("Dados");
  dados.columns = tabela.colunas.map((nome) => ({
    width: Math.max(15, Math.min(45, nome.length + 8)),
  }));
  const header = dados.addRow(tabela.colunas);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF163D69" },
  };
  for (const linha of tabela.linhas) {
    dados.addRow(
      linha.map((valor, i) => {
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
  }
  dados.views = [{ state: "frozen", ySplit: 1 }];
  if (tabela.colunas.length)
    dados.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: tabela.linhas.length + 1, column: tabela.colunas.length },
    };
  const fontes = workbook.addWorksheet("Filtros e fontes");
  fontes.columns = [{ width: 30 }, { width: 110 }];
  fontes.addRow(["Critério", "Valor"]).font = { bold: true };
  fontes.addRows([
    ...filtros.map(([nome, valor]) => [nome, valor?.slice(0, 30000) ?? null]),
    ["Base parcial", tabela.parcial ? "Sim" : "Não"],
    [
      "Precisão",
      "Valores com mais de 15 dígitos são preservados como texto. Vazio não é zero.",
    ],
    [
      "Filtros locais",
      "Operam somente sobre os dados carregados; não consultam novos registros.",
    ],
  ]);
  fontes.views = [{ state: "frozen", ySplit: 1 }];
  return workbook;
}

export async function gerarExcel(
  tabela: { colunas: string[]; linhas: Celula[][] },
  filtros: [string, string | undefined][],
) {
  const workbook = criarWorkbook(ExcelJS, tabela, filtros);
  return workbook.xlsx.writeBuffer();
}
