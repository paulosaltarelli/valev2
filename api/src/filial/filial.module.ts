import { Module } from '@nestjs/common';
import { FilialService } from './filial.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { FilialController } from './filial.controller';
import { VariavelModule } from './variavel/variavel.module';
import { FormulaModule } from './formula/formula.module';
import { RmModule } from 'src/rm/rm.module';

@Module({
  imports: [PrismaModule, AuthModule, VariavelModule, FormulaModule, RmModule],
  controllers: [FilialController],
  providers: [FilialService],
  exports: [FilialService],
})
export class FilialModule {}
