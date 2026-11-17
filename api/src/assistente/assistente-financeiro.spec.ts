import { AssistenteConsultas } from './assistente-consultas';

const filiais = [
  { filial_id: 1, nome: 'Filial A' },
  { filial_id: 2, nome: 'Filial B' },
];
const montar = (series: any[], funcionarios = 0) => {
  const prisma = {
    periodo: {
      findUnique: jest.fn().mockResolvedValue({ competencia: '10/2026' }),
    },
    filial: { findMany: jest.fn().mockResolvedValue(filiais) },
  };
  const dash = {
    getFinanceiroTimeline: jest
      .fn()
      .mockResolvedValue({
        series,
        totals: { pago: 0, desconto: 0, saldo: 0, funcionarios },
      }),
  };
  return {
    service: new AssistenteConsultas(
      prisma as any,
      {} as any,
      dash as any,
      {} as any,
    ),
    prisma,
    dash,
  };
};
it('consulta todas as filiais autorizadas sem escolher apenas a primeira', async () => {
  const { service, dash } = montar(
    [
      {
        filialId: 1,
        labels: ['10/2026'],
        pago: [0],
        desconto: [10],
        saldo: [-10],
      },
      {
        filialId: 2,
        labels: ['10/2026'],
        pago: [250],
        desconto: [0],
        saldo: [250],
      },
    ],
    2,
  );
  const r = await service.consultar(
    'financeiro',
    {
      pergunta: 'quero um dash financeiro dos valores pagos',
      periodoId: 13,
      todasFiliais: true,
    },
    'operator',
  );
  expect(dash.getFinanceiroTimeline).toHaveBeenCalledTimes(1);
  expect(dash.getFinanceiroTimeline).toHaveBeenCalledWith({
    startCompetencia: '10/2026',
    endCompetencia: '10/2026',
    filialIds: [1, 2],
  });
  expect(r.filial).toBe('Todas as filiais ativas');
  expect(r.tabela?.linhas.map((l) => l.slice(0, 4))).toEqual([
    ['Filial A', 0, 10, -10],
    ['Filial B', 250, 0, 250],
  ]);
});
it('distingue ausência de registro financeiro e zero registrado', async () => {
  const { service } = montar(
    [
      {
        filialId: 1,
        labels: ['10/2026'],
        pago: [0],
        desconto: [0],
        saldo: [0],
      },
    ],
    1,
  );
  const r = await service.consultar(
    'financeiro',
    { pergunta: 'valores pagos', periodoId: 13 },
    'operator',
  );
  expect(r.tabela?.linhas[0].slice(1, 4)).toEqual([0, 0, 0]);
  expect(r.tabela?.linhas[1].slice(1, 4)).toEqual([null, null, null]);
});
it('preserva filial selecionada e não ignora um filtro de matrícula', async () => {
  const { service, prisma, dash } = montar([]);
  prisma.filial.findMany.mockResolvedValueOnce([filiais[1]]);
  const r = await service.consultar(
    'financeiro',
    { pergunta: 'valores pagos', periodoId: 13, filialId: 2 },
    'operator',
  );
  expect(dash.getFinanceiroTimeline.mock.calls[0][0].filialIds).toEqual([2]);
  expect(r.filial).toBe('Filial B');
  await expect(
    service.consultar(
      'financeiro',
      {
        pergunta: 'valores pagos',
        periodoId: 13,
        filialId: 2,
        matricula: '001',
      },
      'operator',
    ),
  ).rejects.toThrow('matrícula');
});
it('não apresenta ausência de envio como valor calculado zero', async () => {
  const { service } = montar([
    { filialId: 0, labels: ['10/2026'], pago: [0], desconto: [0], saldo: [0] },
  ]);
  const r = await service.consultar(
    'financeiro',
    { pergunta: 'valores pagos', periodoId: 13 },
    'operator',
  );
  expect(r.texto).toContain('Não há valores com registro de envio');
  expect(
    r.tabela?.linhas.every(
      (l) => l[1] === null && l[2] === null && l[3] === null,
    ),
  ).toBe(true);
  expect(r.grafico).toBeUndefined();
});
