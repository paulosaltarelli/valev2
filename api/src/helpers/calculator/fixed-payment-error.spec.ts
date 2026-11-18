import { CalculatorService } from './calculator.service';
import { FIXED_PAYMENT_ZERO_DAYS_MESSAGE } from './fixed-payment-error';

const expression = '(:DIAS) == 0 ? 0 : ((((:REGRA_PGTO) == 2) and ((:D_RECEB_PASS) == 0)) ? (0 / 0) : min((:DIAS) * (((:REGRA_PGTO) == 2) ? ((:VR_FIXO) / (:D_RECEB_PASS)) : (:VR_V)), ((:TETO_PAGAMENTO) > 0) ? (:TETO_PAGAMENTO) : Infinity))';
const scope = { DIAS: 31, REGRA_PGTO: 2, D_RECEB_PASS: 0, VR_FIXO: 350, VR_V: 10, TETO_PAGAMENTO: 0 };

describe('Mensagem de revisão para diária fixa', () => {
  const calculator = new CalculatorService();
  it('mantém falha e explica o divisor zero', () => {
    expect(calculator.calcularFormula(expression, scope)).toEqual({
      status: false, resultado: 0, message: `Erro ao calcular fórmula: ${FIXED_PAYMENT_ZERO_DAYS_MESSAGE}`,
    });
  });
  it('preserva zero sem ajuste mesmo com divisor zero', () => {
    expect(calculator.calcularFormula(expression, { ...scope, DIAS: 0 })).toMatchObject({ status: true, resultado: 0 });
  });
  it('preserva cálculo válido e teto', () => {
    expect(calculator.calcularFormula(expression, { ...scope, DIAS: 2, D_RECEB_PASS: 10 })).toMatchObject({ status: true, resultado: 70 });
    expect(calculator.calcularFormula(expression, { ...scope, DIAS: 2, D_RECEB_PASS: 10, TETO_PAGAMENTO: 50 })).toMatchObject({ status: true, resultado: 50 });
  });
  it.each([1, 3])('preserva regra %s com zero dias recebidos', REGRA_PGTO => {
    expect(calculator.calcularFormula(expression, { ...scope, REGRA_PGTO })).toMatchObject({ status: true, resultado: 310 });
  });
  it('não atribui a causa fixa a falhas não relacionadas', () => {
    expect(calculator.calcularFormula('0 / 0', scope).message).toBe('Erro ao calcular fórmula: A fórmula deve retornar um número finito');
    expect(calculator.calcularFormula('MISSING + 1', scope).status).toBe(false);
  });
});
