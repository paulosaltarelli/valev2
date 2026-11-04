/**
 * Utilitários para manipular payloads vindos do RM.
 *
 * Requisito: remover recursivamente chaves `id` e `parent_id` (em qualquer nível),
 * pois o RM pode rejeitar/invalidar o PUT quando elas existem.
 */

export function stripKeysDeepInPlace(
  value: unknown,
  keysToStrip: string[] = ['id', 'parent_id'],
): void {
  const keys = new Set(keysToStrip);
  const visited = new Set<object>();

  const walk = (v: unknown) => {
    if (!v) return;
    if (typeof v !== 'object') return;

    // Evita loop em estruturas cíclicas (não esperado, mas custa pouco)
    if (visited.has(v)) return;
    visited.add(v);

    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }

    const obj = v as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (keys.has(k)) {
        delete obj[k];
        continue;
      }
      walk(obj[k]);
    }
  };

  walk(value);
}
