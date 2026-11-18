export const pilotQuery = 'PVE.ATESTADO';
export const pilotBatchQuery = 'PVE2.ATESTAD';

const dated = [
  'AFASTAMENTO', 'ATESTAD', 'D.RECEB.PAS', 'D.TRA', 'D.TRAB.REA', 'DIAS.TRAB.F', 'DIAS_FERIA',
  'DIAS_TRABAL', 'FALTAINJUS', 'FALTAJUSTI', 'FOLGANORMA', 'FOLGAPLANTA',
  'LICENCA', 'VR_D_RECE_P', 'VR_K',
];
const undated = [
  'CODEVENTODE', 'CODEVENTOPA', 'CODEVENTORE', 'CODEVENTOSU', 'DESC_AFAS',
  'DESC_FALT_I', 'DESC_FALT_J', 'KM_CALCUL', 'NRO_VIAGEN', 'REGRA_PGT',
  'TETO_PGT', 'TIPO_TRANS', 'VALOR_VIAGE', 'VR_FIX',
];
const narrow = new Set(['ATESTAD', 'FALTAJUSTI', 'D.TRA', 'D.TRAB.REA', 'VR_D_RECE_P', 'VR_K']);
const dateCodes = new Set(dated);
export const pve2VariableCodes = [...dated, ...undated].map((code) => 'PVE2.' + code);
const known = new Set(pve2VariableCodes);
const eventQueries = new Set(['PVE2.CODEVENTODE', 'PVE2.CODEVENTOPA', 'PVE2.CODEVENTORE', 'PVE2.CODEVENTOSU']);

export function isPve2EventQuery(query: string | null): query is string {
  return query !== null && eventQueries.has(query);
}

type RmBatchParam = 'CHAPAS' | 'CODCOLIGADA' | 'CODFILIAL' | 'DTINICIO' | 'DTFINAL';
const chapaFirst: RmBatchParam[] = ['CHAPAS', 'CODCOLIGADA', 'CODFILIAL'];
const dates: RmBatchParam[] = ['DTINICIO', 'DTFINAL'];
const datesThenChapas = new Set(['D.TRA', 'D.TRAB.REA']);
const chapaBeforeDates = new Set(['DIAS_FERIA', 'FALTAINJUS', 'FOLGANORMA', 'FOLGAPLANTA', 'LICENCA']);

export function pve2QuerySpec(query: string) {
  if (!known.has(query)) return undefined;
  const code = query.slice(5);
  return {
    dated: dateCodes.has(code),
    maxChapaLength: narrow.has(code) ? 10 : 20,
    count: code === 'ATESTAD' || code === 'FALTAJUSTI',
    nullAsZero: code === 'AFASTAMENTO',
  };
}

// O endpoint RM vincula os valores na ordem dos parâmetros no SQL.
export function pve2Parameters(query: string, values: Record<RmBatchParam, string | number>) {
  const code = query.slice(5);
  const order = !dateCodes.has(code) ? chapaFirst
    : code === 'AFASTAMENTO' ? ['CHAPAS', ...dates, 'CODCOLIGADA', 'CODFILIAL'] as RmBatchParam[]
    : datesThenChapas.has(code) ? [...dates, ...chapaFirst]
    : chapaBeforeDates.has(code) ? [...chapaFirst, ...dates]
    : [...dates, 'CODCOLIGADA', 'CODFILIAL', 'CHAPAS'] as RmBatchParam[];
  return Object.fromEntries(order.map((name) => [name, values[name]]));
}

export function pilotBatchSize() {
  const value = Number(process.env.RM_PVE_ATESTADO_BATCH_SIZE);
  return Number.isSafeInteger(value) && value >= 2 && value <= 500 ? value : 0;
}

export function isBatchChapa(chapa: string, maxLength: number) {
  return chapa.length <= maxLength && /^[a-zA-Z0-9_-]+$/.test(chapa);
}

export type BatchEmployee = { codcoligada: number; codfilial: number; chapa: string };

export function employeeKey({ codcoligada, codfilial, chapa }: BatchEmployee) {
  return JSON.stringify([codcoligada, codfilial, chapa]);
}

type BatchValue = { value: number } | { error: string };

function readCode(raw: unknown) {
  if (typeof raw === 'number' && Number.isSafeInteger(raw)) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))) return Number(raw);
}

export function readPve2EventValues(requested: BatchEmployee[], response: unknown) {
  const expected = new Set(requested.map(employeeKey));
  const values = new Map<string, string | null>();
  if (!Array.isArray(response)) return values;
  for (const row of response) {
    if (!row || typeof row.CHAPA !== 'string') continue;
    const codcoligada = readCode(row.CODCOLIGADA);
    const codfilial = readCode(row.CODFILIAL);
    if (codcoligada === undefined || codfilial === undefined) continue;
    const key = employeeKey({ codcoligada, codfilial, chapa: row.CHAPA });
    if (!expected.has(key)) continue;
    const raw = row.RESULTADO;
    const value = typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw))
      ? String(raw).trim() || null
      : null;
    values.set(key, values.has(key) ? null : value);
  }
  return values;
}

export function distributePilotResult(
  requested: BatchEmployee[], response: unknown, query = pilotBatchQuery,
) {
  const spec = pve2QuerySpec(query);
  const expected = new Set(requested.map(employeeKey));
  const results = new Map<string, BatchValue>();
  let outside = 0;
  let malformed = 0;
  let duplicated = 0;
  if (Array.isArray(response)) {
    for (const row of response) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        malformed++;
        continue;
      }
      const codcoligada = readCode(row.CODCOLIGADA);
      const codfilial = readCode(row.CODFILIAL);
      if (codcoligada === undefined || codfilial === undefined || typeof row.CHAPA !== 'string') {
        malformed++;
        continue;
      }
      const key = employeeKey({ codcoligada, codfilial, chapa: row.CHAPA });
      if (!expected.has(key)) {
        outside++;
        continue;
      }
      if (results.has(key)) {
        duplicated++;
        results.set(key, { error: 'Chave duplicada na resposta em lote do RM.' });
        continue;
      }
      const raw = row.RESULTADO;
      const value = raw == null && spec?.nullAsZero ? 0
        : typeof raw === 'number' || (typeof raw === 'string' && /^[+-]?\d+(\.\d+)?$/.test(raw.trim()))
        ? Number(raw)
        : NaN;
      results.set(key, Number.isFinite(value) && (!spec?.count || (Number.isSafeInteger(value) && value >= 0))
        ? { value }
        : { error: raw === null ? 'RESULTADO NULL no lote do RM.' : 'RESULTADO inválido no lote do RM.' });
    }
  }
  let missing = 0;
  for (const key of expected) {
    if (results.has(key)) continue;
    missing++;
    results.set(key, Array.isArray(response) && spec && !outside && !malformed
      ? { value: 0 }
      : { error: Array.isArray(response) ? 'Chave ausente na resposta em lote do RM.' : 'Resposta em lote inválida no RM.' });
  }
  return { results, outside, malformed, duplicated, missing };
}
