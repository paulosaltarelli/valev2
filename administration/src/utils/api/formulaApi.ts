import api from "./Api";
import type { Formula } from "../../models/FormulaModel";
import type { UpdateFormulaPayload } from "../../models/FormulaModel";
export class FormulaApi {
  public static async getByFilialId(filialId: number): Promise<Formula[]> {
    const response = await api.get(`/filial/${filialId}/formula`);
    console.log(response);
    return response as Formula[];
  }

  public static async updateById(
    filialId: number,
    formulaId: number,
    formula: Formula
  ): Promise<{ status: boolean; message: string; data?: Formula }> {
    const response = await api.put(
      `/filial/${filialId}/formula/${formulaId}`,
      formula as UpdateFormulaPayload
    );
    return response as {
      status: boolean;
      message: string;
      data?: Formula;
    };
  }

  public static async deleteById(
    filialId: number,
    formulaId: number
  ): Promise<{ status: boolean; message: string; data?: Formula }> {
    const response = await api.delete(
      `/filial/${filialId}/formula/${formulaId}`
    );
    return response as {
      status: boolean;
      message: string;
      data?: Formula;
    };
  }

  public static async insert(
    filialId: number,
    formula: Formula
  ): Promise<{ status: boolean; message: string; data?: Formula }> {
    // console.log(`inserindo formula: ${JSON.stringify(formula)}`);
    const response = await api.post(`/filial/${filialId}/formula`, {
      ...formula,
    });
    return response as {
      status: boolean;
      message: string;
      data?: Formula;
    };
  }
}
