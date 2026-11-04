import { Module } from '@nestjs/common';
import { RmService } from './rm.service';
import { RmSessionModule } from 'src/rm-session/rm-session.module';
import { CryptoModule } from 'src/security/crypto.module';

@Module({
  imports: [RmSessionModule, CryptoModule],
  providers: [RmService],
  exports: [RmService],
})
export class RmModule {}
