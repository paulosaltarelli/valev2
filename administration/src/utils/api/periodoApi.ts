import api from "./Api";
import type { Periodo } from "../../models/PeriodoModel";
import type { UpdatePeriodoPayload } from "../../models/PeriodoModel";

export class PeriodoApi {
  public static async getAllPeriodos(): Promise<Periodo[]> {
    const response = await api.get(`/periodo`);
    return response as Periodo[];
  }
  public static async getAllPeriodosAtivos(): Promise<Periodo[]> {
    const response = await api.get(`/periodo/ativos`);
    return response as Periodo[];
  }

  public static async updateById(
    periodoId: number,
    periodo: Periodo
  ): Promise<{ status: boolean; message: string; data?: Periodo }> {
    const response = await api.put(
      `/periodo/${periodoId}`,
      periodo as UpdatePeriodoPayload
    );
    return response as {
      status: boolean;
      message: string;
      data?: Periodo;
    };
  }

  public static async deleteById(periodoId: number): Promise<{ status: boolean; message: string; data?: Periodo }> {
    const response = await api.delete(`/periodo/${periodoId}`);
    return response as {
      status: boolean;
      message: string;
      data?: Periodo;
    };
  }

  public static async insert(periodo: Periodo): Promise<{ status: boolean; message: string; data?: Periodo }> {
    const response = await api.post(`/periodo`, {
      ...periodo,
    });
    return response as {
      status: boolean;
      message: string;
      data?: Periodo;
    };
  }
}
