import api from "./Api";
import type { Execucao } from "../../models/ExecucaoModel";
import type { ExecFunc } from "../../models/ExecFuncModel";

export class ExecucaoApi {
  public static async getAllByFilialId(filialId: number): Promise<Execucao[]> {
    const response = await api.get(`/filial/${filialId}/execucao`);
    console.log(response);
    return response as Execucao[];
  }

  public static async create(
    execucao: Partial<Execucao>
  ): Promise<{ status: boolean; message: string; data?: Execucao }> {
    const response = await api.post(
      `/filial/${execucao.filial_id}/execucao`,
      execucao
    );
    return response as { status: boolean; message: string; data?: Execucao };
  }
  public static async getById(execucaoId: number): Promise<Execucao> {
    const response = await api.get(`/execucao/${execucaoId}`);
    return response as Execucao;
  }
  public static async processarTodos(
    execucaoId: number
  ): Promise<{ status: boolean; message: string }> {
    const response = await api.post(`/execucao/${execucaoId}/processar-todos`);
    return response as { status: boolean; message: string };
  }

  public static async enqueueValoresTodos(
    execucaoId: number,
    ids: number[]
  ): Promise<{ status: boolean; message: string }> {
    const response = await api.post(
      `/execucao/${execucaoId}/enqueue-valores-batch`,
      ids
    );
    return response as { status: boolean; message: string };
  }

  public static async processarValoresSelecionados(
    execucaoId: number,
    ids: number[]
  ): Promise<{ status: boolean; message: string }> {
    const response = await api.post(
      `/execucao/${execucaoId}/enqueue-valores-batch`,
      ids
    );
    return response as { status: boolean; message: string };
  }

  public static async enqueueEnviarRmBatch(
    execucaoId: number,
    ids: number[]
  ): Promise<{ status: boolean; message: string }> {
    const response = await api.post(
      `/execucao/${execucaoId}/enqueue-enviar-rm-batch`,
      ids
    );
    return response as { status: boolean; message: string };
  }

  public static async processarVariaveis(
    execucaoId: number
  ): Promise<{ status: boolean; message: string }> {
    const response = await api.post(
      `/execucao/${execucaoId}/processar-variaveis`
    );
    return response as { status: boolean; message: string };
  }

  public static async enqueueVariaveisTodos(
    execucaoId: number,
    ids: number[]
  ): Promise<{ status: boolean; message: string }> {
    const response = await api.post(
      `/execucao/${execucaoId}/enqueue-variaveis-batch`,
      ids
    );
    return response as { status: boolean; message: string };
  }
  public static async processarVariaveisSelecionados(
    execucaoId: number,
    ids: number[]
  ): Promise<{ status: boolean; message: string }> {
    const response = await api.post(
      `/execucao/${execucaoId}/enqueue-variaveis-batch`,
      ids
    );
    return response as { status: boolean; message: string };
  }

  public static async editarResultado(
    execucaoId: number,
    execFuncId: number,
    resultado: Partial<ExecFunc> & {
      new_valor_final?: number;
      motivo_ajuste?: string;
    }
  ): Promise<{ status: boolean; message: string }> {
    const response = await api.put(
      `/execucao/${execucaoId}/exec-func/${execFuncId}/editar-resultado`,
      resultado
    );
    return response as { status: boolean; message: string };
  }

  public static async getQueueStatus(execucaoId: number): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    const response = await api.get(`/execucao/${execucaoId}/queue/status`);
    return response as {
      hasRunning: boolean;
      pending: number;
      processing: number;
      nextRunAt: string | null;
    };
  }

  public static async getQueueItems(execucaoId: number): Promise<
    Array<{
      queueId: number;
      execucaoFuncionarioBaseId: number;
      nomeFuncionario: string;
      funcionarioIdRm: string;
      cargo: string;
      tipo: string;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const response = await api.get(`/execucao/${execucaoId}/queue/items`);
    return response as Array<{
      queueId: number;
      execucaoFuncionarioBaseId: number;
      nomeFuncionario: string;
      funcionarioIdRm: string;
      cargo: string;
      tipo: string;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }

  public static async getErrors(execucaoId: number): Promise<
    Array<{
      id: string;
      source: "QUEUE" | "LOG";
      tipo: string | null;
      status: string | null;
      funcionarioIdRm: string | null;
      nomeFuncionario: string | null;
      message: string;
      createdAt: string;
    }>
  > {
    const response = await api.get(`/execucao/${execucaoId}/errors`);
    return response as Array<{
      id: string;
      source: "QUEUE" | "LOG";
      tipo: string | null;
      status: string | null;
      funcionarioIdRm: string | null;
      nomeFuncionario: string | null;
      message: string;
      createdAt: string;
    }>;
  }

  public static async enqueueCreateExecucaoBatch(params: {
    filialIds: number[];
    periodoId: number;
    processarVariaveisEValores?: boolean;
  }): Promise<{ status: boolean; message: string; data?: unknown }> {
    const response = await api.post(`/filial/execucao/batch`, params);
    return response as { status: boolean; message: string; data?: unknown };
  }

  public static async enqueueEnviarRmByExecucoes(
    execucaoIds: number[]
  ): Promise<{ status: boolean; message: string; data?: unknown }> {
    const response = await api.post(`/execucao/enqueue-enviar-rm-by-execucoes`, {
      execucaoIds,
    });
    return response as { status: boolean; message: string; data?: unknown };
  }

  public static async getCreateQueueStatus(): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    const response = await api.get(`/execucao/create-queue/status`);
    return response as {
      hasRunning: boolean;
      pending: number;
      processing: number;
      nextRunAt: string | null;
    };
  }

  public static async getCreateQueueItems(): Promise<
    Array<{
      queueId: number;
      filialId: number;
      periodoId: number;
      usuarioExecucao: number;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const response = await api.get(`/execucao/create-queue/items`);
    return response as Array<{
      queueId: number;
      filialId: number;
      filialNome?: string | null;
      periodoId: number;
      periodoCompetencia?: string | null;
      usuarioExecucao: number;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }

  public static async getCreateQueueErrors(
    limit: number = 1000
  ): Promise<
    Array<{
      queueId: number;
      filialId: number;
      filialNome: string | null;
      periodoId: number;
      periodoCompetencia: string | null;
      usuarioExecucao: number;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastError: string;
    }>
  > {
    const response = await api.get(
      `/execucao/create-queue/errors?limit=${encodeURIComponent(String(limit))}`
    );
    return response as Array<{
      queueId: number;
      filialId: number;
      filialNome: string | null;
      periodoId: number;
      periodoCompetencia: string | null;
      usuarioExecucao: number;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastError: string;
    }>;
  }
}
