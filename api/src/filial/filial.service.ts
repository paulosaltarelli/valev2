import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { filial, Prisma } from '@prisma/client';
import { CurrentUserService } from 'src/auth/current-user.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RmService } from 'src/rm/rm.service';
import type { FuncionarioRm } from 'src/models/FuncionarioRmModel';

@Injectable()
export class FilialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserService: CurrentUserService,
    private readonly rmService: RmService,
  ) {}

  async getAllFiliais(): Promise<filial[]> {
    return this.prisma.filial.findMany({
      where: { ativa: true },
      include: {
        formula: {
          orderBy: {
            versao: 'desc',
          },
          where: {
            ativa: true,
          },
          take: 1,
        },
      },
    });
  }

  async getFilialById(filialId: number): Promise<filial> {
    const filial = await this.prisma.filial.findUnique({
      where: { filial_id: filialId },
    });
    if (!filial) {
      throw new NotFoundException('Filial not found');
    }
    return filial;
  }

  async createFilial(
    payload: Prisma.filialUncheckedCreateInput,
  ): Promise<filial> {
    return this.prisma.filial.create({
      data: payload,
    });
  }

  async updateFilialById(
    filialId: number,
    payload: Partial<filial>,
  ): Promise<boolean> {
    try {
      delete payload.filial_id;
      await this.prisma.filial.update({
        where: { filial_id: filialId },
        data: payload,
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Failed to update filial: Unknown error');
    }
  }

  async disableFilialById(filialId: number): Promise<boolean> {
    try {
      await this.prisma.filial.update({
        where: { filial_id: filialId },
        data: { ativa: false },
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Failed to disable filial: Unknown error');
    }
  }

  async getFuncionariosRmByFilialId(
    filialId: number,
  ): Promise<FuncionarioRm[]> {
    const filial = await this.getFilialById(filialId);
    if (!filial) {
      throw new NotFoundException('Filial not found');
    }
    const { sessionId } = this.currentUserService.getJwtPayload();
    if (!sessionId) {
      throw new UnauthorizedException('Session ID not found');
    }

    const codSentenca = filial.sql_codigo_rm; //SQL codigo RM da filial que traz os funcionarios

    const resultado = await this.rmService.realizaConsultaSql(
      codSentenca,
      {
        CODCOLIGADA: filial.codcoligada,
        CODFILIAL: filial.codfilial,
      },
      sessionId,
    );
    if (!resultado.status) {
      throw new Error(resultado.message);
    }
    return resultado.data as FuncionarioRm[];
  }
}
