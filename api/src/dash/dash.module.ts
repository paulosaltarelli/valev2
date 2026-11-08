import { Module } from '@nestjs/common';
import { DashService } from './dash.service';
import { DashController } from './dash.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OperationalReportsController } from './operational-reports.controller';
import { OperationalReportsService } from './operational-reports.service';

@Module({
  imports: [PrismaModule],
  providers: [DashService, OperationalReportsService],
  controllers: [DashController, OperationalReportsController],
})
export class DashModule {}
