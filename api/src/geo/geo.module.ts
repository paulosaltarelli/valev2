import { Module } from '@nestjs/common';
import { GeoService } from './geo.service';
import { GeoController } from './geo.controller';
import { HttpModule } from '@nestjs/axios';
import { RmModule } from 'src/rm/rm.module';
import { AuthModule } from 'src/auth/auth.module';
@Module({
  providers: [GeoService],
  exports: [GeoService],
  controllers: [GeoController],
  imports: [HttpModule, RmModule, AuthModule],
})
export class GeoModule {}
