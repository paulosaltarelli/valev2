import { Injectable } from '@nestjs/common';
import * as math from 'mathjs';

@Injectable()
export class CalculatorService {
  calcularFormula(
    expressaoRaw: string,
    variaveis: Record<string, number>,
  ): { status: boolean; resultado: number; message: string } {
    // 1. Tratamento da string (Sanitização)
    // O mathjs prefere variáveis limpas (ex: "a + b").
    // Se o seu padrão é ":var1", removemos os dois pontos para facilitar.
    const expressaoLimpa = expressaoRaw.replace(/:/g, '');

    // Exemplo: de "(:var1) + (:var2)" vira "(var1) + (var2)"

    // 2. Montar o Scope (Mapa de valores)
    // As chaves deste objeto DEVEM bater com os nomes na string limpa
    // Exemplo de entrada: { var1: 10, var2: 20, var3: 5 }
    const scope = variaveis;

    try {
      // 3. Avaliação
      const resultado = math.evaluate(expressaoLimpa, scope) as number;
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
