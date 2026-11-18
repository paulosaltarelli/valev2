import { OperacaoService } from './operacao.service';
import { FIXED_PAYMENT_ZERO_DAYS_MESSAGE } from '../helpers/calculator/fixed-payment-error';

describe('Explicação de falha histórica sem reprocessamento', () => {
  const expression = '(((:REGRA_PGTO) == 2) and ((:D_RECEB_PASS) == 0)) ? (0 / 0) : ((:VR_FIXO) / (:D_RECEB_PASS))';
  const message = 'Erro ao calcular fórmula 3326 para funcionário TESTE: Erro ao calcular fórmula: A fórmula deve retornar um número finito';
  function service(days: number) {
    const prisma = {
      execucao_funcionario_base: { findFirst: jest.fn().mockResolvedValue({
        status: 'ERRO_RESULTADOS', funcionario_id_rm: 'TESTE', execucao_funcionario: [{
          formula_id: 3326, status: 'ERRO', formula: { expressao: expression },
          memoria_calculo: [{ variavel_codigo: 'REGRA_PGTO', valor: 2 }, { variavel_codigo: 'D_RECEB_PASS', valor: days }],
        }],
      }) },
      execucao_queue: { findFirst: jest.fn().mockResolvedValue({ last_error: message, updated_at: null }) },
      log_execucao: { findMany: jest.fn().mockResolvedValue([{ mensagem: message }]) },
    };
    return new OperacaoService(prisma as never, {} as never);
  }
  it('apresenta a causa comprovada usando apenas consultas', async () => {
    const result = await service(0).employeeFailures(3443, 1);
    expect(result[0].mensagens[0]).toContain(FIXED_PAYMENT_ZERO_DAYS_MESSAGE);
    expect(result[0].mensagens[0]).not.toContain('número finito');
  });
  it('não reclassifica erro sem divisor zero comprovado', async () => {
    expect((await service(10).employeeFailures(3443, 1))[0].mensagens[0]).toBe(message);
  });
});
