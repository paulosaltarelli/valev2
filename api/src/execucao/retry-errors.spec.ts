import { OperacaoService } from './operacao.service';
import { ExecucaoService } from './execucao.service';
import { hasStageFailure, hasStagePending, isSuccessfulResult, retriesOnlyErrors } from './retry-errors';

const result = (id: number, status: string, value: number | null) => ({
  execucao_funcionario_id: id, execucao_funcionario_base_id: 1, formula_id: id,
  status, valor_final: value, valor_calculado: value, revisao: 7,
  formula_snapshot: null, codigo_regra_rm: '',
  formula: { nome: 'Fórmula', codEvento: 'R066', tipo: 'V' },
});
const base = (id: number, status: string, results: any[] = [], queued = false) => ({
  execucao_funcionario_base_id: id, execucao_id: 1, status, nome_funcionario: 'Teste', funcionario_id_rm: '001',
  codcoligada: 1, codfilial: 1, execucao_funcionario: results,
  execucao_queue: queued ? [{ queue_id: 1 }] : [],
  execucao: { filial: { nome: 'Teste' }, periodo: { competencia: '10/2026', data_inicio: new Date('2026-10-01Z'), data_fim: new Date('2026-10-31Z') } },
});

describe('Retentativa somente de falhas', () => {
  it('separa etapas e não classifica pendência sem erro como falha', () => {
    expect(hasStageFailure(base(1, 'ERRO_VARIAVEIS'), 'VARIAVEIS')).toBe(true);
    expect(hasStageFailure(base(1, 'ERRO_VARIAVEIS', [result(1, 'ERRO', null)]), 'VALORES')).toBe(false);
    expect(hasStageFailure(base(1, 'VARIAVEIS_PROCESSADAS'), 'VALORES')).toBe(false);
    expect(hasStageFailure(base(1, 'RESULTADOS_PROCESSADOS', [result(1, 'ERRO', null)]), 'VALORES')).toBe(true);
    expect(hasStageFailure(base(1, 'RESULTADOS_PROCESSADOS', [result(1, 'PROCESSADO', 0)]), 'VALORES')).toBe(false);
    expect(isSuccessfulResult(result(1, 'ENVIADO_RM', 0))).toBe(true);
    expect(retriesOnlyErrors('{"somenteErros":true}')).toBe(true);
    expect(retriesOnlyErrors('{"somenteErros":"true"}')).toBe(false);
    expect(retriesOnlyErrors(null)).toBe(false);
  });

  it('conta toda a filial, exclui fila ativa e revalida antes de disparar', async () => {
    let rows = [base(1, 'ERRO_VARIAVEIS'), base(2, 'ERRO_VARIAVEIS', [], true), base(3, 'ERRO_RESULTADOS', [result(2, 'ERRO', null)]), base(4, 'RESULTADOS_PROCESSADOS', [result(1, 'PROCESSADO', 42)])];
    const db: any = {
      execucao_funcionario_base: { findMany: jest.fn(async () => rows) },
      execucao_queue: { findMany: jest.fn(async () => []), create: jest.fn() },
      execucao: { updateMany: jest.fn() }, $queryRaw: jest.fn(async () => [{execucao_id: 1}]),
    };
    db.$transaction = (fn: any) => fn(db);
    const service = new OperacaoService(db, {} as never);
    expect(await service.retryScope(1)).toMatchObject({VARIAVEIS: {elegiveis: 1, bloqueados: 1}, VALORES: {elegiveis: 1, bloqueados: 0}});
    await service.execute({ etapa: 'VALORES', execucaoIds: [1], somenteErros: true }, 1, 'test');
    expect(db.execucao_queue.create).toHaveBeenCalledTimes(1);
    const inserted = db.execucao_queue.create.mock.calls[0][0].data;
    expect(inserted.execucao_funcionario_base_id).toBe(3);
    expect(JSON.parse(inserted.revisao_payload).somenteErros).toBe(true);
    rows = [base(3, 'RESULTADOS_PROCESSADOS', [result(2, 'PROCESSADO', 42)])];
    await expect(service.execute({ etapa: 'VALORES', execucaoIds: [1], somenteErros: true }, 1, 'test')).rejects.toThrow('Nenhuma pessoa');
    expect(db.execucao_queue.create).toHaveBeenCalledTimes(1);
    await expect(service.execute({ etapa: 'ENVIAR_RM', execucaoIds: [1], somenteErros: true }, 1, 'test')).rejects.toThrow('somente');
  });

  function engine() {
    const results = [result(1, 'ENVIADO_RM', 42), result(2, 'ERRO', null)];
    const employee = base(1, 'ERRO_RESULTADOS', results);
    const formulas = [1, 2].map(formula_id => ({formula_id, ativa: true, expressao: ':X', nome: 'Teste'}));
    const execution = {execucao_id: 1, execucao_funcionario_base: [employee], filial: {formula: formulas, variavel: [{variavel_id: 1, codigo: 'X', nome: 'X', ativa: true, valor_fixo: 10}], km_max: {toNumber: () => 70}}, periodo: {data_inicio: new Date('2026-10-01Z'), data_fim: new Date('2026-10-31Z')}};
    const db: any = {
      execucao: { findUnique: jest.fn(async () => execution) },
      execucao_funcionario: { findMany: jest.fn(async () => results), upsert: jest.fn(async ({create}) => results.find(r => r.formula_id === create.formula_id)), update: jest.fn() },
      execucao_funcionario_base: {updateMany: jest.fn()},
      memoria_calculo: {findMany: jest.fn(async () => results.map(r => ({execucao_funcionario_id: r.execucao_funcionario_id, variavel_codigo: 'X', valor: 10}))), deleteMany: jest.fn(), createMany: jest.fn()},
      log_execucao: {create: jest.fn()}, $executeRaw: jest.fn(async () => 1),
    };
    db.$transaction = (fn: any) => fn(db);
    const calculator = {calcularFormula: jest.fn(() => ({status: true, resultado: 10}))};
    const operation = {preparePve2CalculationEvents: jest.fn(async () => new Map()), saveCalculation: jest.fn()};
    const service = new ExecucaoService(db, {} as never, calculator as never, {} as never, operation as never);
    return {service, db, calculator, operation, employee, results, execution};
  }

  it('recalcula a fórmula com erro sem alterar fórmula válida, revisão ou valor enviado', async () => {
    const {service, calculator, operation, employee, results} = engine();
    const before = JSON.stringify(results[0]);
    const answer = await service.processarValoresBatch(1, [employee] as never, 'test', new Set([1]));
    expect(answer.status).toBe(true);
    expect(calculator.calcularFormula).toHaveBeenCalledTimes(1);
    expect(operation.saveCalculation).toHaveBeenCalledTimes(1);
    expect(operation.saveCalculation.mock.calls[0][0]).toBe(2);
    expect(JSON.stringify(results[0])).toBe(before);
  });

  it('retoma variáveis sem apagar ou regravar a memória de fórmulas já calculadas', async () => {
    const {service, db, employee, execution} = engine();
    execution.filial.formula[1].expressao = ':X + :Y';
    execution.filial.variavel.push({variavel_id: 2, codigo: 'Y', nome: 'Y', ativa: true, valor_fixo: 20});
    const answer = await service.processarVariaveisBatch(1, [employee] as never, 'test', {owner: 'test', queueIds: [1], batchSize: 25, retryBaseIds: new Set([1])});
    expect(answer.status).toBe(true);
    expect(db.memoria_calculo.deleteMany).not.toHaveBeenCalled();
    const inserted = db.memoria_calculo.createMany.mock.calls.flatMap((call: any[]) => call[0].data);
    expect(inserted.length).toBeGreaterThan(0);
    expect(inserted.every((row: any) => row.execucao_funcionario_id === 2 && row.variavel_codigo === 'Y')).toBe(true);
  });
});


describe('Pendências ainda não processadas', () => {
  it('inclui início e variáveis com erro sem repetir quem já passou dessa etapa', () => {
    expect(hasStagePending(base(1, 'PREVIA'), 'VARIAVEIS')).toBe(true);
    expect(hasStagePending({status: null, execucao_funcionario: []}, 'VARIAVEIS')).toBe(true);
    expect(hasStagePending(base(1, 'ERRO_VARIAVEIS'), 'VARIAVEIS')).toBe(true);
    expect(hasStagePending(base(1, 'VARIAVEIS_PROCESSADAS'), 'VARIAVEIS')).toBe(false);
    expect(hasStagePending(base(1, 'ERRO_VARIAVEIS'), 'VALORES')).toBe(false);
    expect(hasStagePending(base(1, 'PREVIA'), 'VALORES')).toBe(false);
  });
  it('inclui fórmulas faltantes, nulas ou com erro e preserva concluídos e enviados', () => {
    expect(hasStagePending(base(1, 'VARIAVEIS_PROCESSADAS'), 'VALORES')).toBe(true);
    expect(hasStagePending(base(1, 'RESULTADOS_PROCESSADOS', [result(1, 'PREVIA', null)]), 'VALORES')).toBe(true);
    expect(hasStagePending(base(1, 'RESULTADOS_PROCESSADOS', [result(1, 'PROCESSADO', 0)]), 'VALORES')).toBe(false);
    expect(hasStagePending(base(1, 'ENVIADO_RM', [result(1, 'ENVIADO_RM', 0)]), 'VALORES')).toBe(false);
    expect(hasStagePending(base(1, 'RESULTADOS_PROCESSADOS', [result(1, 'PROCESSADO', 0)]), 'VALORES', true)).toBe(true);
    expect(retriesOnlyErrors('{"somentePendencias":true}')).toBe(true);
  });
  it('conta e enfileira somente as pendências prontas, incluindo fórmulas ainda ausentes', async () => {
    const rows = [base(1, 'PREVIA'), base(2, 'VARIAVEIS_PROCESSADAS'), base(3, 'RESULTADOS_PROCESSADOS', [result(1, 'PROCESSADO', 42)]), base(4, 'ERRO_VARIAVEIS', [], true)];
    const inactiveOnly = base(5, 'RESULTADOS_PROCESSADOS', [result(1, 'PROCESSADO', 42), result(2, 'ERRO', null)]);
    inactiveOnly.execucao.filial = {nome: 'Teste', formula: [{formula_id: 1}]} as any;
    rows.push(inactiveOnly);
    rows[2].execucao.filial = {nome: 'Teste', formula: [{formula_id: 1}, {formula_id: 2}]} as any;
    const db: any = {execucao_funcionario_base: {findMany: jest.fn(async () => rows)}, execucao_queue: {findMany: jest.fn(async () => []), create: jest.fn()}, execucao: {updateMany: jest.fn()}, $queryRaw: jest.fn(async () => [{execucao_id: 1}])};
    db.$transaction = (fn: any) => fn(db);
    const service = new OperacaoService(db, {} as never);
    expect(await service.retryScope(1, true)).toMatchObject({VARIAVEIS: {elegiveis: 1, bloqueados: 1}, VALORES: {elegiveis: 2, bloqueados: 0}});
    await service.execute({etapa: 'VALORES', execucaoIds: [1], somentePendencias: true}, 1, 'test');
    expect(db.execucao_queue.create.mock.calls.map((call: any[]) => call[0].data.execucao_funcionario_base_id)).toEqual([2, 3]);
    for (const [call] of db.execucao_queue.create.mock.calls) expect(JSON.parse(call.data.revisao_payload).somentePendencias).toBe(true);
    await expect(service.execute({etapa: 'ENVIAR_RM', execucaoIds: [1], somentePendencias: true}, 1, 'test')).rejects.toThrow('somente');
  });
});
