import { validarSql, esquemaSql } from './assistente-sql-validacao';
import {
  lerResultadoSql,
  AssistenteSql,
  validarFontesDaPergunta,
  validarApresentacao,
} from './assistente-sql';

it('valida as escolhas visuais contra os dados e não usa códigos como métricas', () => {
  const tabela = {
    colunas: ['FilialId', 'Filial', 'TotalPago'],
    linhas: [
      ['1', 'Alfa', '25.50'],
      ['2', 'Beta', '-1.00'],
    ],
    parcial: false,
  };
  expect(
    validarApresentacao(
      tabela,
      { grafico: 'linha', dimensao: 'Filial', metrica: 'TotalPago' },
      'Financeiro',
    ),
  ).toEqual({
    titulo: 'Financeiro',
    grafico: 'barras',
    dimensao: 'Filial',
    metrica: 'TotalPago',
  });
  expect(
    validarApresentacao(
      tabela,
      { grafico: 'barras', dimensao: 'Filial', metrica: 'FilialId' },
      'Financeiro',
    ),
  ).toEqual({ titulo: 'Financeiro' });
  expect(
    validarApresentacao(
      tabela,
      { grafico: 'barras', dimensao: 'Filial', metrica: 'NaoExiste' },
      'Financeiro',
    ),
  ).toEqual({ titulo: 'Financeiro' });
  expect(
    validarApresentacao(
      tabela,
      {
        grafico: 'barras',
        dimensao: 'Filial',
        metrica: 'TotalPago',
        html: '<script/>',
      },
      'Financeiro',
    ),
  ).toEqual({ titulo: 'Financeiro' });
  const tempo = {
    colunas: ['Competencia', 'Total'],
    linhas: [
      ['08/2026', '25'],
      ['09/2026', '30'],
    ],
    parcial: false,
  };
  expect(
    validarApresentacao(
      tempo,
      { grafico: 'linha', dimensao: 'Competencia', metrica: 'Total' },
      'Evolução',
    )?.grafico,
  ).toBe('linha');
});
import { AssistenteAvancado } from './assistente-avancado';
import { AssistenteConhecimento } from './assistente-conhecimento';
import type { AssistenteConsultas } from './assistente-consultas';
import type { OperationalReportsService } from '../dash/operational-reports.service';
import type { AssistenteInvestigacao } from './assistente-investigacao';

it('impede eliminar calculados não enviados ao juntar o financeiro enviado', () => {
  const pergunta = 'ranking dos descontos calculados ainda não enviados';
  expect(() =>
    validarFontesDaPergunta(pergunta, ['resultados', 'financeiro']),
  ).toThrow('sem JOIN');
  expect(() => validarFontesDaPergunta(pergunta, ['resultados'])).not.toThrow();
  expect(() =>
    validarFontesDaPergunta('descontos enviados', ['financeiro']),
  ).not.toThrow();
});

it('compila ranking de descontos e limita a saída sem limitar os registros agregados', () => {
  const query = validarSql(
    'SELECT TOP (1) Filial, SUM(Desconto) AS TotalDesconto FROM vale_ia.financeiro GROUP BY Filial ORDER BY SUM(Desconto) DESC',
    'operator',
  );
  expect(query.sql).toContain('TOP (1)');
  expect(query.fontes).toEqual(['financeiro']);
  const livre = validarSql(
    'SELECT Filial, SUM(Desconto) AS Total FROM vale_ia.financeiro GROUP BY Filial ORDER BY SUM(Desconto) DESC',
    'operator',
  );
  expect(livre.sql).toContain('TOP (1001)');
});

it('aceita CTEs e preserva a fonte autorizada', () => {
  const query = validarSql(
    'WITH q_totais AS (SELECT Filial, SUM(Desconto) AS Total FROM vale_ia.financeiro GROUP BY Filial) SELECT TOP (1) Filial, Total FROM q_totais ORDER BY Total DESC',
    'operator',
  );
  expect(query.fontes).toEqual(['financeiro']);
});

it.each([
  'DELETE FROM vale_ia.financeiro',
  'UPDATE vale_ia.financeiro SET Desconto=0',
  'SELECT Filial FROM vale_ia.financeiro; DROP TABLE dbo.execucao',
  'SELECT Filial INTO #copia FROM vale_ia.financeiro',
  'SELECT encrypted_credentials FROM dbo.rm_sessao',
  'SELECT * FROM sys.sql_logins',
  'SELECT * FROM outro_banco.vale_ia.financeiro',
  'SELECT OBJECT_DEFINITION(1) FROM vale_ia.financeiro',
  "SELECT SESSION_CONTEXT(N'vale_periodo') FROM vale_ia.financeiro",
  "EXEC sys.sp_set_session_context @key=N'vale_periodo', @value=1",
  'SELECT @@version FROM vale_ia.financeiro',
  'SELECT Filial FROM vale_ia.financeiro WITH (NOLOCK)',
  'SELECT (SELECT encrypted_credentials FROM dbo.rm_sessao) FROM vale_ia.financeiro',
])('bloqueia SQL fora do contrato de leitura: %s', (query) => {
  expect(() => validarSql(query, 'operator')).toThrow();
});

it('mantém fórmulas técnicas disponíveis somente ao administrador', () => {
  expect(() =>
    validarSql('SELECT Expressao FROM vale_ia.formulas', 'operator'),
  ).toThrow('administrador');
  expect(
    validarSql('SELECT Expressao FROM vale_ia.formulas', 'admin').fontes,
  ).toEqual(['formulas']);
  expect(esquemaSql('operator')).not.toContain('vale_ia.formulas');
});

it('preserva precisão decimal, vazio e zero no transporte dos dados do SQL Server', () => {
  expect(
    lerResultadoSql('[{"Total":9999999999999999.99,"Zero":0,"Vazio":null}]')
      .linhas,
  ).toEqual([['9999999999999999.99', '0', null]]);
  expect(() => lerResultadoSql('[{"A":1,"A":2}]')).toThrow();
});

it('consulta todas as filiais no ranking mesmo com filial herdada da tela', async () => {
  const sql = {
    responder: jest.fn().mockResolvedValue({ texto: 'Ranking verificado' }),
  };
  const relatorios = {
    options: async () => ({
      periodos: [{ periodo_id: 7, competencia: '10/2026', ativo: true }],
      filiais: [{ filial_id: 9, nome: 'Filial do contexto', ativa: true }],
    }),
  };
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
    Response.json({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                acao: 'consulta',
                consulta: 'financeiro',
                periodoId: 7,
                filialId: 9,
                titulo: 'Maior desconto',
              }),
            },
          ],
        },
      ],
    }),
  );
  try {
    const service = new AssistenteAvancado(
      {} as AssistenteConsultas,
      relatorios as unknown as OperationalReportsService,
      new AssistenteConhecimento(),
      sql as unknown as AssistenteSql,
      {} as AssistenteInvestigacao,
    );
    await service.responder(
      {
        pergunta: 'qual filial teve maior valor em descontos no mes 10 ?',
        filialId: 9,
        periodoId: 7,
      },
      'operator',
      'gpt-institucional',
      { modelo: 'gpt-5.4-mini', chave: 'teste' },
      null,
      [],
      12,
    );
    expect(sql.responder).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        periodoId: 7,
        competencia: '10/2026',
        filialId: undefined,
        usuarioId: 12,
      }),
      'gpt-institucional',
      expect.any(Object),
      null,
      [],
    );
  } finally {
    fetchMock.mockRestore();
  }
});
