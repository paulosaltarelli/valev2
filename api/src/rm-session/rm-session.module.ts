import { Module } from '@nestjs/common';
import { RmSessionService } from './rm-session.service';

@Module({
  providers: [RmSessionService],
  exports: [RmSessionService],
})
export class RmSessionModule {}
