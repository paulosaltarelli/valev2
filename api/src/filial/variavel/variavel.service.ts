import { Injectable, NotFoundException } from '@nestjs/common';
import { variavel } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VariavelService {
  constructor(private readonly prisma: PrismaService) {}

  async getVariaveisByFilialId(filialId: number): Promise<variavel[]> {
    const variaveis = await this.prisma.variavel.findMany({
      where: { filial_id: filialId, ativa: true },
    });
    if (!variaveis) {
      throw new NotFoundException('Variaveis not found');
    }
    return variaveis;
  }

  async createVariavel(
    filialId: number,
    dto: Prisma.variavelUncheckedCreateInput,
  ): Promise<variavel> {
    const createdVariavel = await this.prisma.variavel.create({
      data: {
        ...dto,
        filial_id: filialId,
        // `variavel_id` e `data_criacao` são preenchidos pelo banco (autoincrement/default)
      },
    });
    return createdVariavel;
  }

  async updateVariavel(
    variavelId: number,
    dto: Prisma.variavelUncheckedUpdateInput,
  ): Promise<variavel> {
    try {
      if (dto.variavel_id) delete dto.variavel_id;
      const updatedVariavel = await this.prisma.variavel.update({
        where: { variavel_id: variavelId },
        data: dto,
      });
      return updatedVariavel;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Failed to update variavel: Unknown error');
    }
  }

  async deleteVariavel(variavelId: number): Promise<boolean> {
    //atualiza o campo ativa para false
    await this.prisma.variavel.update({
      where: { variavel_id: variavelId },
      data: { ativa: false },
    });
    return true;
  }
}
