import {
  AssistenteInvestigacao,
  resumirLogInvestigacao,
} from './assistente-investigacao';
import type { PrismaService } from '../prisma/prisma.service';
import type { AssistenteConhecimento } from './assistente-conhecimento';

const contexto = { periodoId: 7, competencia: '10/2026', filialId: 9 };
const credencial = { modelo: 'gpt-5.4-mini', chave: 'teste' };
const pessoa = {
  execucao_funcionario_base_id: 1,
  funcionario_id_rm: '000123',
  nome_funcionario: 'PESSOA DE TESTE',
  status: 'ERRO_RESULTADOS',
  execucao: {
    execucao_id: 44,
    filial_id: 9,
    filial: { nome: 'Filial de teste' },
  },
};
function preparar(candidatos = [pessoa]) {
  const prisma = {
    execucao_funcionario_base: {
      findMany: jest.fn().mockResolvedValue(candidatos),
    },
    execucao: { findMany: jest.fn().mockResolvedValue([{ execucao_id: 44 }]) },
    execucao_funcionario: {
      findMany: jest.fn().mockResolvedValue([
        {
          formula_id: 1,
          status: 'ERRO',
          valor_calculado: null,
          valor_final: null,
          ajuste_manual: false,
          formula_snapshot: null,
          formula: { nome: 'Vale', versao: 2 },
          _count: { memoria_calculo: 3 },
          memoria_calculo: [{ variavel_codigo: 'DIAS' }],
        },
        {
          formula_id: 2,
          status: 'PROCESSADO',
          valor_calculado: '0.00',
          valor_final: '0.00',
          ajuste_manual: false,
          formula_snapshot: null,
          formula: { nome: 'Desconto', versao: 1 },
          _count: { memoria_calculo: 1 },
          memoria_calculo: [{ variavel_codigo: 'DIAS' }],
        },
      ]),
    },
    log_execucao: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          {
            mensagem:
              'Erro ao calcular fórmula 1 para funcionário 000123: password=SEGREDO_NAO_EXPORTAR',
            data_log: new Date('2026-11-01T12:00:00Z'),
          },
        ]),
    },
    execucao_queue: {
      groupBy: jest.fn().mockResolvedValue([{ status: 'ERRO', _count: 1 }]),
    },
    formula: { count: jest.fn().mockResolvedValue(2) },
  };
  const conhecimento = {
    investigacao: () => ({
      trechos: [
        {
          caminho: 'api/src/execucao/execucao.service.ts',
          linha: 10,
          trecho: "if (!resultado.status) status = 'ERRO';",
        },
      ],
      fontes: ['api/src/execucao/execucao.service.ts:10'],
      estado: { revisao: 'teste', atualizadoEm: '2026-11-11' },
    }),
  };
  return {
    prisma,
    service: new AssistenteInvestigacao(
      prisma as unknown as PrismaService,
      conhecimento as unknown as AssistenteConhecimento,
    ),
  };
}

it('distingue erro, ausência e zero e cruza fatos do banco com código sem enviar identificação pessoal ou log bruto', async () => {
  const { prisma, service } = preparar();
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
                text: 'Evidências: há resultados parciais. Limitação: log histórico. Próximo passo: conferir a execução.',
              },
            ],
          },
        ],
      }),
    );
  try {
    const resposta = await service.responder(
      '000123',
      contexto,
      'gpt-institucional',
      credencial,
    );
    expect(prisma.execucao_funcionario_base.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          execucao: { periodo_id: 7, filial_id: 9 },
        }),
      }),
    );
    expect(resposta.tabela?.linhas[0][3]).toBe('Erro');
    expect(resposta.tabela?.linhas[0][4]).toBeNull();
    expect(resposta.tabela?.linhas[1][3]).toBe('Calculado com zero');
    expect(resposta.tabela?.linhas[1][4]).toBe('0.00');
    expect(resposta.texto).toContain('1 de 2');
    expect(resposta.fonte).toContain('execucao.service.ts:10');
    const enviado = String(fetchMock.mock.calls[0][1]?.body);
    expect(enviado).toContain('memoriasGravadas');
    expect(enviado).toContain('execucao.service.ts');
    expect(enviado).not.toContain('SEGREDO_NAO_EXPORTAR');
    expect(enviado).not.toContain('000123');
    expect(enviado).not.toContain('PESSOA DE TESTE');
    expect(resposta.detalhes).not.toContain('SEGREDO_NAO_EXPORTAR');
  } finally {
    fetchMock.mockRestore();
  }
});

it('não escolhe uma pessoa ou execução silenciosamente em uma identificação ambígua', async () => {
  const { prisma, service } = preparar([
    pessoa,
    { ...pessoa, execucao_funcionario_base_id: 2 },
  ]);
  const resposta = await service.responder(
    'PESSOA',
    contexto,
    'gpt-institucional',
    credencial,
  );
  expect(resposta.texto).toContain('mais de um registro');
  expect(prisma.execucao_funcionario.findMany).not.toHaveBeenCalled();
});

it('bloqueia diagnóstico quando há execuções duplicadas mesmo que apenas uma contenha a pessoa', async () => {
  const { prisma, service } = preparar();
  prisma.execucao.findMany.mockResolvedValue([
    { execucao_id: 44 },
    { execucao_id: 45 },
  ]);
  const resposta = await service.responder(
    '000123',
    contexto,
    'gpt-institucional',
    credencial,
  );
  expect(resposta.texto).toContain('execuções duplicadas');
  expect(prisma.execucao_funcionario.findMany).not.toHaveBeenCalled();
});

it('pede apenas a identificação indispensável e não inventa causa para pessoa ausente', async () => {
  const { prisma, service } = preparar([]);
  expect(
    (
      await service.responder(
        undefined,
        contexto,
        'gpt-institucional',
        credencial,
      )
    ).texto,
  ).toContain('nome ou a matrícula');
  expect(prisma.execucao_funcionario_base.findMany).not.toHaveBeenCalled();
  expect(
    (
      await service.responder(
        'AUSENTE',
        contexto,
        'gpt-institucional',
        credencial,
      )
    ).texto,
  ).toContain('não confirma falha na importação');
});

it('não associa matrícula por prefixo e não expõe mensagens técnicas arbitrárias', () => {
  expect(
    resumirLogInvestigacao(
      'Erro ao calcular fórmula 1 para funcionário 1234: password=secreto',
      '123',
    ),
  ).toBeNull();
  expect(resumirLogInvestigacao('ERRO: password=secreto', '123')).toBeNull();
});
