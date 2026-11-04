export function sanitizeCodigo(input: string): string {
  // Regra: permitir somente letras, números e underscore.
  // Qualquer outra coisa (espaço, hífen, símbolos, etc) vira underscore.
  return (input ?? "")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_");
}


