import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { periodo, Prisma } from '@prisma/client';

@Injectable()
export class PeriodoService {
  constructor(private readonly prisma: PrismaService) {}
  async getAllPeriodos(): Promise<periodo[]> {
    return this.prisma.periodo.findMany();
  }

  async getAllPeriodosAtivos(): Promise<periodo[]> {
    return this.prisma.periodo.findMany({
      where: {
        ativo: true,
      },
    });
  }
  async createPeriodo(payload: Prisma.periodoCreateInput): Promise<periodo> {
    return this.prisma.periodo.create({
      data: {
        ...payload,
        data_criacao: new Date(),
      },
    });
  }

  async updatePeriodoById(
    periodoId: number,
    payload: Prisma.periodoUncheckedUpdateInput,
  ): Promise<periodo> {
    if (payload.periodo_id) {
      delete payload.periodo_id;
    }
    return this.prisma.periodo.update({
      where: { periodo_id: periodoId },
      data: payload,
    });
  }

  async deletePeriodoById(periodoId: number): Promise<boolean> {
    try {
      await this.prisma.periodo.delete({
        where: { periodo_id: periodoId },
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Failed to delete periodo: Unknown error');
    }
  }
}
