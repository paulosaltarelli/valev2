import { Injectable } from '@nestjs/common';
import * as math from 'mathjs';
import { analisarExpressao } from './formula-expression';
import { fixedPaymentZeroDaysError } from './fixed-payment-error';

@Injectable()
export class CalculatorService {
  calcularFormula(
    expressaoRaw: string,
    variaveis: Record<string, number>,
  ): { status: boolean; resultado: number; message: string } {
    try {
      const { normalizada } = analisarExpressao(expressaoRaw);
      const resultado: unknown = math.evaluate(normalizada, variaveis);
      if (typeof resultado !== 'number' || !Number.isFinite(resultado)) {
        throw new Error(
          fixedPaymentZeroDaysError(expressaoRaw, variaveis) ??
            'A fórmula deve retornar um número finito',
        );
      }
      return {
        status: true,
        resultado,
        message: 'Fórmula calculada com sucesso',
      };
    } catch (error) {
      return {
        status: false,
        resultado: 0,
        message: `Erro ao calcular fórmula: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }
}
