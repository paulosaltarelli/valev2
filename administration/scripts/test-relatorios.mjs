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
  optimizeDeps: { noDiscovery: true, entries: [] },
});
try {
  const { prepararPacote, ErroExportacao } = await vite.ssrLoadModule(
    "/src/components/Processamento/relatorioPacote.ts",
  );
  const { criarModeloVisual } = await vite.ssrLoadModule(
    "/src/components/Processamento/relatorioVisual.ts",
  );
  const visual = criarModeloVisual();
  const financeiro = {
    colunas: [
      "FilialId",
      "Filial",
      "QtdeExecucoes",
      "UltimaExecucao",
      "QtdeRegistros",
      "QtdeComPago",
      "QtdeComDesconto",
      "TotalPago",
      "TotalDesconto",
      "TotalFinanceiro",
    ],
    linhas: [
      [
        "1049",
        "Matriz Jundiaí",
        1,
        "2026-11-10T15:43:20.0830000",
        459,
        459,
        459,
        "85249.28",
        "4018.40",
        "89267.68",
      ],
      [
        "1051",
        "Matriz",
        1,
        "2026-11-10T15:43:40.0500000",
        54,
        54,
        54,
        "8642.34",
        "264.80",
        "8907.14",
      ],
      [
        "1048",
        "Igarassu",
        1,
        "2026-11-10T15:43:10.0810000",
        36,
        36,
        36,
        "6000.00",
        "370.78",
        "6370.78",
      ],
      ["1063", "Admitidos", 0, null, 0, 0, 0, null, null, null],
    ],
    parcial: false,
  };
  const planoFinanceiro = visual.analisar(financeiro);
  assert.equal(planoFinanceiro.perfil, "Financeiro");
  assert.equal(planoFinanceiro.dimensao, 1);
  assert.equal(planoFinanceiro.metrica, 9);
  assert.equal(planoFinanceiro.colunas[2].titulo, "Execuções");
  assert.equal(planoFinanceiro.colunas[2].tipo, "inteiro");
  assert.equal(planoFinanceiro.colunas[5].tipo, "inteiro");
  assert.equal(planoFinanceiro.colunas[7].tipo, "moeda");
  assert.equal(planoFinanceiro.colunas[0].tipo, "identificador");
  assert.equal(visual.formatar("85249.28", "moeda"), "R$ 85.249,28");
  assert.equal(
    visual.formatar("2026-11-10T15:43:20.0830000", "data"),
    "10/11/2026 15:43",
  );
  assert.equal(visual.formatar(null, "moeda"), "—");
  assert.equal(visual.formatar("0.00", "moeda"), "R$ 0,00");
  assert.equal(
    visual.somar(["9999999999999999.99", "0.01"]),
    "10000000000000000.00",
  );
  assert.equal(
    visual.analisar(financeiro, {
      dimensao: "FilialId",
      metrica: "FilialId",
      grafico: "linha",
    }).metrica,
    9,
  );
  assert.equal(visual.coluna("MediaValor", ["10", "20"]).agregavel, false);
  assert.equal(visual.coluna("Percentual", ["10", "20"]).agregavel, false);
  assert.equal(visual.coluna("TotalPago", ["10", "20"]).agregavel, true);
  const temporal = {
    colunas: ["Competencia", "TotalPago"],
    linhas: [
      ["08/2026", "100.00"],
      ["09/2026", "140.00"],
    ],
    parcial: false,
  };
  assert.equal(
    visual.analisar(temporal, {
      grafico: "linha",
      dimensao: "Competencia",
      metrica: "TotalPago",
    }).grafico,
    "linha",
  );
  assert(visual.comparar("12/2025", "01/2026") < 0);
  const f = await prepararPacote({
    texto: "Análise financeira — fixture de validação",
    competencia: "09/2026",
    filial: "Todas as filiais",
    fonte: "Fixture",
    tabela: financeiro,
  });
  const fw = new ExcelJS.Workbook();
  await fw.xlsx.load(await f.excel.arrayBuffer());
  assert.equal(fw.getWorksheet("Dados").getCell("C1").value, "Execuções");
  assert.equal(fw.getWorksheet("Dados").getCell("H2").value, 85249.28);
  assert(fw.getWorksheet("Dados").getCell("H2").numFmt.includes("R$"));
  assert(fw.getWorksheet("Dados").getCell("D2").value instanceof Date);
  assert.equal(
    fw.getWorksheet("Dados originais").getCell("D2").value,
    "2026-11-10T15:43:20.0830000",
  );
  await fs.writeFile(path.join(output, "financeiro.html"), f.html);
  await fs.writeFile(
    path.join(output, "financeiro.xlsx"),
    Buffer.from(await f.excel.arrayBuffer()),
  );
  const t = await prepararPacote({
    texto: "Evolução — fixture",
    tabela: temporal,
    apresentacao: {
      grafico: "linha",
      dimensao: "Competencia",
      metrica: "TotalPago",
    },
  });
  await fs.writeFile(path.join(output, "evolucao.html"), t.html);
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
    ["Resumo", "Dados", "Dados originais", "Filtros e fontes"],
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
  const preenchido = {
    texto: "20 registros em três filiais — fixture",
    competencia: "09/2026",
    tabela: {
      colunas: [
        "Matrícula",
        "Funcionário",
        "Filial",
        "Estado atual",
        "Resultados com erro",
        "Evidência e orientação",
        "Interpretação para o usuário",
      ],
      linhas: Array.from({ length: 20 }, (_, i) => [
        String(i + 1).padStart(6, "0"),
        `Caso ${i + 1}`,
        ["Alfa", "Beta", "Gama"][i % 3],
        "ERRO_FORMULA",
        i === 0 ? 0 : 1,
        i === 0
          ? '=HYPERLINK("https://example.invalid")'
          : "Evidência de teste\nOrientação de teste",
        "Pode já haver um lançamento. Confira no RM antes de reenviar.",
      ]),
      parcial: false,
    },
  };
  const pacote20 = await prepararPacote(preenchido);
  const zip20 = await JSZip.loadAsync(await pacote20.pacote.arrayBuffer());
  const book20 = new ExcelJS.Workbook();
  await book20.xlsx.load(
    await zip20.file("vale-ia-dados.xlsx").async("uint8array"),
  );
  const folha20 = book20.getWorksheet("Dados");
  assert.equal(folha20.rowCount, 21);
  assert.equal(folha20.getCell("A2").value, "000001");
  assert.equal(folha20.getCell("E2").value, 0);
  assert.equal(typeof folha20.getCell("F2").value, "string");
  const dados20 = JSON.parse(
    pacote20.html.match(
      /<script id="dados" type="application\/json">([\s\S]*?)<\/script>/,
    )[1],
  );
  assert.deepEqual(dados20.tabela.linhas, preenchido.tabela.linhas);
  assert(
    pacote20.html.includes("visao-sintetica") &&
      pacote20.html.includes("visao-analitica"),
  );
  assert(pacote20.html.includes('id="casos-funcionarios"'));
  assert.equal(dados20.tabela.linhas[0][6], "Pode já haver um lançamento. Confira no RM antes de reenviar.");
  await assert.rejects(
    prepararPacote({
      texto: "segredo-que-nao-deve-aparecer",
      tabela: { colunas: ["Teste"], linhas: [[Infinity]], parcial: false },
    }),
    (e) =>
      e instanceof ErroExportacao &&
      e.etapa === "dados" &&
      !e.message.includes("segredo"),
  );
  await fs.writeFile(path.join(output, "relatorio20.html"), pacote20.html);
  await fs.writeFile(
    path.join(output, "pacote20.zip"),
    Buffer.from(await pacote20.pacote.arrayBuffer()),
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
