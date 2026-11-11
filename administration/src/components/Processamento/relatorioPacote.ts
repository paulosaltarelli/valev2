import JSZip from "jszip";
import excelRuntime from "exceljs/dist/exceljs.min.js?raw";
import logo from "../../assets/images/expresso.png?inline";
import { gerarExcel } from "./assistenteExcel";
import {
  criarRelatorioHtml,
  filtrosRelatorio,
  type RelatorioVale,
} from "./relatorioHtml";

export async function prepararPacote(relatorio: RelatorioVale) {
  if (!relatorio.tabela) throw new Error("A consulta não retornou tabela.");
  const excel = await gerarExcel(relatorio.tabela, filtrosRelatorio(relatorio));
  const bytes = new Uint8Array(excel);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binario += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const html = criarRelatorioHtml(relatorio, {
    logo,
    excelRuntime,
    excelBase64: btoa(binario),
  });
  const zip = new JSZip();
  zip.file("vale-ia-relatorio.html", html);
  zip.file("vale-ia-dados.xlsx", bytes);
  const pacote = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
  });
  return {
    html,
    excel: new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    pacote,
  };
}
