import ExcelJS from "exceljs";

type Celula = string | number | null;

export async function gerarExcel(
  tabela: { colunas: string[]; linhas: Celula[][] },
  filtros: [string, string | undefined][],
) {
  const workbook = new ExcelJS.Workbook();
  const dados = workbook.addWorksheet("Resultado");
  dados.addRow(tabela.colunas).font = { bold: true };
  dados.addRows(tabela.linhas);
  dados.views = [{ state: "frozen", ySplit: 1 }];
  workbook.addWorksheet("Filtros").addRows(filtros);
  return workbook.xlsx.writeBuffer();
}
