type ResultState = { status: string; valor_final: unknown };
export const isSuccessfulResult = (result: ResultState) =>
  ['PROCESSADO', 'ENVIADO_RM'].includes(result.status) && result.valor_final !== null;

export function hasStageFailure(base: { status: string | null; execucao_funcionario: ResultState[] }, stage: string) {
  if (stage === 'VARIAVEIS') return base.status === 'ERRO_VARIAVEIS';
  if (stage !== 'VALORES' || ['PREVIA', 'ERRO_VARIAVEIS'].includes(base.status ?? '')) return false;
  return ['ERRO_RESULTADOS', 'RESULTADOS_PARCIAL'].includes(base.status ?? '') ||
    base.execucao_funcionario.some(result => result.status.startsWith('ERRO'));
}

export function retriesOnlyErrors(payload: string | null | undefined): boolean {
  if (!payload) return false;
  try { return JSON.parse(payload).somenteErros === true; }
  catch { return false; }
}
