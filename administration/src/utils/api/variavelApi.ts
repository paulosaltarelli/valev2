import api from "./Api";
import type { Variavel } from "../../models/VariavelModel";
import type { UpdateVariavelPayload } from "../../models/VariavelModel";
export class VariavelApi {
  public static async getByFilialId(filialId: number): Promise<Variavel[]> {
    const response = await api.get(`/filial/${filialId}/variavel`);
    console.log(response);
    return response as Variavel[];
  }

  public static async updateById(variavelId: number, variavel: Variavel): Promise<{ status: boolean; message: string; data?: Variavel }> {
    const response = await api.put(`/variavel/${variavelId}`, variavel as UpdateVariavelPayload);
    return response as {
      status: boolean;
      message: string;
      data?: Variavel;
    };
  }

  public static async deleteById(variavelId: number): Promise<{ status: boolean; message: string; data?: Variavel }> {
    const response = await api.delete(`/variavel/${variavelId}`);
    return response as {
      status: boolean;
      message: string;
      data?: Variavel;
    };
  }

  public static async insert(filialId: number, variavel: Variavel): Promise<{ status: boolean; message: string; data?: Variavel }> {
    const response = await api.post(`/filial/${filialId}/variavel`, {
      ...variavel,
    });
    return response as {
      status: boolean;
      message: string;
      data?: Variavel;
    };
  }
}
