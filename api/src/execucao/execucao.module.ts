import { Module } from '@nestjs/common';
import { ExecucaoService } from './execucao.service';
import { ExecucaoController } from './execucao.controller';
import { FormulaModule } from 'src/filial/formula/formula.module';
import { CurrentUserService } from 'src/auth/current-user.service';
import { CalculatorService } from 'src/helpers/calculator/calculator.service';
import { RmModule } from 'src/rm/rm.module';
import { OperacaoService } from './operacao.service';
import { OperacaoController } from './operacao.controller';

@Module({
  imports: [FormulaModule, RmModule],
  providers: [ExecucaoService, OperacaoService, CurrentUserService, CalculatorService],
  controllers: [ExecucaoController, OperacaoController],
  exports: [ExecucaoService],
})
export class ExecucaoModule {}
