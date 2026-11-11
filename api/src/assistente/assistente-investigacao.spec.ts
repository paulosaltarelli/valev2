import {
  AssistenteInvestigacao,
  resumirLogInvestigacao,
} from './assistente-investigacao';
import type { PrismaService } from '../prisma/prisma.service';
import type { AssistenteConhecimento } from './assistente-conhecimento';
import type { ContextoErros } from './assistente-tipos';

const contexto = { periodoId: 7, competencia: '10/2026', filialId: 9 };
const credencial = { modelo: 'gpt-5.4-mini', chave: 'teste' };
const grupo: ContextoErros = {
  tipo: 'funcionarios_com_erro',
  periodoId: 7,
  competencia: '10/2026',
  filial: 'Todas as filiais ativas',
  execucaoIds: [44],
  funcionarioBaseIds: [1],
  total: 1,
  parcial: false,
  capturadoEm: '2026-11-11T12:00:00Z',
};
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
    periodo: { findUnique: jest.fn().mockResolvedValue({ ativo: true }) },
    execucao_funcionario_base: {
      findMany: jest.fn().mockResolvedValue(candidatos),
    },
    execucao: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ execucao_id: 44, filial_id: 9 }]),
    },
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
      findMany: jest.fn().mockResolvedValue([
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
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
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

it('lista o grupo capturado com banco e código e não envia nomes ou matrículas ao provedor', async () => {
  const { service, prisma } = preparar();
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
    Response.json({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                casos: {
                  'Caso 1':
                    'Evidência histórica: rejeição da calculadora. Limitação: causa atual não confirmada. Próximo passo: conferir o log na execução.',
                },
              }),
            },
          ],
        },
      ],
    }),
  );
  try {
    const resposta = await service.responderGrupo(
      grupo,
      'gpt-institucional',
      credencial,
    );
    expect(prisma.execucao_funcionario_base.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          execucao_id: { in: [44] },
          execucao_funcionario_base_id: { in: [1] },
        },
      }),
    );
    expect(resposta.competencia).toBe('10/2026');
    expect(resposta.filial).toBe('Todas as filiais ativas');
    expect(resposta.tabela?.linhas[0].slice(0, 7)).toEqual([
      '000123',
      'PESSOA DE TESTE',
      'Filial de teste',
      44,
      'ERRO_RESULTADOS',
      1,
      1,
    ]);
    expect(resposta.tabela?.linhas[0][7]).toContain('rejeição da calculadora');
    expect(resposta.tabela?.parcial).toBe(false);
    expect(resposta.fonte).toContain('execucao.service.ts');
    const enviado = String(fetchMock.mock.calls[0][1]?.body);
    expect(enviado).not.toContain('PESSOA DE TESTE');
    expect(enviado).not.toContain('000123');
    expect(enviado).not.toContain('SEGREDO_NAO_EXPORTAR');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    fetchMock.mockRestore();
  }
});

it('não consulta dados de execuções que ficaram duplicadas após o panorama', async () => {
  const { service, prisma } = preparar();
  prisma.execucao.findMany.mockResolvedValue([
    { execucao_id: 44, filial_id: 9 },
    { execucao_id: 45, filial_id: 9 },
  ]);
  prisma.execucao_funcionario_base.findMany.mockResolvedValue([]);
  const result = await service.responderGrupo(
    grupo,
    'gpt-institucional',
    credencial,
  );
  expect(prisma.execucao_funcionario_base.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ execucao_id: { in: [] } }),
    }),
  );
  expect(result.tabela?.linhas).toHaveLength(0);
  expect(result.tabela?.parcial).toBe(true);
  expect(prisma.execucao_funcionario.findMany).not.toHaveBeenCalled();
});

it('não associa uma explicação do modelo a uma referência de pessoa inventada', async () => {
  const { service } = preparar();
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
    Response.json({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                casos: { 'Caso 999': 'Causa falsa inventada' },
              }),
            },
          ],
        },
      ],
    }),
  );
  try {
    const result = await service.responderGrupo(
      grupo,
      'gpt-institucional',
      credencial,
    );
    expect(result.texto).toContain('síntese do provedor está indisponível');
    expect(JSON.stringify(result)).not.toContain('Causa falsa inventada');
  } finally {
    fetchMock.mockRestore();
  }
});

it('expõe somente categorias seguras de erro da calculadora', () => {
  const erro = resumirLogInvestigacao(
    'Erro ao calcular fórmula 3 para funcionário 000123: Erro ao calcular fórmula: Undefined symbol DIAS. password=SEGREDO',
    '000123',
  );
  expect(erro?.evidencia).toContain('símbolo não definido: DIAS');
  expect(JSON.stringify(erro)).not.toContain('SEGREDO');
});

it('exige a cobertura de todos os casos no schema enviado ao GPT e mantém cada explicação na pessoa correspondente', async () => {
  const outra = {
    ...pessoa,
    execucao_funcionario_base_id: 2,
    funcionario_id_rm: '000124',
    nome_funcionario: 'OUTRA PESSOA DE TESTE',
  };
  const { service } = preparar([pessoa, outra]);
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
                  casos: {
                    'Caso 1': 'Orientação do primeiro caso.',
                    'Caso 2': 'Orientação do segundo caso.',
                  },
                }),
              },
            ],
          },
        ],
      }),
    );
  try {
    const r = await service.responderGrupo(
      { ...grupo, funcionarioBaseIds: [1, 2], total: 2 },
      'gpt-institucional',
      credencial,
    );
    expect(r.texto).not.toContain('síntese do provedor está indisponível');
    expect(r.tabela?.linhas[0][7]).toContain('Orientação do primeiro caso.');
    expect(r.tabela?.linhas[1][7]).toContain('Orientação do segundo caso.');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.properties.casos.required).toEqual([
      'Caso 1',
      'Caso 2',
    ]);
    expect(body.text.format.schema.properties.casos.additionalProperties).toBe(
      false,
    );
    expect(body.store).toBe(false);
  } finally {
    fetchMock.mockRestore();
  }
});

it('não trata uma resposta sobre apenas uma pessoa como diagnóstico completo do grupo', async () => {
  const outra = {
    ...pessoa,
    execucao_funcionario_base_id: 2,
    funcionario_id_rm: '000124',
  };
  const { service } = preparar([pessoa, outra]);
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
                  casos: { 'Caso 1': 'Resposta incompleta.' },
                }),
              },
            ],
          },
        ],
      }),
    );
  try {
    const r = await service.responderGrupo(
      { ...grupo, funcionarioBaseIds: [1, 2], total: 2 },
      'gpt-institucional',
      credencial,
    );
    expect(r.texto).toContain('síntese do provedor está indisponível');
    expect(r.tabela?.linhas).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain('Resposta incompleta.');
  } finally {
    fetchMock.mockRestore();
  }
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
