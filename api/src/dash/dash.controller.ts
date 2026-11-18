import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { DashService, type DashSummary } from './dash.service';

@Controller('dash')
export class DashController {
  constructor(private readonly dashService: DashService) {}

  @Get('reports/falhas')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  getFailureReport(@Query('periodoId') periodoId?: string) {
    const id = periodoId === undefined ? undefined : Number(periodoId);
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) {
      throw new BadRequestException('Competência inválida.');
    }
    return this.dashService.getFailureReport(id);
  }

  @Get('reports/processamento/opcoes')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  getProcessamentoOptions(@Query('periodoId') periodoId?: string) {
    const id = periodoId === undefined ? undefined : Number(periodoId);
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) {
      throw new BadRequestException('Competência inválida.');
    }
    return this.dashService.getProcessamentoOptions(id);
  }

  @Get('reports/processamento/:id')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  getProcessamentoReport(@Param('id', ParseIntPipe) id: number) {
    return this.dashService.getProcessamentoReport(id);
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getSummary(
    @Query('periodoId') periodoId?: string,
    @Query('filialId') filialId?: string,
    @Query('includeDetails') includeDetails?: string,
  ): Promise<DashSummary> {
    const pid = Number(periodoId);
    const fid = Number(filialId);
    return await this.dashService.getSummary(
      Number.isFinite(pid) && pid > 0 ? pid : undefined,
      Number.isFinite(fid) && fid > 0 ? fid : undefined,
      includeDetails !== '0',
    );
  }

  @Get('reports/financeiro/timeline')
  @UseGuards(JwtAuthGuard)
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getFinanceiroTimeline(
    @Query('startCompetencia') startCompetencia?: string,
    @Query('endCompetencia') endCompetencia?: string,
    @Query('filialIds') filialIds?: string,
    @Query('granularity') granularity?: string, // mantido por compatibilidade (hoje fica mensal)
  ) {
    if (!startCompetencia || !endCompetencia) {
      throw new BadRequestException(
        'Parâmetros startCompetencia e endCompetencia são obrigatórios (MM/yyyy)',
      );
    }

    const ids =
      typeof filialIds === 'string' && filialIds.trim().length > 0
        ? filialIds
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [];

    return await this.dashService.getFinanceiroTimeline({
      startCompetencia,
      endCompetencia,
      filialIds: ids,
      granularity,
    });
  }
}
