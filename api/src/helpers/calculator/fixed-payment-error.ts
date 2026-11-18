import { analisarExpressao } from './formula-expression';

export const FIXED_PAYMENT_ZERO_DAYS_MESSAGE =
  'Não foi possível calcular a diária: pagamento fixo com zero dias recebidos no passado. Revise os dias recebidos antes de calcular novamente.';

// Reconhece a proteção já cadastrada nas fórmulas; não altera seu cálculo.
export function fixedPaymentZeroDaysError(
  expression: string,
  variables: Record<string, number>,
): string | null {
  if (variables.REGRA_PGTO !== 2 || variables.D_RECEB_PASS !== 0) return null;
  const { normalizada, codigos } = analisarExpressao(expression);
  return codigos.has('VR_FIXO') &&
    /\(\s*REGRA_PGTO\s*\)\s*==\s*2/.test(normalizada) &&
    /\(\s*D_RECEB_PASS\s*\)\s*==\s*0/.test(normalizada) &&
    /\?\s*\(\s*0\s*\/\s*0\s*\)/.test(normalizada)
    ? FIXED_PAYMENT_ZERO_DAYS_MESSAGE
    : null;
}
