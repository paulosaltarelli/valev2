export type QueueErrorCode =
  | 'LOCK_REINICIADO'
  | 'SESSION_ID_AUSENTE'
  | 'ERRO_WORKER'
  | 'ERRO_GEO'
  | 'ERRO_CRIACAO_EXECUCAO'
  | 'ERRO_VARIAVEIS'
  | 'ERRO_VALORES'
  | 'ERRO_ENVIAR_RM'
  | 'ERRO_DESCONHECIDO';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formata uma linha única para armazenamento em last_error (append-only).
 * Exemplo:
 * 2026-01-21 13:45:10 - [SESSION_ID_AUSENTE] Não foi possível processar sem sessionId do RM (execucaoId=10)
 */
export function formatQueueErrorLine(params: {
  code: QueueErrorCode;
  message: string;
  context?: Record<string, unknown>;
  at?: Date;
}): string {
  const at = params.at ?? new Date();
  const ts = `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(
    at.getDate(),
  )} ${pad2(at.getHours())}:${pad2(at.getMinutes())}:${pad2(at.getSeconds())}`;

  const msg = String(params.message ?? '').trim() || 'Erro não informado';
  const ctx =
    params.context && Object.keys(params.context).length > 0
      ? ` (${Object.entries(params.context)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(', ')})`
      : '';

  return `${ts} - [${params.code}] ${msg}${ctx}`;
}
