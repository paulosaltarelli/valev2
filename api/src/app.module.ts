import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { FilialModule } from './filial/filial.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { PeriodoModule } from './periodo/periodo.module';
import { ExecucaoModule } from './execucao/execucao.module';
import { CalculatorModule } from './helpers/calculator/calculator.module';
import { GeoModule } from './geo/geo.module';
import { HttpModule } from '@nestjs/axios';
import { CronModule } from './cron/cron.module';
import { DashModule } from './dash/dash.module';
import { ProfileModule } from './profile/profile.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    FilialModule,
    UsuariosModule,
    PeriodoModule,
    ExecucaoModule,
    CalculatorModule,
    GeoModule,
    HttpModule,
    CronModule,
    DashModule,
    ProfileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
