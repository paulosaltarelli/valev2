import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createServer } from "vite";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const output = path.resolve(process.argv[2] || "../qa-relatorios");
await fs.mkdir(output, { recursive: true });
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { prepararPacote } = await vite.ssrLoadModule(
    "/src/components/Processamento/relatorioPacote.ts",
  );
  const tabela = {
    colunas: ["Filial", "Estado", "Calculado", "Matrícula"],
    parcial: false,
    linhas: [
      ["Alfa", "Erro", null, "0001"],
      ["Alfa", "Calculado", "0.00", "0002"],
      ["Beta", "Calculado", "1250.50", "0003"],
      ["Beta", "Calculado", "9999999999999999.99", "0004"],
      [
        "Teste de conteúdo",
        "</script><img src=x onerror=alert(1)>",
        "2.00",
        "0005",
      ],
    ],
  };
  const pacote = await prepararPacote({
    texto: "Relatório de validação — dados fictícios",
    competencia: "10/2026",
    filial: "Todas as filiais",
    fonte: "Fixture de teste",
    consultadoEm: "2026-11-11T12:00:00Z",
    tabela,
  });
  assert(pacote.html.includes("img-src data:"));
  assert(pacote.html.includes("connect-src 'none'"));
  assert(!pacote.html.includes("</script><img src=x onerror=alert(1)>"));
  const scripts = [
    ...pacote.html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
  ];
  assert.equal(scripts.length, 3);
  for (const match of scripts.slice(1)) new vm.Script(match[1]);
  const xlsx = Buffer.from(await pacote.excel.arrayBuffer());
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(xlsx);
  assert.deepEqual(
    book.worksheets.map((s) => s.name),
    ["Resumo", "Dados", "Filtros e fontes"],
  );
  const dados = book.getWorksheet("Dados");
  assert.equal(dados.rowCount, 6);
  assert.equal(dados.getCell("C2").value, null);
  assert.equal(dados.getCell("C3").value, 0);
  assert.equal(dados.getCell("D3").value, "0002");
  assert.equal(dados.getCell("C5").value, "9999999999999999.99");
  const zipBytes = Buffer.from(await pacote.pacote.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBytes);
  assert.deepEqual(Object.keys(zip.files).sort(), [
    "vale-ia-dados.xlsx",
    "vale-ia-relatorio.html",
  ]);
  assert.equal(
    await zip.file("vale-ia-relatorio.html").async("string"),
    pacote.html,
  );
  assert.deepEqual(
    await zip.file("vale-ia-dados.xlsx").async("nodebuffer"),
    xlsx,
  );
  await fs.writeFile(path.join(output, "relatorio.html"), pacote.html);
  await fs.writeFile(path.join(output, "dados.xlsx"), xlsx);
  await fs.writeFile(path.join(output, "pacote.zip"), zipBytes);
  console.log(
    "PASS HTML seguro, scripts válidos, pacote HTML+Excel, metadados, zero/vazio, matrícula textual e precisão decimal.",
  );
} finally {
  await vite.close();
}
