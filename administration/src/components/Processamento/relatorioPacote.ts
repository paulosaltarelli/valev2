import JSZip from "jszip";
import excelRuntime from "exceljs/dist/exceljs.min.js?raw";
import logo from "../../assets/images/expresso.png?inline";
import { gerarExcel } from "./assistenteExcel";
import {
  criarRelatorioHtml,
  filtrosRelatorio,
  type RelatorioVale,
} from "./relatorioHtml";

export class ErroExportacao extends Error {
  constructor(public readonly etapa: "dados" | "excel" | "html" | "pacote") {
    const mensagens = {
      dados: "Os dados do relatório estão incompletos ou inválidos. Consulte novamente.",
      excel: "Não foi possível preparar o Excel. Tente novamente.",
      html: "Não foi possível preparar o HTML interativo. Tente novamente.",
      pacote: "Não foi possível reunir o HTML e o Excel. Tente novamente.",
    };
    super(mensagens[etapa]);
    this.name = "ErroExportacao";
  }
}

async function etapa<T>(nome: ErroExportacao["etapa"], tarefa: () => T | Promise<T>) {
  try { return await tarefa(); } catch { throw new ErroExportacao(nome); }
}

export async function prepararPacote(relatorio: RelatorioVale) {
  const tabela = relatorio.tabela;
  if (!tabela || !Array.isArray(tabela.colunas) || !Array.isArray(tabela.linhas) ||
    !tabela.colunas.every((c) => typeof c === "string") ||
    !tabela.linhas.every((r) => Array.isArray(r) && r.length === tabela.colunas.length &&
      r.every((v) => v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v))))) {
    throw new ErroExportacao("dados");
  }
  const excel = await etapa("excel", () => gerarExcel(tabela, filtrosRelatorio(relatorio)));
  const bytes = new Uint8Array(excel);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binario += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const html = await etapa("html", () => criarRelatorioHtml(relatorio, {
    logo,
    excelRuntime,
    excelBase64: btoa(binario),
  }));
  const zip = new JSZip();
  zip.file("vale-ia-relatorio.html", html);
  zip.file("vale-ia-dados.xlsx", bytes);
  const pacote = await etapa("pacote", () => zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
  }));
  return {
    html,
    excel: new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    pacote,
  };
}
