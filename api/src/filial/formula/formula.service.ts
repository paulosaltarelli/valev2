import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { formula, Prisma } from '@prisma/client';

@Injectable()
export class FormulaService {
  constructor(private readonly prisma: PrismaService) {}

  async getFormulasByFilialId(filialId: number): Promise<formula[]> {
    const formulas = await this.prisma.formula.findMany({
      where: { filial_id: filialId },
    });
    if (!formulas) {
      throw new NotFoundException('Formulas not found');
    }
    return formulas;
  }
  async insertFormula(
    filialId: number,
    formula: Prisma.formulaUncheckedCreateInput,
  ): Promise<boolean> {
    const result = await this.prisma.formula.create({
      data: {
        ...formula,
        filial_id: filialId,
        versao: 1,
        ativa: true,
      },
    });
    if (result && result.ativa) {
      await this.disableAllFormulasByFilialIdBesideCurrent(
        filialId,
        result.formula_id,
      );
    }
    return result ? true : false;
  }
  async updateFormula(
    filialId: number,
    formulaId: number,
    formula: Prisma.formulaUncheckedCreateInput,
  ): Promise<formula> {
    if (formula.formula_id) delete formula.formula_id;
    const updatedFormula = await this.prisma.formula.update({
      where: { formula_id: formulaId },
      data: {
        ...formula,
        filial_id: filialId,
        versao: formula.versao + 1,
      },
    });

    if (updatedFormula && updatedFormula.ativa) {
      await this.disableAllFormulasByFilialIdBesideCurrent(filialId, formulaId);
    }
    return updatedFormula;
    // //este update não atualiza de fato, mas cria uma nova versão da formula
    // //TODO: Logar a alteração para ter o hist
    // if (formula.formula_id) delete formula.formula_id;
    // const newFormula = await this.prisma.formula.create({
    //   data: {
    //     ...formula,
    //     filial_id: filialId,
    //     versao: formula.versao + 1,
    //     data_criacao: new Date(),
    //   },
    // });
    // if (newFormula) {
    //   //se criou, inativa a formula original
    //   await this.prisma.formula.update({
    //     where: { formula_id: formulaId },
    //     data: { ativa: false },
    //   });
    //   return newFormula;
    // } else {
    //   throw new Error('Failed to update formula');
    // }
  }
  async deleteFormula(formulaId: number): Promise<boolean> {
    const result = await this.prisma.formula.delete({
      where: { formula_id: formulaId },
    });
    return result ? true : false;
  }
  async getActiveFormulaByFilialId(filialId: number): Promise<formula> {
    const formula = await this.prisma.formula.findFirst({
      where: { filial_id: filialId, ativa: true },
    });
    if (!formula) throw new NotFoundException('Formula not found');
    return formula;
  }

  async disableAllFormulasByFilialIdBesideCurrent(
    filialId: number,
    formulaId: number,
  ): Promise<boolean> {
    return true; //Não apaga mais pois agora podemos ter mais de uma formula ativa por filial
    await this.prisma.formula.updateMany({
      where: { filial_id: filialId, formula_id: { not: formulaId } },
      data: { ativa: false },
    });
    return true;
  }
}
