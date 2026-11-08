const occurrenceQueries = new Set([
  'PVE.AFASTAMENTOS',
  'PVE.ATESTADO',
  'PVE.FALTAINJUST',
  'PVE.FALTAJUSTIF',
]);

const nullableAggregates = new Set(['PVE.AFASTAMENTOS', 'PVE.ATESTADO']);

export function readRmVariable(query: string, rows: unknown): number {
  if (!Array.isArray(rows)) return NaN;
  const code = query.trim().toUpperCase();
  if (!rows.length) return occurrenceQueries.has(code) ? 0 : NaN;
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return NaN;
  const value: unknown = row.RESULTADO;
  // SUM de afastamentos e atestados retorna NULL sem ocorrências.
  if (value == null) return nullableAggregates.has(code) ? 0 : NaN;
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return NaN;
  return Number(value);
}
