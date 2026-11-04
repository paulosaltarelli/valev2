import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Query,
  Header,
} from '@nestjs/common';
import { FuncionarioRm } from 'src/models/FuncionarioRmModel';
import { GeoService } from './geo.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUserService } from 'src/auth/current-user.service';

@Controller('geo')
export class GeoController {
  constructor(
    private readonly geoService: GeoService,
    private readonly currentUserService: CurrentUserService,
  ) {}

  @Post('enqueue/:filialId')
  @UseGuards(JwtAuthGuard)
  async enqueueGeoKm(
    @Param('filialId') filialId: number,
    @Body()
    body: {
      chapas?: string[];
      funcionarios?: Array<{
        chapa?: string;
        codcoligada?: number;
        codfilial?: number;
      }>;
    },
  ): Promise<{ ok: boolean; message: string; enqueued: number }> {
    const { sessionId } = this.currentUserService.getJwtPayload();
    if (!sessionId) {
      return { ok: false, message: 'Session ID não encontrado', enqueued: 0 };
    }

    const fromFuncionarios = Array.isArray(body?.funcionarios)
      ? body.funcionarios
      : [];
    const fromChapas = Array.isArray(body?.chapas) ? body.chapas : [];

    const items =
      fromFuncionarios.length > 0
        ? fromFuncionarios
            .map((f) => ({
              chapa: typeof f?.chapa === 'string' ? f.chapa : '',
              codcoligada:
                typeof f?.codcoligada === 'number' ? f.codcoligada : null,
              codfilial: typeof f?.codfilial === 'number' ? f.codfilial : null,
            }))
            .filter((x) => Boolean(String(x.chapa ?? '').trim()))
        : fromChapas
            .map((c) => ({ chapa: c, codcoligada: null, codfilial: null }))
            .filter((x) => typeof x.chapa === 'string' && x.chapa.trim());

    if (items.length === 0) {
      return {
        ok: false,
        message: 'Nenhum funcionário/chapa informado para enfileirar',
        enqueued: 0,
      };
    }

    const enqueued = await this.geoService.enqueueGeoKm({
      filialId: Number(filialId),
      items,
      sessionId,
    });
    return {
      ok: true,
      message: 'Processo iniciado com sucesso',
      enqueued,
    };
  }

  @Get('queue/status/:filialId')
  @UseGuards(JwtAuthGuard)
  async getGeoQueueStatus(@Param('filialId') filialId: number): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    return await this.geoService.getGeoQueueStatusByFilialId(Number(filialId));
  }

  @Get('queue/errors/:filialId')
  @UseGuards(JwtAuthGuard)
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getGeoQueueErrors(
    @Param('filialId') filialId: number,
    @Query('limit') limit?: string,
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
    const take = Number(limit ?? 1000);
    const safeTake = Number.isFinite(take) && take > 0 ? take : 1000;
    return await this.geoService.getGeoQueueErrorsByFilialId(
      Number(filialId),
      Math.min(safeTake, 5000),
    );
  }

  @Post('calculate-batch-km')
  @UseGuards(JwtAuthGuard)
  async calculateBatchKm(
    @Body() funcionarios: FuncionarioRm[],
  ): Promise<{ status: boolean; message: string; data?: FuncionarioRm[] }> {
    return await this.geoService.calcularFuncionarioBatch(funcionarios);
  }

  @Post('calculate-batch-km-all/:filialId')
  @UseGuards(JwtAuthGuard)
  async calculateBatchKmAllFilial(
    @Param('filialId') filialId: number,
  ): Promise<{ status: boolean; message: string; data?: FuncionarioRm[] }> {
    const { sessionId } = this.currentUserService.getJwtPayload();
    if (!sessionId) {
      return { status: false, message: 'Session ID não encontrado' };
    }
    return await this.geoService.calcularFuncionarioBatchAllFilial(
      Number(filialId),
      sessionId,
    );
  }
}
