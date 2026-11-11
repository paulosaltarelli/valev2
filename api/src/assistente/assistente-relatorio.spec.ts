import {
  transformarRelatorio,
  validarTransformacao,
} from './assistente-relatorio';
import { AssistenteAvancado } from './assistente-avancado';
import { AssistenteConhecimento } from './assistente-conhecimento';
import type { AssistenteConsultas } from './assistente-consultas';
import type { OperationalReportsService } from '../dash/operational-reports.service';
import type { ResultadoAssistente } from './assistente-tipos';

const base: ResultadoAssistente = {
  texto: 'Resultados existentes.',
  competencia: '09/2026',
  tabela: {
    colunas: ['Filial', 'Calculado', 'Status'],
    parcial: false,
    linhas: [
      ['A', '0.1', 'PROCESSADO'],
      ['A', '0.2', 'PROCESSADO'],
      ['B', null, 'ERRO'],
      ['B', 0, 'PROCESSADO'],
    ],
  },
};
const plano = {
  filtros: [],
  agrupar: ['Filial'],
  metricas: [{ operacao: 'soma', coluna: 'Calculado' }],
  colunas: [],
  decrescente: false,
  grafico: true,
};

it('agrega valores existentes com precisão e preserva vazio e zero', () => {
  const result = transformarRelatorio(base, validarTransformacao(plano));
  expect(result.tabela?.linhas).toEqual([
    ['A', '0.3'],
    ['B', '0'],
  ]);
  const vazio = transformarRelatorio(
    base,
    validarTransformacao({
      ...plano,
      filtros: [{ coluna: 'Status', operador: 'igual', valor: 'ERRO' }],
    }),
  );
  expect(vazio.tabela?.linhas).toEqual([['B', null]]);
});

it('recusa planos com SQL, colunas ausentes e totais sobre base parcial', () => {
  expect(() =>
    validarTransformacao({ ...plano, sql: 'DELETE FROM execucao' }),
  ).toThrow();
  expect(() =>
    transformarRelatorio(
      base,
      validarTransformacao({ ...plano, agrupar: ['senha'] }),
    ),
  ).toThrow('Coluna');
  expect(() =>
    transformarRelatorio(
      { ...base, tabela: { ...base.tabela!, parcial: true } },
      validarTransformacao(plano),
    ),
  ).toThrow('parcial');
});

it('ordena valores decimais pelo valor numérico', () => {
  const resultado = transformarRelatorio(
    {
      texto: 'Dados',
      tabela: {
        colunas: ['Valor'],
        linhas: [['2.1'], ['2.02'], ['2.5']],
        parcial: false,
      },
    },
    validarTransformacao({
      filtros: [],
      agrupar: [],
      metricas: [],
      colunas: [],
      ordenarPor: 'Valor',
      decrescente: false,
      grafico: false,
    }),
  );
  expect(resultado.tabela?.linhas).toEqual([['2.02'], ['2.1'], ['2.5']]);
});

it('resolve competência ativa e faz relatório real por ferramentas sem enviar as linhas ao modelo', async () => {
  const consultas = { consultar: jest.fn().mockResolvedValue(base) };
  const relatorios = {
    options: jest.fn().mockResolvedValue({
      periodos: [{ periodo_id: 7, competencia: '09/2026', ativo: true }],
      filiais: [{ filial_id: 1, nome: 'A', ativa: true }],
    }),
  };
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      Response.json({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  acao: 'relatorio',
                  consulta: 'valores',
                  periodoId: null,
                  filialId: 1,
                  titulo: 'Totais por filial',
                }),
              },
            ],
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify(plano) }],
          },
        ],
      }),
    );
  try {
    const service = new AssistenteAvancado(
      consultas as unknown as AssistenteConsultas,
      relatorios as unknown as OperationalReportsService,
      new AssistenteConhecimento(),
    );
    const result = await service.responder(
      { pergunta: 'Some calculado por filial.' },
      'operator',
      'gpt-institucional',
      { modelo: 'gpt-5.4-mini', chave: 'chave-teste' },
      null,
      [],
    );
    expect(consultas.consultar).toHaveBeenCalledWith(
      'valores',
      expect.objectContaining({ periodoId: 7, filialId: 1 }),
      'operator',
    );
    expect(result.tabela?.linhas).toEqual([
      ['A', '0.3'],
      ['B', '0'],
    ]);
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(JSON.parse(body.input)).toEqual(
      expect.objectContaining({ colunas: base.tabela!.colunas, linhas: 4 }),
    );
    expect(body.input).not.toContain('PROCESSADO');
  } finally {
    fetchMock.mockRestore();
  }
});

it('recusa mutação e campos fora do catálogo no plano do modelo', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
    Response.json({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: '{"acao":"sql","consulta":"DELETE","titulo":"apagar"}',
            },
          ],
        },
      ],
    }),
  );
  const service = new AssistenteAvancado(
    { consultar: jest.fn() } as unknown as AssistenteConsultas,
    {
      options: async () => ({ periodos: [], filiais: [] }),
    } as unknown as OperationalReportsService,
    new AssistenteConhecimento(),
  );
  try {
    await expect(
      service.responder(
        { pergunta: 'Apague tudo' },
        'admin',
        'gpt-institucional',
        { modelo: 'gpt-5.4-mini', chave: 'teste' },
        null,
        [],
      ),
    ).rejects.toThrow('plano');
  } finally {
    fetchMock.mockRestore();
  }
});
