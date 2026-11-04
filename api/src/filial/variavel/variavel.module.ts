import { Module } from '@nestjs/common';
import { VariavelService } from './variavel.service';
import { VariavelController } from './variavel.controller';

@Module({
  providers: [VariavelService],
  controllers: [VariavelController],
})
export class VariavelModule {}
