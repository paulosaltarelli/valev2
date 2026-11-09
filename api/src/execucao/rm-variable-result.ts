const occurrenceQueries = new Set([
  'PVE.AFASTAMENTOS',
  'PVE.ATESTADO',
  'PVE.FALTAINJUST',
  'PVE.FALTAJUSTIF',
]);

const nullableAggregates = new Set(['PVE.AFASTAMENTOS', 'PVE.ATESTADO']);
const nonRetryableHttpStatuses = new Set([400, 401, 403, 404, 405, 410, 422]);

// Called only when no valid value could be read. Preserve retries for
// transport failures, 429, 5xx, and failures without a known HTTP status.
export function isRmVariableFailureFinal(response: {
  status: boolean;
  http?: { status?: number };
}): boolean {
  const httpStatus = response.http?.status;
  return response.status ||
    (httpStatus !== undefined && nonRetryableHttpStatuses.has(httpStatus));
}

export function readRmVariable(query: string, rows: unknown): number {
  if (!Array.isArray(rows)) return NaN;
  const code = query.trim().toUpperCase();
  if (!rows.length) return occurrenceQueries.has(code) ? 0 : NaN;
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return NaN;
  const value: unknown = code === 'PVE.TETO_PGTO' && row.RESULTADO === undefined
    ? row.VALORTETOPAGTO
    : row.RESULTADO;
  if (value === null) return 0;
  if (value === undefined) return nullableAggregates.has(code) ? 0 : NaN;
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return NaN;
  return Number(value);
}
