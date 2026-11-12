import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(
  "src/components/Processamento/contextoDaPergunta.ts",
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { contextoDaPergunta, respostaTodasFiliais } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);
const opcoes = {
  periodos: [{ periodo_id: 7, competencia: "10/2026", ativo: true }],
  filiais: [{ filial_id: 9, nome: "Alfa" }],
};
for (const resposta of [
  "todas",
  "Todas!",
  "todas as filiais",
  "todas elas",
  "geral",
]) {
  assert(respostaTodasFiliais(resposta));
  const filtro = contextoDaPergunta(resposta, opcoes, "7", "9");
  assert.equal(filtro.filialId, undefined);
  assert.equal(filtro.todasFiliais, true);
  assert.equal(filtro.periodoId, 7);
}
assert.equal(
  contextoDaPergunta(
    "tem funcionario com erro ? · todas as filiais",
    opcoes,
    "7",
    "9",
  ).todasFiliais,
  true,
);
assert.equal(contextoDaPergunta("Alfa", opcoes, "7", "").filialId, 9);
console.log(
  "PASS “todas” remove a filial herdada, mantém competência ativa e reconhece variantes de resposta.",
);
