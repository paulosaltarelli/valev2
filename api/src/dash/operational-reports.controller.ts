import { BadRequestException, Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { OperationalReportsService } from './operational-reports.service';

const id = (value?: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new BadRequestException('Selecione identificadores válidos.');
  return parsed;
};
@Controller('dash/reports')
@UseGuards(JwtAuthGuard)
export class OperationalReportsController {
  constructor(private readonly reports: OperationalReportsService) {}
  @Get('operacionais/opcoes')
  @Header('Cache-Control','no-store')
  options() { return this.reports.options(); }
  @Get('fechamento')
  @Header('Cache-Control','no-store')
  closing(@Query('periodoId') periodoId?: string) { return this.reports.closing(periodoId === undefined ? undefined : id(periodoId)); }
  @Get('variacao')
  @Header('Cache-Control','no-store')
  variation(@Query('periodoId') periodoId?: string,@Query('anteriorId') anteriorId?: string,@Query('filialId') filialId?: string) {
    return this.reports.variation(id(periodoId),id(anteriorId),id(filialId));
  }
}
