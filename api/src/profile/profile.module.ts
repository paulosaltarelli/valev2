import { Global, Module } from '@nestjs/common';
import { ProfileGuard } from './profile.guard';

@Global()
@Module({
  providers: [ProfileGuard],
  exports: [ProfileGuard],
})
export class ProfileModule {}
