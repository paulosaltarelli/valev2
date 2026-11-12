import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Parser } from 'node-sql-parser';

export const tabelasSql = {
  filiais: 'FilialId, Filial, CodColigada, CodFilial, LimiteKm',
  execucoes:
    'ExecucaoId, PeriodoId, Competencia, FilialId, Filial, Status, ControleFila, DataExecucao',
  funcionarios:
    'FuncionarioBaseId, Matricula, Funcionario, Cargo, StatusFuncionario, Km, CodColigada, CodFilial, ExecucaoId, PeriodoId, Competencia, FilialId, Filial',
  resultados:
    'ResultadoId, FuncionarioBaseId, Matricula, Funcionario, ExecucaoId, PeriodoId, Competencia, FilialId, Filial, FormulaId, Formula, VersaoCadastro, TipoCadastro, PolaridadeCadastro, VersaoCalculada, Calculado, FinalLocal, AjusteManual, StatusResultado, StatusFuncionario, RevisaoLocal, RevisaoComEnvioRegistrado',
  financeiro:
    'ResultadoId, FuncionarioBaseId, Matricula, Funcionario, ExecucaoId, PeriodoId, Competencia, FilialId, Filial, Formula, Polaridade, ValorLocal, Pago, Desconto',
  variaveis:
    'MemoriaId, VariavelCodigo, Variavel, Valor, Origem, DataRegistro, ResultadoId, FormulaId, Formula, FuncionarioBaseId, Matricula, Funcionario, ExecucaoId, PeriodoId, Competencia, FilialId, Filial, StatusResultado',
  filas:
    'ItemId, Tipo, Status, Tentativas, CriadoEm, AtualizadoEm, ExecucaoId, PeriodoId, Competencia, FilialId, Filial',
  formulas:
    'FormulaId, Formula, VersaoCadastro, Ativa, Tipo, Polaridade, InicioVigencia, FimVigencia, Expressao, ExpressaoParcial, FilialId, Filial',
};

const funcoes = new Set([
  'SUM',
  'COUNT',
  'COUNT_BIG',
  'AVG',
  'MIN',
  'MAX',
  'ROUND',
  'ABS',
  'COALESCE',
  'ISNULL',
  'NULLIF',
  'CAST',
  'CONVERT',
  'TRY_CAST',
  'TRY_CONVERT',
  'YEAR',
  'MONTH',
  'DAY',
  'DATEFROMPARTS',
  'DATEADD',
  'DATEDIFF',
  'UPPER',
  'LOWER',
  'LTRIM',
  'RTRIM',
  'LEN',
  'SUBSTRING',
  'CONCAT',
  'ROW_NUMBER',
  'RANK',
  'DENSE_RANK',
]);
const mutacoes = new Set([
  'update',
  'delete',
  'insert',
  'replace',
  'merge',
  'drop',
  'alter',
  'create',
  'truncate',
  'exec',
  'execute',
  'call',
  'set',
  'declare',
  'use',
  'grant',
  'revoke',
]);
type No = Record<string, unknown>;
const parser = new Parser();
const dialect = { database: 'TransactSQL' };

export function esquemaSql(perfil: string) {
  return Object.entries(tabelasSql)
    .filter(([name]) => perfil === 'admin' || name !== 'formulas')
    .map(([name, columns]) => 'vale_ia.' + name + '(' + columns + ')')
    .join('\n');
}

export function validarSql(texto: string, perfil: string) {
  if (
    typeof texto !== 'string' ||
    texto.length > 12000 ||
    !texto.trim() ||
    /--|\/\*|\*\//.test(texto)
  )
    throw new BadRequestException(
      'A consulta SQL contém conteúdo não permitido.',
    );
  let analise: ReturnType<Parser['parse']>;
  try {
    analise = parser.parse(texto, dialect);
  } catch {
    throw new BadRequestException(
      'A consulta SQL não passou na validação de sintaxe T-SQL.',
    );
  }
  const ast = (Array.isArray(analise.ast)
    ? analise.ast.length === 1
      ? analise.ast[0]
      : null
    : analise.ast) as unknown as No | null;
  if (!ast || ast.type !== 'select' || ast._next)
    throw new BadRequestException(
      'É permitida uma única consulta SELECT de leitura.',
    );
  const ctes = new Set<string>();
  if (Array.isArray(ast.with))
    for (const cte of ast.with) {
      const nome = String(
        (cte as { name?: { value?: string } }).name?.value ?? '',
      ).toLowerCase();
      if (!/^q_[a-z0-9_]{1,60}$/.test(nome) || ctes.has(nome))
        throw new BadRequestException('Use nomes q_ distintos para as CTEs.');
      ctes.add(nome);
    }
  const fontes = new Set<string>();
  for (const tabela of analise.tableList) {
    const partes = tabela.toLowerCase().split('::');
    if (
      partes.length === 3 &&
      partes[0] === 'select' &&
      partes[1] === 'null' &&
      ctes.has(partes[2])
    )
      continue;
    const nome = partes[2] ?? '';
    if (
      partes.length !== 3 ||
      partes[0] !== 'select' ||
      partes[1] !== 'vale_ia' ||
      !Object.hasOwn(tabelasSql, nome)
    )
      throw new ForbiddenException(
        'A consulta tentou acessar uma fonte não autorizada.',
      );
    if (nome === 'formulas' && perfil !== 'admin')
      throw new ForbiddenException(
        'O cadastro de fórmulas exige perfil administrador.',
      );
    fontes.add(nome);
  }
  if (!fontes.size)
    throw new BadRequestException(
      'A consulta precisa usar uma visão de dados do Vale.',
    );
  let quantidade = 0;
  function visitar(valor: unknown, profundidade: number) {
    if (++quantidade > 4000 || profundidade > 80)
      throw new BadRequestException(
        'A consulta SQL excedeu o limite de complexidade.',
      );
    if (!valor || typeof valor !== 'object') return;
    if (Array.isArray(valor)) {
      valor.forEach((item) => visitar(item, profundidade + 1));
      return;
    }
    const no = valor as No;
    if (mutacoes.has(String(no.type)))
      throw new ForbiddenException(
        'Operações de alteração não são permitidas no assistente.',
      );
    if (no.type === 'select') {
      if (
        no.for ||
        no.limit ||
        no.options ||
        no.option ||
        no.query_hint ||
        (no.into as No | undefined)?.position
      )
        throw new BadRequestException(
          'A consulta usa uma cláusula não permitida.',
        );
      const top = no.top as No | null;
      if (
        top &&
        (Object.keys(top).some(
          (key) => !['value', 'percent', 'parentheses'].includes(key),
        ) ||
          top.percent ||
          typeof top.value !== 'number' ||
          top.value <= 0 ||
          !Number.isInteger(top.value))
      )
        throw new BadRequestException(
          'TOP deve ser um número inteiro de registros.',
        );
    }
    if (no.table_hint || no.temporal_table || no.server)
      throw new ForbiddenException(
        'Referências externas e instruções de acesso especiais não são permitidas.',
      );
    if (
      no.type === 'var' ||
      (no.type === 'column_ref' && String(no.column).startsWith('@'))
    )
      throw new BadRequestException(
        'O escopo é definido pelo servidor. Não use variáveis SQL.',
      );
    if (no.type === 'function' || no.type === 'aggr_func') {
      const nome =
        typeof no.name === 'string'
          ? no.name
          : ((no.name as { name?: { value?: string }[] })?.name ?? [])
              .map((part) => part.value)
              .join('.');
      if (!funcoes.has(nome.toUpperCase()))
        throw new ForbiddenException(
          'A consulta usa uma função não autorizada.',
        );
    }
    Object.values(no).forEach((item) => visitar(item, profundidade + 1));
  }
  visitar(ast, 0);
  const top = ast.top as { value: number } | null;
  ast.top = {
    value: Math.min(top?.value ?? 1001, 1001),
    percent: null,
    parentheses: true,
  };
  let sql: string;
  try {
    sql = parser.sqlify(ast as never, dialect);
  } catch {
    throw new BadRequestException(
      'Não foi possível compilar a consulta SQL validada.',
    );
  }
  return { sql, fontes: [...fontes], limite: 1000 };
}
