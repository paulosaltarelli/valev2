import { AssistenteConsultas } from './assistente-consultas';
import { AssistenteAvancado, retomarTodasFiliais } from './assistente-avancado';
import { AssistenteConhecimento } from './assistente-conhecimento';
import type { PrismaService } from '../prisma/prisma.service';
import type { OperationalReportsService } from '../dash/operational-reports.service';
import type { ExecucaoService } from '../execucao/execucao.service';
import type { DashService } from '../dash/dash.service';
import type { AssistenteSql } from './assistente-sql';
import type { AssistenteInvestigacao } from './assistente-investigacao';
import { contextoConsulta, type ContextoErros } from './assistente-tipos';

it.each(['Gere HTML e Excel dos funcionários com erro na competência ativa','tem funcionário com erro?'])('detalha o grupo sem SQL paralelo: %s', async (pergunta) => {
  const grupo: ContextoErros = {
    tipo: 'funcionarios_com_erro',
    periodoId: 7,
    competencia: '10/2026',
    filial: 'Todas as filiais ativas',
    execucaoIds: [1],
    funcionarioBaseIds: [123],
    total: 1,
    parcial: false,
    capturadoEm: new Date().toISOString(),
  };
  const consultas = {
    consultar: jest
      .fn()
      .mockResolvedValue({ texto: 'Panorama', [contextoConsulta]: grupo }),
  };
  const investigacao = {
    responderGrupo: jest
      .fn()
      .mockResolvedValue({
        texto: 'Detalhado',
        tabela: {
          colunas: ['Funcionário'],
          linhas: [['Caso']],
          parcial: false,
        },
      }),
  };
  const sql = { responder: jest.fn() };
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      Response.json({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  acao: 'sql',
                  consulta: 'erros',
                  periodoId: 7,
                  filialId: null,
                  titulo: 'Relatório',
                  funcionario: pergunta.startsWith('Gere')?'funcionarios com erro':undefined,
                }),
              },
            ],
          },
        ],
      }),
    );
  try {
    const service = new AssistenteAvancado(
      consultas as unknown as AssistenteConsultas,
      {
        options: async () => ({
          periodos: [{ periodo_id: 7, competencia: '10/2026', ativo: true }],
          filiais: [],
        }),
      } as unknown as OperationalReportsService,
      new AssistenteConhecimento(),
      sql as unknown as AssistenteSql,
      investigacao as unknown as AssistenteInvestigacao,
    );
    const r = await service.responder(
      {
        pergunta,
      },
      'operator',
      'gpt-institucional',
      { modelo: 'gpt-5.4-mini', chave: 'teste' },
      null,
      [{pergunta:'consulta anterior',resposta:'IDENTIFICACAO_PRIVADA_123',respostaModelo:'Resumo anonimizado'}],
    );
    expect(r.texto).toBe('Detalhado');
    expect(consultas.consultar).toHaveBeenCalledWith(
      'erros',
      expect.objectContaining({ periodoId: 7, filialId: undefined }),
      'operator',
    );
    expect(investigacao.responderGrupo).toHaveBeenCalledWith(
      grupo,
      'gpt-institucional',
      expect.any(Object),
      null,
    );
    expect(sql.responder).not.toHaveBeenCalled();
    if(pergunta.startsWith('Gere')){
      expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain('IDENTIFICACAO_PRIVADA_123');
      expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('vale_ia_composicao');
    }else expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    fetchMock.mockRestore();
  }
});

it('consulta erros em todas as filiais e evidencia duplicidades sem consolidá-las', async () => {
  const prisma = {
    periodo: { findUnique: async () => ({ competencia: '10/2026' }) },
    execucao: {
      findMany: jest.fn().mockResolvedValue([
        { execucao_id: 1, filial_id: 10, filial: { nome: 'Alfa' } },
        { execucao_id: 2, filial_id: 20, filial: { nome: 'Beta' } },
        { execucao_id: 3, filial_id: 20, filial: { nome: 'Beta' } },
      ]),
    },
    execucao_funcionario_base: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { execucao_funcionario_base_id: 910001 },
          { execucao_funcionario_base_id: 910002 },
        ]),
      groupBy: jest.fn().mockResolvedValue([
        { execucao_id: 1, _count: 2 },
        { execucao_id: 2, _count: 9 },
        { execucao_id: 3, _count: 9 },
      ]),
    },
  };
  const service = new AssistenteConsultas(
    prisma as unknown as PrismaService,
    {} as ExecucaoService,
    {} as DashService,
    {} as OperationalReportsService,
  );
  const resposta = await service.consultar(
    'erros',
    { pergunta: 'tem funcionario com erro ?', periodoId: 7 },
    'operator',
  );
  expect(resposta.texto).toContain('2 registro(s)');
  expect(resposta.texto).toContain('execuções duplicadas');
  expect(resposta.filial).toBe('Todas as filiais ativas');
  expect(resposta.tabela?.linhas).toEqual([
    ['Alfa', 1, 2, 'Erro registrado na base ou em resultado por fórmula'],
    ['Beta', '2, 3', null, 'Execuções duplicadas — contagem não consolidada'],
  ]);
  const where = prisma.execucao_funcionario_base.groupBy.mock.calls[0][0].where;
  expect(where.OR).toContainEqual({ status: { startsWith: 'ERRO_' } });
  expect(JSON.stringify(where)).not.toContain('valor_calculado');
});

it('recupera a pergunta original após o loop antigo de respostas “todas”', () => {
  expect(
    retomarTodasFiliais({ pergunta: 'todas', filialId: 9 }, [
      {
        pergunta: 'tem funcionario com erro ?',
        resposta: 'Selecione uma filial para esta consulta.',
      },
      {
        pergunta: 'todas',
        resposta:
          'Qual filial você quer consultar? Pode responder só com o nome.',
      },
    ]),
  ).toEqual({
    pergunta: 'tem funcionario com erro ? · todas as filiais',
    filialId: undefined,
    todasFiliais: true,
  });
});

it('resolve panorama e continuação sem pedir filtro, mesmo se o modelo sugerir uma filial', async () => {
  const consultas = {
    consultar: jest.fn().mockResolvedValue({
      texto: 'Sim. Há 2 registros com erro.',
      competencia: '10/2026',
      filial: 'Todas as filiais ativas',
    }),
  };
  const relatorios = {
    options: async () => ({
      periodos: [{ periodo_id: 7, competencia: '10/2026', ativo: true }],
      filiais: [{ filial_id: 9, nome: 'Alfa', ativa: true }],
    }),
  };
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () =>
    Response.json({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                acao: 'investigar',
                consulta: 'erros',
                periodoId: 7,
                filialId: 9,
                titulo: 'Erros',
              }),
            },
          ],
        },
      ],
    }),
  );
  try {
    const service = new AssistenteAvancado(
      consultas as unknown as AssistenteConsultas,
      relatorios as unknown as OperationalReportsService,
      new AssistenteConhecimento(),
      {} as AssistenteSql,
      {} as AssistenteInvestigacao,
    );
    await service.responder(
      { pergunta: 'tem funcionario com erro ?' },
      'operator',
      'gpt-institucional',
      { modelo: 'gpt-5.4-mini', chave: 'teste' },
      null,
      [],
    );
    expect(consultas.consultar).toHaveBeenNthCalledWith(
      1,
      'erros',
      expect.objectContaining({ periodoId: 7, filialId: undefined }),
      'operator',
    );
    const resposta = await service.responder(
      { pergunta: 'todas', filialId: 9 },
      'operator',
      'gpt-institucional',
      { modelo: 'gpt-5.4-mini', chave: 'teste' },
      null,
      [
        {
          pergunta: 'tem funcionario com erro ?',
          resposta: 'Selecione uma filial para esta consulta.',
        },
      ],
    );
    expect(resposta.texto).toContain('2 registros');
    expect(consultas.consultar).toHaveBeenCalledWith(
      'erros',
      expect.objectContaining({
        periodoId: 7,
        filialId: undefined,
        todasFiliais: true,
        pergunta: 'tem funcionario com erro ? · todas as filiais',
      }),
      'operator',
    );
  } finally {
    fetchMock.mockRestore();
  }
});
