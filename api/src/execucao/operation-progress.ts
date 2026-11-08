import { analisarExpressao } from '../helpers/calculator/formula-expression';

type Formula = { formula_id: number; expressao: string };
type Result = {
  formula_id: number;
  formula_snapshot: string | null;
  status: string;
  valor_calculado: unknown;
};

/** Count each variable once per employee, even when shared by several formulas. */
export function operationProgress(
  formulas: Formula[],
  variableCodes: string[],
  results: Result[],
  savedCodes: string[],
) {
  const expressions = new Map(formulas.map((f) => [f.formula_id, f.expressao]));
  for (const result of results) {
    if (!result.formula_snapshot) continue;
    try {
      const snapshot: unknown = JSON.parse(result.formula_snapshot);
      if (snapshot && typeof snapshot === 'object' && 'expressao' in snapshot &&
          typeof snapshot.expressao === 'string') {
        expressions.set(result.formula_id, snapshot.expressao);
      }
    } catch { /* Legacy records can have no usable snapshot. */ }
  }
  const registered = new Set(variableCodes);
  const expected = new Set<string>();
  for (const expression of expressions.values()) {
    for (const code of analisarExpressao(expression).codigos) {
      if (registered.has(code)) expected.add(code);
    }
  }
  // Retain saved variables when a configuration changed after processing.
  const saved = new Set(savedCodes);
  for (const code of saved) expected.add(code);
  const formulaIds = new Set([...expressions.keys(), ...results.map((r) => r.formula_id)]);
  const calculated = new Set(results.filter((r) =>
    ['PROCESSADO', 'ENVIADO_RM'].includes(r.status) && r.valor_calculado !== null &&
    r.valor_calculado !== undefined).map((r) => r.formula_id));
  return {
    variaveisCalculadas: saved.size,
    variaveisPrevistas: expected.size,
    formulasCalculadas: calculated.size,
    formulasPrevistas: formulaIds.size,
  };
}
