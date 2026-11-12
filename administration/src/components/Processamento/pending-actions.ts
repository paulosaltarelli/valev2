import type { Etapa, OperationRequest } from "../../utils/api/operacaoApi";
export type PendingStage = Extract<Etapa, "VARIAVEIS" | "VALORES" | "ENVIAR_RM">;
export function currentExecutionIds(rows: Array<{ id: number; latest: boolean }>) {
  return [...new Set(rows.filter(row => row.latest).map(row => row.id))];
}
export function pendingRequest(stage: PendingStage, executionIds: number[], periodoId?: number): OperationRequest {
  const execucaoIds = [...new Set(executionIds)];
  // RM uses the existing send eligibility contract, not the calculation-only period endpoint.
  // It excludes confirmed revisions, active jobs, incomplete calculations and ambiguous receipts.
  if (stage === "ENVIAR_RM") {
    if (!execucaoIds.length) throw new Error("Nenhuma execução disponível para envio.");
    return { etapa: stage, execucaoIds };
  }
  return { etapa: stage, execucaoIds, ...(periodoId ? { periodoId } : {}), somentePendencias: true };
}
