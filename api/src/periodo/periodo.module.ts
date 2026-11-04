import { Module } from '@nestjs/common';
import { PeriodoService } from './periodo.service';
import { PeriodoController } from './periodo.controller';

@Module({
  providers: [PeriodoService],
  controllers: [PeriodoController],
  exports: [PeriodoService],
})
export class PeriodoModule {}
