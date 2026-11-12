import { transportRules } from '../execucao/transport-rules';

type Result = { formula_id: number; codigo_regra_rm?: string; status: string; valor_final: unknown; revisao: number; enviado_revisao: number | null };
/** Same operational population: active formulas crossed with the employee's saved transport rules. */
export function reportCompletion(base: { status: string | null; regras_rm?: string | null }, formulaIds: number[], results: Result[]) {
  const ids = new Set(formulaIds);
  const active = results.filter(r => ids.has(r.formula_id));
  const rules = transportRules(base);
  const expected = new Set(formulaIds.flatMap(id => rules.map(rule => JSON.stringify([id, rule]))));
  const keys = new Set(active.map(r => JSON.stringify([r.formula_id, r.codigo_regra_rm ?? ''])));
  const all = expected.size > 0 && active.length === expected.size && keys.size === expected.size && [...expected].every(key => keys.has(key));
  const complete = ['RESULTADOS_PROCESSADOS', 'ENVIADO_RM', 'ERRO_RM'].includes(base.status ?? '') && all && active.every(r => ['PROCESSADO', 'ENVIADO_RM'].includes(r.status) && r.valor_final != null);
  const sent = all && active.every(r => r.status === 'ENVIADO_RM' && r.enviado_revisao === r.revisao);
  return { complete, sent, active };
}
