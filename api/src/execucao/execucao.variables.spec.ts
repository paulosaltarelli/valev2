import { ExecucaoService } from './execucao.service';

const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 2));

function fixture(concurrency: number, failEmployee?: string) {
  process.env.VARIABLE_CONCURRENCY = String(concurrency);
  const bases = Array.from({ length: 8 }, (_, i) => ({
    execucao_funcionario_base_id: i + 1,
    funcionario_id_rm: String(i + 1), codcoligada: 1, codfilial: 1,
  }));
  const execution = {
    execucao_id: 1, execucao_funcionario_base: bases,
    periodo: { data_inicio: new Date('2026-10-01Z'), data_fim: new Date('2026-10-31Z') },
    filial: {
      km_max: { toNumber: () => 70 },
      formula: [{ formula_id: 1, expressao: ':A + :B + :FIXA' }, { formula_id: 2, expressao: ':A * 2' }],
      variavel: [
        { variavel_id: 1, codigo: 'A', nome: 'A', ativa: true, sql_codigo_rm: 'PVE.A', valor_fixo: null },
        { variavel_id: 2, codigo: 'B', nome: 'B', ativa: true, sql_codigo_rm: 'PVE.B', valor_fixo: null },
        { variavel_id: 3, codigo: 'FIXA', nome: 'Fixa', ativa: true, sql_codigo_rm: null, valor_fixo: 10 },
      ],
    },
  };
  const memory: unknown[] = [];
  const prisma = {
    execucao: { findUnique: jest.fn().mockImplementation(async (query) => {
      const filter = query.include.execucao_funcionario_base;
      return {
        ...execution,
        execucao_funcionario_base: filter === true ? bases : bases.filter(
          b => filter.where.execucao_funcionario_base_id.in.includes(b.execucao_funcionario_base_id),
        ),
      };
    }) },
    execucao_funcionario: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(({ create }) => Promise.resolve({ ...create, execucao_funcionario_id: create.execucao_funcionario_base_id * 10 + create.formula_id })),
    },
    execucao_funcionario_base: { updateMany: jest.fn().mockResolvedValue({ count: 8 }) },
    memoria_calculo: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn(({ data }) => { memory.push(...data); return Promise.resolve({ count: data.length }); }),
    },
    log_execucao: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  let active = 0;
  let peak = 0;
  const perEmployee = new Map<string, number>();
  const rm = { realizaConsultaSql: jest.fn(async (sql: string, params: { CHAPA: string }) => {
    active++;
    peak = Math.max(peak, active);
    const n = (perEmployee.get(params.CHAPA) ?? 0) + 1;
    perEmployee.set(params.CHAPA, n);
    expect(n).toBe(1);
    await delay();
    active--;
    perEmployee.set(params.CHAPA, n - 1);
    return {
      status: params.CHAPA !== failEmployee,
      message: params.CHAPA === failEmployee ? 'RM unavailable' : 'ok',
      data: [{ RESULTADO: sql === 'PVE.A' ? Number(params.CHAPA) : 0 }],
    };
  }) };
  const service = new ExecucaoService(prisma as never, {} as never, {} as never, rm as never, {} as never);
  const log = jest.spyOn((service as unknown as { logger: { log(message: string): void } }).logger, 'log').mockImplementation(() => {});
  jest.spyOn(service, 'getExecucaoById').mockResolvedValue(execution as never);
  return { service, bases, prisma, rm, memory, log, peak: () => peak, active: () => active };
}

describe('Variable processing with four employees', () => {
  const original = process.env.VARIABLE_CONCURRENCY;
  afterAll(() => {
    if (original === undefined) delete process.env.VARIABLE_CONCURRENCY;
    else process.env.VARIABLE_CONCURRENCY = original;
  });

  it('preserves serial values, zero results, fixed values and per-formula cache', async () => {
    const serial = fixture(1);
    const parallel = fixture(4);
    await serial.service.processarVariaveisBatch(1, serial.bases as never, 'session');
    await parallel.service.processarVariaveisBatch(1, parallel.bases as never, 'session');
    const normalize = (rows: unknown[]) => rows.map(x => JSON.stringify(x)).sort();
    expect(normalize(parallel.memory)).toEqual(normalize(serial.memory));
    expect(parallel.memory).toHaveLength(32);
    expect(parallel.rm.realizaConsultaSql).toHaveBeenCalledTimes(16);
    expect(parallel.peak()).toBe(4);
    expect(serial.peak()).toBe(1);
    expect(parallel.active()).toBe(0);
    const query = parallel.prisma.execucao.findUnique.mock.calls[0][0];
    expect(query.include.execucao_funcionario_base).toEqual({
      where: { execucao_funcionario_base_id: { in: [1,2,3,4,5,6,7,8] } },
    });
    expect(JSON.stringify(query)).not.toContain('memoria_calculo');
    expect(parallel.service.getExecucaoById).not.toHaveBeenCalled();
    for (const base of parallel.bases) {
      const calls = parallel.rm.realizaConsultaSql.mock.calls.filter(([,p]) => p.CHAPA === base.funcionario_id_rm);
      expect(calls.map(([sql]) => sql)).toEqual(['PVE.A', 'PVE.B']);
    }
  });

  it('records an employee failure without mixing another employee values or status', async () => {
    const f = fixture(4, '3');
    await f.service.processarVariaveisBatch(1, f.bases as never, 'session');
    expect(f.active()).toBe(0);
    expect(f.prisma.log_execucao.create).toHaveBeenCalledTimes(1);
    const updates = f.prisma.execucao_funcionario_base.updateMany.mock.calls.map(([x]) => x);
    expect(updates).toContainEqual({ where: { execucao_funcionario_base_id: { in: [3] } }, data: { status: 'ERRO_VARIAVEIS' } });
    const success = updates.find(x => x.data.status === 'VARIAVEIS_PROCESSADAS');
    expect(success.where.execucao_funcionario_base_id.in.sort((a: number,b: number) => a-b)).toEqual([1,2,4,5,6,7,8]);
    expect(f.rm.realizaConsultaSql).toHaveBeenCalledTimes(15);
  });

  it('also bounds the full-execution endpoint and preserves its serial memory', async () => {
    const serial = fixture(1);
    const parallel = fixture(4);
    await serial.service.processarVariaveis(1, 'session');
    await parallel.service.processarVariaveis(1, 'session');
    const normalize = (rows: unknown[]) => rows.map(x => JSON.stringify(x)).sort();
    expect(normalize(parallel.memory)).toEqual(normalize(serial.memory));
    expect(parallel.memory).toHaveLength(32);
    expect(parallel.peak()).toBe(4);
    expect(parallel.active()).toBe(0);
    expect(parallel.rm.realizaConsultaSql).toHaveBeenCalledTimes(16);
  });

  it('processes only the selected batch and reports aggregate timings without employee payloads', async () => {
    const f = fixture(4);
    await f.service.processarVariaveisBatch(1, f.bases.slice(0, 2) as never, 'session');
    expect(f.rm.realizaConsultaSql).toHaveBeenCalledTimes(4);
    expect(f.memory).toHaveLength(8);
    const line = f.log.mock.calls.map(([message]) => message).find(m => m.startsWith('[variables.batch] '));
    const summary = JSON.parse(line!.substring('[variables.batch] '.length));
    expect(summary.funcionarios).toBe(2);
    expect(summary.cacheHits).toBe(2);
    expect(summary.consultas.reduce((n: number, x: { chamadas: number }) => n + x.chamadas, 0)).toBe(4);
    expect(summary.duracaoMs).toBeGreaterThanOrEqual(0);
    expect(line).not.toContain('CHAPA');
    expect(line).not.toContain('RESULTADO');
    expect(line).not.toContain('session');
  });
});
