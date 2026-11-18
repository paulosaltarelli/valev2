import { distributePilotResult, employeeKey, type BatchEmployee } from './rm-variable-batch';

export const ruleQueries = new Set(['DESC_AFAS','DESC_FALT_I','DESC_FALT_J','KM_CALCUL','NRO_VIAGEN','REGRA_PGT','TETO_PGT','TIPO_TRANS','VALOR_VIAGE','VR_FIX','CODEVENTODE','CODEVENTOPA','CODEVENTORE','CODEVENTOSU'].map(c => 'PVE2.' + c));
export function transportRules(base: { regras_rm?: string | null }): string[] {
  if (!base.regras_rm) return [''];
  const rules: unknown = JSON.parse(base.regras_rm);
  if (!Array.isArray(rules) || !rules.length || rules.some(r => typeof r !== 'string' || !r.trim() || r.length > 100))
    throw new Error('Regras de transporte inválidas.');
  return [...new Set(rules as string[])].sort();
}
export const ruleKey = (employee: BatchEmployee, rule: string) => JSON.stringify([employeeKey(employee), rule]);
type RequestedRule = BatchEmployee & { regra: string };
export function distributeRuleResult(requested: RequestedRule[], response: unknown, query: string) {
  const results = new Map<string, { value: number } | { error: string }>();
  let duplicated = 0, missing = 0, outside = 0, malformed = 0;
  const rows = Array.isArray(response) ? response : [];
  const expected = new Set(requested.map(e => ruleKey(e,e.regra)));
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.CODREGRA !== 'string' || !row.CODREGRA.trim()) { malformed++; continue; }
    const e = { codcoligada: Number(row.CODCOLIGADA), codfilial: Number(row.CODFILIAL), chapa: row.CHAPA };
    const key = ruleKey(e,row.CODREGRA.trim());
    // Legacy single-rule snapshots can be resolved only when the response has exactly one rule.
    const legacyKey = ruleKey(e,'');
    const target = expected.has(key) ? key : expected.has(legacyKey) ? legacyKey : null;
    if (!target) { outside++; continue; }
    if (results.has(target)) { duplicated++; results.set(target,{error:'Mais de um vínculo para a mesma regra. Atualize os vínculos antes de processar.'}); continue; }
    const parsed = distributePilotResult([e],[row],query).results.get(employeeKey(e));
    results.set(target,parsed ?? {error:'Resposta de regra inválida.'});
  }
  for (const e of requested) {
    const key=ruleKey(e,e.regra);
    if (!results.has(key)) { missing++; results.set(key,{error:'Regra não retornada pelo RM. Atualize os vínculos antes de processar.'}); }
  }
  if (outside || malformed || !Array.isArray(response)) for (const key of expected) results.set(key,{error:'O conjunto de regras retornado pelo RM difere da execução. Atualize os vínculos ou a sentença.'});
  return {results,duplicated,missing,outside,malformed};
}
export function ruleEventValues(requested: RequestedRule[], response: unknown) {
  const values=new Map<string,string|null>();
  if (!Array.isArray(response)) return values;
  const expected=new Set(requested.map(e=>ruleKey(e,e.regra)));
  for (const row of response) {
    if (!row || typeof row.CODREGRA !== 'string' || !row.CODREGRA.trim()) continue;
    const e={codcoligada:Number(row.CODCOLIGADA),codfilial:Number(row.CODFILIAL),chapa:row.CHAPA};
    const key=ruleKey(e,row.CODREGRA.trim()), legacy=ruleKey(e,'');
    const target=expected.has(key)?key:expected.has(legacy)?legacy:null;
    if(!target)continue;
    const raw=row.RESULTADO;
    const value=typeof raw==='string'||typeof raw==='number'?String(raw).trim()||null:null;
    values.set(target,values.has(target)?null:value);
  }
  return values;
}
