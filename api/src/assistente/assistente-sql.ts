import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConnectionPool, Int, VarChar } from 'mssql';
import { parse as parseLossless } from 'lossless-json';
import { createHash } from 'node:crypto';
import { consultarModelo } from './assistente-intencao';
import { esquemaSql, validarSql } from './assistente-sql-validacao';
import type { Celula, ResultadoAssistente } from './assistente-tipos';
import { regrasFixas, promptSugerido } from './assistente-prompt';

export type EscopoSql = {
  periodoId: number;
  competencia: string;
  filialId?: number;
  filial?: string;
  matricula?: string;
  perfil: string;
  usuarioId?: number;
};
type PlanoSql = {
  sql: string;
  titulo: string;
  grafico?: { rotulo: string; valor: string } | null;
};

function planoDoModelo(texto: string): PlanoSql {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    throw new BadRequestException('A IA não retornou uma consulta SQL válida.');
  }
  if (!valor || typeof valor !== 'object' || Array.isArray(valor))
    throw new BadRequestException('O plano SQL é inválido.');
  const obj = valor as Record<string, unknown>;
  if (
    Object.keys(obj).some(
      (key) => !['sql', 'titulo', 'grafico'].includes(key),
    ) ||
    typeof obj.sql !== 'string' ||
    typeof obj.titulo !== 'string' ||
    obj.titulo.length > 150
  )
    throw new BadRequestException('O plano SQL contém campos inválidos.');
  if (obj.grafico) {
    if (typeof obj.grafico !== 'object' || Array.isArray(obj.grafico))
      throw new BadRequestException('O gráfico do plano SQL é inválido.');
    const g = obj.grafico as Record<string, unknown>;
    if (
      Object.keys(g).some((key) => !['rotulo', 'valor'].includes(key)) ||
      typeof g.rotulo !== 'string' ||
      typeof g.valor !== 'string'
    )
      throw new BadRequestException('As colunas do gráfico são inválidas.');
  }
  return obj as unknown as PlanoSql;
}

export function lerResultadoSql(json: string) {
  if (json.length > 2_000_000)
    throw new BadRequestException(
      'O relatório excedeu o tamanho permitido. Refine os filtros.',
    );
  const valores = parseLossless(json, undefined, {
    parseNumber: (numero) => numero,
    onDuplicateKey: () => {
      throw new BadRequestException(
        'Use nomes distintos para as colunas do relatório.',
      );
    },
  }) as unknown;
  if (!Array.isArray(valores))
    throw new BadRequestException('A consulta não retornou uma tabela.');
  const objetos = valores as Record<string, unknown>[];
  const colunas = objetos.length ? Object.keys(objetos[0]) : [];
  if (colunas.length > 30)
    throw new BadRequestException(
      'O relatório excedeu 30 colunas. Reduza a projeção.',
    );
  const linhas = objetos.slice(0, 1000).map((objeto) =>
    colunas.map((coluna): Celula => {
      const valor = objeto[coluna];
      if (valor === null) return null;
      if (typeof valor === 'string') return valor;
      if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
      throw new BadRequestException(
        'A consulta deve retornar colunas escalares.',
      );
    }),
  );
  return { colunas, linhas, parcial: objetos.length > 1000 };
}

@Injectable()
export class AssistenteSql implements OnModuleDestroy {
  private readonly pools = new Map<string, Promise<ConnectionPool>>();
  private readonly logger = new Logger(AssistenteSql.name);

  private pool(perfil: string) {
    const role = perfil === 'admin' ? 'ADMIN' : 'OPERATOR';
    let pool = this.pools.get(role);
    if (!pool) {
      const user = process.env['VALE_IA_SQL_' + role + '_USER'];
      const password = process.env['VALE_IA_SQL_' + role + '_PASSWORD'];
      if (!user || !password)
        throw new ServiceUnavailableException(
          'A conexão SQL de leitura do assistente ainda não está configurada.',
        );
      const connection = new ConnectionPool({
        server: process.env.DATABASE_HOST!,
        port: Number(process.env.DATABASE_PORT || 1433),
        database: process.env.DATABASE_NAME!,
        user,
        password,
        requestTimeout: 10000,
        connectionTimeout: 5000,
        pool: { max: 2, min: 0, idleTimeoutMillis: 30000 },
        options: { encrypt: true, trustServerCertificate: true },
        parseJSON: false,
      });
      connection.on('error', () =>
        this.logger.warn('Falha na conexão SQL restrita.'),
      );
      pool = connection.connect().catch(() => {
        this.pools.delete(role);
        throw new ServiceUnavailableException(
          'A conexão SQL de leitura está indisponível.',
        );
      });
      this.pools.set(role, pool);
    }
    return pool;
  }

  async executar(sql: string, escopo: EscopoSql) {
    const compilado = validarSql(sql, escopo.perfil);
    const pool = await this.pool(escopo.perfil);
    const inicio = Date.now();
    const hash = createHash('sha256')
      .update(compilado.sql)
      .digest('hex')
      .slice(0, 16);
    try {
      const result = await pool
        .request()
        .input('ctx_periodo', Int, escopo.periodoId)
        .input('ctx_filial', Int, escopo.filialId ?? null)
        .input('ctx_matricula', VarChar(50), escopo.matricula ?? null).query<
        Record<string, string>
      >(`
SET NOCOUNT ON;
SET LOCK_TIMEOUT 3000;
EXEC sys.sp_set_session_context @key=N'vale_periodo', @value=@ctx_periodo;
EXEC sys.sp_set_session_context @key=N'vale_filial', @value=@ctx_filial;
EXEC sys.sp_set_session_context @key=N'vale_matricula', @value=@ctx_matricula;
${compilado.sql} FOR JSON PATH, INCLUDE_NULL_VALUES OPTION (MAXDOP 1);`);
      const json = result.recordset
        .map((row) => String(Object.values(row)[0] ?? ''))
        .join('');
      const tabela = lerResultadoSql(json || '[]');
      this.logger.log(
        JSON.stringify({
          usuarioId: escopo.usuarioId ?? null,
          perfil: escopo.perfil,
          consulta: hash,
          periodoId: escopo.periodoId,
          filialId: escopo.filialId ?? null,
          linhas: tabela.linhas.length,
          duracaoMs: Date.now() - inicio,
        }),
      );
      return { ...compilado, tabela, hash };
    } catch (erro) {
      if (erro instanceof BadRequestException) throw erro;
      const codigo = (erro as { number?: number; code?: string }).number;
      this.logger.warn(
        JSON.stringify({ consulta: hash, codigo: codigo ?? 'SQL_FAILURE' }),
      );
      if ([102, 156, 207, 208, 209, 13601].includes(codigo ?? 0))
        throw new BadRequestException(
          'A consulta SQL precisa de correção de colunas, aliases ou sintaxe.',
        );
      throw new ServiceUnavailableException(
        'Não foi possível executar a consulta de leitura no limite de tempo e permissões permitido.',
      );
    }
  }

  async responder(
    pergunta: string,
    escopo: EscopoSql,
    provedor: 'claude' | 'gpt-institucional',
    credencial: { modelo: string; chave: string },
    contexto: string | null | undefined,
    historico: { pergunta: string; resposta: string }[],
  ): Promise<ResultadoAssistente> {
    const instrucoes =
      regrasFixas +
      '\n' +
      (contexto || promptSugerido) +
      `
\nVocê é o planejador SQL de leitura do Vale Expresso, em SQL Server 2022.
Gere uma única consulta SELECT. Pode usar CTEs com nomes q_, JOINs, agregações, COUNT DISTINCT, CASE, filtros, rankings e funções de janela.
Retorne só JSON {"sql":"SELECT...","titulo":"título curto","grafico":{"rotulo":"coluna do resultado","valor":"coluna numérica do resultado"}}. grafico pode ser null.
Use somente as visões e colunas exatas abaixo. Nunca use dbo, sys, INFORMATION_SCHEMA, OPENROWSET, variáveis, SELECT INTO, comandos de escrita, comentários ou FOR JSON/XML.
As visões já estão filtradas pelo servidor à competência, filial e matrícula autorizadas. Não altere esse escopo no SQL. Projete colunas explícitas e nomes distintos. Há limite de 1000 linhas e 10 segundos.
financeiro reproduz o relatório financeiro existente: funcionário com ENVIADO_RM, fórmula tipo V e COALESCE(final local, calculado) não nulo. Pago e Desconto seguem a polaridade do cadastro. Esses registros não constituem conciliação com RM.
Use financeiro para perguntas sobre pago, saldo e desconto financeiro. Use resultados para cálculo e ajustes, e diferencie vazio, zero e erro. VersaoCalculada pode estar ausente. Formula e VersaoCadastro são o cadastro atual.
variaveis contém memórias por resultado e fórmula. Não conte memórias como funcionários nem some a mesma variável repetida por fórmulas sem considerar a granularidade.
FuncionarioBaseId é o snapshot do funcionário na execução. COUNT de resultados conta registros por fórmula, não pessoas.
Nunca declare uma causa de erro ou um total que não tenha sido consultado.
Para a filial de maior desconto, agrupe financeiro por FilialId e Filial, some Desconto e ordene a soma DESC. Use TOP (1) se pedida apenas a maior.
Não filtre uma filial quando a pergunta compara filiais. O servidor escolhe previamente o escopo.
Esquema permitido:\n` +
      esquemaSql(escopo.perfil);
    const dados = {
      pergunta,
      escopo: {
        competencia: escopo.competencia,
        filial: escopo.filial ?? 'Todas as filiais',
      },
      historico: historico.slice(-2).map((t) => ({
        pergunta: t.pergunta,
        resposta: t.resposta.slice(0, 500),
      })),
    };
    let plano = planoDoModelo(
      await consultarModelo(
        provedor,
        credencial,
        instrucoes,
        JSON.stringify(dados),
        1800,
      ),
    );
    let resultado: Awaited<ReturnType<AssistenteSql['executar']>>;
    try {
      resultado = await this.executar(plano.sql, escopo);
    } catch (erro) {
      if (!(erro instanceof BadRequestException)) throw erro;
      plano = planoDoModelo(
        await consultarModelo(
          provedor,
          credencial,
          instrucoes,
          JSON.stringify({
            ...dados,
            correcao:
              'Corrija a consulta usando estritamente o esquema. ' +
              erro.message,
            sqlAnterior: plano.sql,
          }),
          1800,
        ),
      );
      resultado = await this.executar(plano.sql, escopo);
    }
    const { tabela } = resultado;
    const g = plano.grafico;
    const x = g ? tabela.colunas.indexOf(g.rotulo) : -1;
    const y = g ? tabela.colunas.indexOf(g.valor) : -1;
    const grafico =
      g && x >= 0 && y >= 0 && tabela.linhas.length <= 30
        ? tabela.linhas
            .filter(
              (linha) => linha[y] !== null && Number.isFinite(Number(linha[y])),
            )
            .map((linha) => ({
              rotulo: String(linha[x] ?? 'Sem informação'),
              valor: Number(linha[y]),
            }))
        : undefined;
    const resumo =
      tabela.linhas.length === 1
        ? tabela.colunas
            .slice(0, 4)
            .map(
              (coluna, i) =>
                coluna + ': ' + (tabela.linhas[0][i] ?? 'Sem informação'),
            )
            .join(' · ')
        : tabela.linhas.length + ' linha(s) retornada(s).';
    return {
      texto: tabela.linhas.length
        ? plano.titulo + '. ' + resumo
        : 'Nenhum resultado encontrado no recorte consultado.',
      detalhes: [
        'Consulta SQL de leitura ' +
          resultado.hash +
          '. Escopo aplicado no banco pelo servidor.',
        resultado.fontes.includes('financeiro')
          ? 'Financeiro local com registros de envio, fórmula tipo V e polaridade do cadastro, conforme Relatórios.'
          : '',
        tabela.parcial
          ? 'Resultado parcial: mais de 1000 linhas. Refine os filtros.'
          : '',
        escopo.perfil === 'admin' ? 'SQL executado:\n' + resultado.sql : '',
      ]
        .filter(Boolean)
        .join('\n'),
      competencia: escopo.competencia,
      filial: escopo.filial ?? 'Todas as filiais',
      matricula: escopo.matricula,
      fonte:
        'SQL de leitura · ' +
        resultado.fontes.map((name) => 'vale_ia.' + name).join(', '),
      consultadoEm: new Date().toISOString(),
      tabela,
      grafico,
      links: [{ texto: 'Relatórios', url: '/relatorios' }],
    };
  }

  async onModuleDestroy() {
    await Promise.allSettled(
      [...this.pools.values()].map(async (pool) => (await pool).close()),
    );
  }
}
