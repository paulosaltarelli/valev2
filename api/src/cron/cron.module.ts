import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { ExecucaoModule } from 'src/execucao/execucao.module';
import { GeoModule } from 'src/geo/geo.module';

@Module({
  providers: [CronService],
  imports: [ScheduleModule.forRoot(), ExecucaoModule, GeoModule],
})
export class CronModule {}
