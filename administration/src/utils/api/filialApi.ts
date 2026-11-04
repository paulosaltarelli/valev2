import { http } from "../../shared/lib/http";
import type { Filial, UpdateFilialPayload } from "../../models/FilialModel";
import type { FuncionarioRm } from "../../models/FuncionarioRmModel";

export const filialApi = {
  async all(): Promise<Filial[]> {
    const resp = await http.get("/filial/all");
    return resp.data as Filial[];
  },

  async getById(filialId: number): Promise<Filial> {
    const resp = await http.get(`/filial/${filialId}`);
    return resp.data as Filial;
  },

  async getFuncionariosRmByFilialId(
    filialId: number
  ): Promise<FuncionarioRm[]> {
    //Vai trazer os funcionarios da filial direto do RM
    const resp = await http.get(`/filial/${filialId}/funcionarios-rm`);
    return resp.data as FuncionarioRm[];
  },

  async updateById(
    filialId: number,
    payload: UpdateFilialPayload
  ): Promise<{ status: boolean; message: string; data?: Filial }> {
    const resp = await http.put(`/filial/${filialId}`, payload);
    return resp.data as {
      status: boolean;
      message: string;
      data?: Filial;
    };
  },

  async removeById(
    filialId: number
  ): Promise<{ status: boolean; message: string; data?: Filial }> {
    const resp = await http.delete(`/filial/${filialId}`);
    return resp.data as {
      status: boolean;
      message: string;
      data?: Filial;
    };
  },

  async create(
    payload: Partial<Filial>
  ): Promise<{ status: boolean; message: string; data?: Filial }> {
    const resp = await http.post("/filial", payload);
    return resp.data as {
      status: boolean;
      message: string;
      data?: Filial;
    };
  },

  async calculateBatchKm(
    funcionarios: FuncionarioRm[]
  ): Promise<{ status: boolean; message: string; data?: FuncionarioRm[] }> {
    const resp = await http.post(`/geo/calculate-batch-km`, funcionarios);
    return resp.data as {
      status: boolean;
      message: string;
      data?: FuncionarioRm[];
    };
  },

  async calculateBatchKmAllFilial(
    filialId: number
  ): Promise<{ status: boolean; message: string; data?: FuncionarioRm[] }> {
    const resp = await http.post(
      `/geo/calculate-batch-km-all/${filialId}`,
      filialId
    );
    return resp.data as {
      status: boolean;
      message: string;
      data?: FuncionarioRm[];
    };
  },

  async enqueueGeoKm(
    filialId: number,
    funcionarios: Array<{
      chapa: string;
      codcoligada: number;
      codfilial: number;
    }>
  ): Promise<{ ok: boolean; message: string; enqueued: number }> {
    const resp = await http.post(`/geo/enqueue/${filialId}`, {
      funcionarios,
    });
    return resp.data as { ok: boolean; message: string; enqueued: number };
  },

  async getGeoQueueStatus(filialId: number): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    const resp = await http.get(`/geo/queue/status/${filialId}`);
    return resp.data as {
      hasRunning: boolean;
      pending: number;
      processing: number;
      nextRunAt: string | null;
    };
  },

  async getGeoQueueErrors(
    filialId: number,
    limit: number = 1000
  ): Promise<
    Array<{
      geoQueueId: number;
      chapa: string;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastError: string;
    }>
  > {
    const resp = await http.get(
      `/geo/queue/errors/${filialId}?limit=${encodeURIComponent(String(limit))}`
    );
    return resp.data as Array<{
      geoQueueId: number;
      chapa: string;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastError: string;
    }>;
  },
};
