import {
  AssistenteAgente,
  colunasSqlPessoais,
  validarPasso,
} from './assistente-agente';
import { consultarModelo } from './assistente-intencao';
jest.mock('./assistente-intencao', () => ({ consultarModelo: jest.fn() }));
const args = {
  pergunta: '',
  sql: '',
  consulta: 'ajuda',
  identificador: '',
  periodoId: null,
  filialId: null,
  escopo: 'atual',
};
const passo = (
  tipo: string,
  tool = 'nenhuma',
  texto = '',
  a = {},
  refs: string[] = [],
) =>
  JSON.stringify({
    tipo,
    texto,
    ferramenta: tool,
    referencias: refs,
    argumentos: { ...args, ...a },
  });
let code: any,
  queries: any,
  sql: any,
  investigation: any,
  compare: any,
  service: AssistenteAgente;
beforeEach(() => {
  jest.clearAllMocks();
  code = {
    buscar: jest.fn().mockReturnValue({
      texto: 'Valor zero é diferente de ausência de cálculo.',
      fontes: ['Guia'],
    }),
  };
  queries = { consultar: jest.fn() };
  sql = { executar: jest.fn() };
  investigation = { responder: jest.fn(), responderGrupo: jest.fn() };
  compare = { responder: jest.fn() };
  service = new AssistenteAgente(code, queries, sql, investigation, compare, {
    options: async () => ({
      periodos: [{ periodo_id: 1, competencia: '10/2026', ativo: true }],
      filiais: [{ filial_id: 2, nome: 'Filial A', ativa: true }],
    }),
  } as any);
});
const perguntar = (q: string, key = 'u1:s1', perfil = 'operator') =>
  service.responder(
    { pergunta: q },
    perfil,
    'gpt-institucional',
    { modelo: 'teste', chave: 'teste' },
    null,
    1,
    key,
  );
it('conversa normalmente sem forçar consulta ou relatório', async () => {
  (consultarModelo as jest.Mock).mockResolvedValue(
    passo('resposta', 'nenhuma', 'Oi! Como posso te ajudar no Vale?'),
  );
  const r = await perguntar('Oi, tudo bem?');
  expect(r.texto).toBe('Oi! Como posso te ajudar no Vale?');
  expect(r.tabela).toBeUndefined();
  expect(queries.consultar).not.toHaveBeenCalled();
  expect(sql.executar).not.toHaveBeenCalled();
  expect(r.relatorio?.solicitado).toBe(false);
});
it('ancora a orientação inicial em pendências e erros e corrige confusão entre execução aberta e fila', async () => {
  queries.consultar.mockImplementation(async (intent: string) => ({
    texto:
      intent === 'erros' ? 'Não há erros.' : 'Filial A ainda sem execução.',
    competencia: '10/2026',
  }));
  (consultarModelo as jest.Mock)
    .mockResolvedValueOnce(
      passo('resposta', 'nenhuma', 'Há uma execução em andamento.', {}, ['T1']),
    )
    .mockResolvedValueOnce(
      passo(
        'resposta',
        'nenhuma',
        'A filial A ainda não foi iniciada; confira a criação antes de avançar.',
        {},
        ['T1', 'T2'],
      ),
    );
  const r = await service.responder(
    { pergunta: 'Oriente a operação.', periodoId: 1 },
    'operator',
    'gpt-institucional',
    { modelo: 'teste', chave: 'teste' },
    null,
    1,
    'inicio',
    true,
  );
  expect(queries.consultar.mock.calls.map((c) => c[0])).toEqual([
    'pendencias',
    'erros',
  ]);
  expect(r.texto).toContain('ainda não foi iniciada');
  const primeiraChamada = JSON.parse(
    (consultarModelo as jest.Mock).mock.calls[0][3],
  );
  expect(primeiraChamada.evidencias).toHaveLength(2);
  expect(primeiraChamada.contexto.filasVazias).toBe(true);
});
it('inclui os nomes no chat quando pedem quem são, em vez de repetir a contagem', async () => {
  queries.consultar.mockResolvedValue({
    texto: 'Há dois funcionários com erro.',
    tabela: {
      colunas: ['Funcionário'],
      linhas: [['Pessoa Teste A'], ['Pessoa Teste B']],
    },
  });
  (consultarModelo as jest.Mock)
    .mockResolvedValueOnce(
      passo('ferramenta', 'consultar_operacao', '', { consulta: 'erros' }),
    )
    .mockResolvedValueOnce(
      passo('resposta', 'nenhuma', 'Há dois funcionários com erro.', {}, [
        'T1',
      ]),
    )
    .mockResolvedValueOnce(
      passo('resposta', 'nenhuma', 'São [PESSOA_1] e [PESSOA_2].', {}, ['T1']),
    );
  const r = await perguntar('Quero saber os funcionários com erro.');
  expect(r.texto).toContain('Pessoa Teste A');
  expect(r.texto).toContain('Pessoa Teste B');
  expect((consultarModelo as jest.Mock).mock.calls[2][3]).toContain(
    'não apenas a contagem',
  );
});
it('mantém competência e origem ao explicar o histórico sem repetir a consulta', async () => {
  queries.consultar.mockResolvedValue({
    texto: 'Há erros.',
    competencia: '10/2026',
    fonte: 'Banco do Vale',
    consultadoEm: '2026-11-16T10:00:00Z',
    tabela: { colunas: ['Filial'], linhas: [['A']] },
  });
  (consultarModelo as jest.Mock)
    .mockResolvedValueOnce(
      passo('ferramenta', 'consultar_operacao', '', { consulta: 'erros' }),
    )
    .mockResolvedValueOnce(
      passo('resposta', 'nenhuma', 'Encontrei erros nessa competência.', {}, [
        'T1',
      ]),
    )
    .mockResolvedValueOnce(
      passo(
        'resposta',
        'nenhuma',
        'Eu começaria verificando o cadastro indicado.',
      ),
    );
  await perguntar('Onde tem erro?');
  const r = await perguntar('E agora?');
  expect(r.competencia).toBe('10/2026');
  expect(r.fonte).toBe('Banco do Vale');
  expect(r.consultadoEm).toBe('2026-11-16T10:00:00Z');
  expect(r.agente?.ferramentas).toEqual([]);
  expect(r.tabela).toBeUndefined();
  expect(queries.consultar).toHaveBeenCalledTimes(1);
});
it('busca o código para explicar uma dúvida sem exigir filtros', async () => {
  (consultarModelo as jest.Mock)
    .mockResolvedValueOnce(
      passo('ferramenta', 'buscar_codigo', '', {
        pergunta: 'valor zero e ausência de cálculo',
      }),
    )
    .mockResolvedValueOnce(
      passo(
        'resposta',
        'nenhuma',
        'Zero é um resultado calculado. Sem cálculo significa que ainda não há resultado.',
        {},
        ['T1'],
      ),
    );
  const r = await perguntar('Sem valor é a mesma coisa que zero?');
  expect(r.texto).toContain('Sem cálculo');
  expect(code.buscar).toHaveBeenCalledWith(
    'valor zero e ausência de cálculo',
    'operator',
  );
  expect(queries.consultar).not.toHaveBeenCalled();
});
it('recupera um pedido indevido de filtros usando a competência ativa', async () => {
  queries.consultar.mockResolvedValue({
    texto: 'Não há erros.',
    competencia: '10/2026',
  });
  (consultarModelo as jest.Mock)
    .mockResolvedValueOnce(
      passo(
        'resposta',
        'nenhuma',
        'Tem erro em alguma filial ou em algum funcionário específico?',
      ),
    )
    .mockResolvedValueOnce(
      passo('ferramenta', 'consultar_operacao', '', { consulta: 'erros' }),
    )
    .mockResolvedValueOnce(
      passo(
        'resposta',
        'nenhuma',
        'Não encontrei erros na competência ativa.',
        {},
        ['T1'],
      ),
    );
  const r = await perguntar('Onde tem erro?');
  expect(queries.consultar).toHaveBeenCalledWith(
    'erros',
    expect.objectContaining({ periodoId: 1, todasFiliais: true }),
    'operator',
  );
  expect(r.texto).toBe('Não encontrei erros na competência ativa.');
  expect((consultarModelo as jest.Mock).mock.calls[1][3]).toContain(
    'não peça filtros',
  );
});
it('constrói SQL validado e oculta dados pessoais mesmo com aliases', async () => {
  const query =
    'SELECT TOP 20 Funcionario AS Apelido, Matricula AS CodigoPessoa FROM vale_ia.funcionarios';
  sql.executar.mockResolvedValue({
    tabela: {
      colunas: ['Apelido', 'CodigoPessoa'],
      linhas: [['PESSOA_PRIVADA', '000123']],
      parcial: false,
    },
    hash: 'abc',
  });
  (consultarModelo as jest.Mock)
    .mockResolvedValueOnce(passo('ferramenta', 'ler_esquema'))
    .mockResolvedValueOnce(
      passo('ferramenta', 'executar_sql', '', { sql: query }),
    )
    .mockResolvedValueOnce(
      passo('resposta', 'nenhuma', 'Encontrei [IDENTIFICACAO_1].', {}, ['T2']),
    );
  const r = await perguntar('Quem está nessa competência?');
  expect(r.texto).toContain('PESSOA_PRIVADA');
  expect(r.tabela?.linhas[0][1]).toBe('000123');
  const body = (consultarModelo as jest.Mock).mock.calls.at(-1)[3];
  expect(body).not.toContain('PESSOA_PRIVADA');
  expect(body).not.toContain('000123');
  expect(sql.executar).toHaveBeenCalledWith(
    query,
    expect.objectContaining({ periodoId: 1, perfil: 'operator' }),
  );
});
it('não confunde contagem com dados pessoais e reconhece origem de expressão', () => {
  expect([
    ...colunasSqlPessoais(
      'SELECT COUNT(Funcionario) AS Total FROM vale_ia.funcionarios',
    ),
  ]).toEqual([]);
  expect([
    ...colunasSqlPessoais(
      'SELECT MAX(Matricula) AS AliasLivre FROM vale_ia.funcionarios',
    ),
  ]).toEqual(['aliaslivre']);
});
it('bloqueia escrita antes de executar e permite explicar a limitação', async () => {
  (consultarModelo as jest.Mock)
    .mockResolvedValueOnce(passo('ferramenta', 'ler_esquema'))
    .mockResolvedValueOnce(
      passo('ferramenta', 'executar_sql', '', {
        sql: 'DELETE FROM vale_ia.funcionarios',
      }),
    )
    .mockResolvedValueOnce(
      passo(
        'resposta',
        'nenhuma',
        'Posso consultar os dados, mas não fazer essa alteração.',
        {},
        ['T2'],
      ),
    );
  await perguntar('Apague os funcionários');
  expect(sql.executar).not.toHaveBeenCalled();
});
it('isola sessões, respeita o perfil e permite começar de novo', async () => {
  (consultarModelo as jest.Mock).mockResolvedValue(
    passo('resposta', 'nenhuma', 'Olá!'),
  );
  await perguntar('primeira mensagem');
  await perguntar('outra sessão', 'u1:s2');
  expect(
    JSON.parse((consultarModelo as jest.Mock).mock.calls.at(-1)[3]).historico,
  ).toEqual([]);
  service.limpar('u1:s1');
  await perguntar('nova');
  expect(
    JSON.parse((consultarModelo as jest.Mock).mock.calls.at(-1)[3]).historico,
  ).toEqual([]);
  await expect(perguntar('oi', 'u2:s3', 'viewer')).rejects.toThrow();
});
it('preserva histórico conversacional dentro da própria sessão', async () => {
  (consultarModelo as jest.Mock).mockResolvedValue(
    passo('resposta', 'nenhuma', 'Posso explicar os processos do Vale.'),
  );
  await perguntar('O que você faz?');
  await perguntar('Explica melhor');
  expect(
    JSON.parse((consultarModelo as jest.Mock).mock.calls.at(-1)[3]).historico[0]
      .pergunta,
  ).toBe('O que você faz?');
});
it('não aceita referência pessoal inventada nem ferramentas desconhecidas', async () => {
  expect(() => validarPasso(passo('ferramenta', 'gravar_dados'))).toThrow();
  (consultarModelo as jest.Mock).mockResolvedValue(
    passo('resposta', 'nenhuma', '[PESSOA_999]'),
  );
  expect((await perguntar('quem?')).texto).not.toContain('[PESSOA_999]');
});
it('impõe limite ao ciclo de ferramentas', async () => {
  (consultarModelo as jest.Mock).mockResolvedValue(
    passo('ferramenta', 'buscar_codigo', '', { pergunta: 'processamento' }),
  );
  await perguntar('explique o sistema');
  expect(code.buscar).toHaveBeenCalledTimes(4);
  expect(consultarModelo).toHaveBeenCalledTimes(5);
});

it('protege identificação propagada por CTE', () => {
  const sql =
    'WITH q_pessoas AS (SELECT Funcionario AS Apelido FROM vale_ia.funcionarios) SELECT TOP 20 Apelido FROM q_pessoas';
  expect(colunasSqlPessoais(sql).has('apelido')).toBe(true);
});

it('pode esclarecer que não realizou alteração, sem simular uma ação', async () => {
  (consultarModelo as jest.Mock).mockResolvedValue(
    passo(
      'resposta',
      'nenhuma',
      'Não alterei os dados. Posso te ajudar a conferir a situação.',
    ),
  );
  expect((await perguntar('Você alterou?')).texto).toContain('Não alterei');
});
it('rejeita ação não realizada e JSON inválido', async () => {
  expect(() => validarPasso('não JSON')).toThrow();
  (consultarModelo as jest.Mock).mockResolvedValue(
    passo('resposta', 'nenhuma', 'Reprocessei tudo.'),
  );
  expect((await perguntar('Pode resolver?')).texto).not.toContain(
    'Reprocessei tudo',
  );
});

it('corrige uma ação inconsistente sem interromper a conversa', async () => {
  (consultarModelo as jest.Mock)
    .mockResolvedValueOnce(passo('resposta', 'executar_sql', 'Olá'))
    .mockResolvedValueOnce(
      passo('resposta', 'nenhuma', 'Olá! Como posso ajudar?'),
    );
  expect((await perguntar('Oi')).texto).toContain('Como posso ajudar');
  expect(
    JSON.parse((consultarModelo as jest.Mock).mock.calls.at(-1)[3])
      .ajusteNecessario,
  ).toBeTruthy();
  expect(sql.executar).not.toHaveBeenCalled();
});

it('não envia uma credencial colada por engano ao provedor', async () => {
  (consultarModelo as jest.Mock).mockResolvedValue(
    passo(
      'resposta',
      'nenhuma',
      'Guarde a chave nas configurações, não no chat.',
    ),
  );
  await perguntar('minha chave sk-proj-SEGREDODETESTE1234567890');
  expect((consultarModelo as jest.Mock).mock.calls.at(-1)[3]).not.toContain(
    'SEGREDODETESTE1234567890',
  );
});
