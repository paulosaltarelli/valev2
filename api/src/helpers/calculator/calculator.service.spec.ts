import { Test, TestingModule } from '@nestjs/testing';
import { CalculatorService } from './calculator.service';

describe('CalculatorService', () => {
  let service: CalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CalculatorService],
    }).compile();

    service = module.get<CalculatorService>(CalculatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.each([[1, 60], [2, 40], [3, 50], [0, 0]])(
    'calcula a regra %i com condicionais em várias linhas',
    (regra, esperado) => {
      const expressao = [
        '(:REGRA) == 2',
        '? min((:FIXO), (:TETO))',
        ': ((:REGRA) == 1',
        '  ? min((:VIAGENS) * (:TARIFA) * (:DIAS), (:TETO))',
        '  : ((:REGRA) == 3 ? (:KM) * (:TARIFA) * (:DIAS) : 0))',
      ].join('\n');
      expect(service.calcularFormula(expressao, {
        REGRA: regra, FIXO: 40, TETO: 60, VIAGENS: 7, TARIFA: 5, DIAS: 2, KM: 5,
      })).toMatchObject({ status: true, resultado: esperado });
    },
  );

  it('distingue o prefixo de variável do separador adjacente', () => {
    expect(service.calcularFormula(':FLAG ? :SIM:NAO', { FLAG: 0, SIM: 9, NAO: 4 }))
      .toMatchObject({ status: true, resultado: 4 });
  });

  it('rejeita resultado não finito', () => {
    expect(service.calcularFormula(':VALOR / 0', { VALOR: 5 }).status).toBe(false);
  });
});
