import { BadRequestException, Injectable } from '@nestjs/common';
import { DashService } from '../dash/dash.service';
import { OperationalReportsService } from '../dash/operational-reports.service';
import { lerSnapshotFormula } from '../dash/operational-reports';
import { ExecucaoService } from '../execucao/execucao.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssistenteDto, Intent } from './assistente.dto';
import { contextoConsulta, type ResultadoAssistente } from './assistente-tipos';

type Cell = string | number | null;
const limite = 2000;

function filtroFuncionariosComErro(execucaoIds: number[]) {
  return {
    execucao_id: { in: execucaoIds },
    OR: [
      { status: { startsWith: 'ERRO_' } },
      {
        execucao_funcionario: {
          some: { status: 'ERRO', execucao_id: { in: execucaoIds } },
        },
      },
    ],
  };
}

function tabela(colunas: string[], dados: Cell[][]) {
  return {
    colunas,
    linhas: dados.slice(0, limite),
    parcial: dados.length > limite,
  };
}

function numeroParaRelatorio(valor: string | null): Cell {
  if (valor === null) return null;
  return valor.replace(/[^0-9]/g, '').length <= 15 ? Number(valor) : valor;
}

function anterior(competencia: string) {
  const [mes, ano] = competencia.split('/').map(Number);
  return mes === 1
    ? `12/${ano - 1}`
    : `${String(mes - 1).padStart(2, '0')}/${ano}`;
}

export function situacaoValor(status: string, valor: string | null) {
  if (status === 'ERRO') return 'Erro';
  if (status === 'PREVIA' || valor === null) return 'Sem cálculo confirmado';
  if (status === 'PROCESSADO' || status === 'ENVIADO_RM') {
    return Number(valor) === 0 ? 'Calculado com zero' : 'Calculado';
  }
  return 'Estado não identificado';
}

export function classificarLog(mensagem: string) {
  const variavel =
    /^(?:Erro RM variavel|Valor RESULTADO inválido \(NaN\) para variavel) ([\w.-]{1,50}) \([^\r\n)]*\) (?:para|do) funcionário ([^:\r\n]+)(?::|$)/i.exec(
      mensagem,
    );
  if (variavel)
    return {
      codigo: variavel[1],
      matricula: variavel[2].trim(),
      causa: mensagem.startsWith('Erro RM')
        ? 'Falha na consulta da variável ao RM'
        : 'O RM retornou um resultado inválido',
    };
  const memoria =
    /^Sem memoria_calculo para fórmula (\d+) do funcionário ([^\r\n]+?)\. Rode /.exec(
      mensagem,
    );
  if (memoria)
    return {
      codigo: memoria[1],
      matricula: memoria[2],
      causa: 'O cálculo registrou falta de memória da fórmula',
    };
  return null;
}

@Injectable()
export class AssistenteConsultas {
  constructor(
    private readonly prisma: PrismaService,
    private readonly execucoes: ExecucaoService,
    private readonly dash: DashService,
    private readonly relatorios: OperationalReportsService,
  ) {}

  private async errosPorFilial(
    filtros: AssistenteDto,
    consultadoEm: string,
  ): Promise<ResultadoAssistente> {
    const periodo = await this.prisma.periodo.findUnique({
      where: { periodo_id: filtros.periodoId! },
      select: { competencia: true },
    });
    if (!periodo) throw new BadRequestException('Competência não encontrada.');
    const runs = await this.prisma.execucao.findMany({
      where: { historica_de_execucao_id:null,
        periodo_id: filtros.periodoId!,
        filial: filtros.filialId
          ? { filial_id: filtros.filialId }
          : { ativa: true },
      },
      select: {
        execucao_id: true,
        filial_id: true,
        filial: { select: { nome: true } },
      },
      take: limite + 1,
    });
    if (runs.length > limite)
      throw new BadRequestException(
        'O recorte excedeu o limite de execuções. Refine a consulta.',
      );
    const ids = runs.map((r) => r.execucao_id);
    const counts = ids.length
      ? await this.prisma.execucao_funcionario_base.groupBy({
          by: ['execucao_id'],
          where: filtroFuncionariosComErro(ids),
          _count: true,
        })
      : [];
    const grupos = new Map<number, typeof runs>();
    for (const run of runs)
      grupos.set(run.filial_id, [...(grupos.get(run.filial_id) ?? []), run]);
    let total = 0,
      duplicadas = 0;
    const rows: Cell[][] = [];
    for (const filiaisRuns of grupos.values()) {
      const run = filiaisRuns[0];
      if (filiaisRuns.length > 1) {
        duplicadas++;
        rows.push([
          run.filial.nome,
          filiaisRuns.map((r) => r.execucao_id).join(', '),
          null,
          'Execuções duplicadas — contagem não consolidada',
        ]);
        continue;
      }
      const quantidade =
        counts.find((c) => c.execucao_id === run.execucao_id)?._count ?? 0;
      total += quantidade;
      if (quantidade)
        rows.push([
          run.filial.nome,
          run.execucao_id,
          quantidade,
          'Erro registrado na base ou em resultado por fórmula',
        ]);
    }
    const execucaoIds = [...grupos.values()]
      .filter((g) => g.length === 1)
      .map((g) => g[0].execucao_id);
    const cohort = execucaoIds.length
      ? await this.prisma.execucao_funcionario_base.findMany({
          where: filtroFuncionariosComErro(execucaoIds),
          select: { execucao_funcionario_base_id: true },
          orderBy: { execucao_funcionario_base_id: 'asc' },
          take: 101,
        })
      : [];
    const filial = filtros.filialId
      ? (runs[0]?.filial.nome ?? 'Filial selecionada')
      : 'Todas as filiais ativas';
    return {
      [contextoConsulta]: {
        tipo: 'funcionarios_com_erro',
        periodoId: filtros.periodoId!,
        competencia: periodo.competencia,
        filialId: filtros.filialId,
        filial,
        execucaoIds,
        funcionarioBaseIds: cohort
          .slice(0, 100)
          .map((p) => p.execucao_funcionario_base_id),
        total,
        parcial: cohort.length > 100 || cohort.length !== total,
        capturadoEm: consultadoEm,
      },
      texto:
        (total
          ? `Sim. Há ${total} registro(s) de funcionário com erro em ${rows.filter((r) => r[2] !== null).length} filial(is).`
          : 'Não há funcionário com erro registrado nas execuções sem duplicidade deste recorte.') +
        (duplicadas
          ? ` ${duplicadas} filial(is) têm execuções duplicadas e não foram consolidadas.`
          : ''),
      competencia: periodo.competencia,
      filial,
      consultadoEm,
      fonte: 'Banco do Vale · estados atuais de funcionários e resultados',
      detalhes:
        'A contagem considera cada registro de funcionário na execução uma vez, mesmo com várias fórmulas em erro. Usa status ERRO_* da base ou resultado em ERRO, sem transformar prévia, ausência de cálculo ou valor zero em erro. Logs históricos e filas antigas não definem esta contagem. Uma mesma pessoa pode ter registros em filiais diferentes. Duplicidades são apresentadas sem escolha silenciosa de execução.',
      tabela: tabela(
        [
          'Filial',
          'Execução',
          'Registros de funcionário com erro',
          'Evidência',
        ],
        rows,
      ),
      links: [{ texto: 'Processamentos', url: '/processamento' }],
    };
  }

  async consultar(intent: Intent, filtros: AssistenteDto, perfil: string) {
    const consultadoEm = new Date().toISOString();
    if (intent === 'ajuda') {
      return {
        texto:
          'Em Processamentos, selecione a competência e a filial. Cada par deve ter uma execução. As variáveis alimentam as fórmulas e podem ter resultados parciais. Em Gestão de KM consulte os quilômetros, e em Relatórios consulte os indicadores financeiros do Vale.',
        detalhes:
          'O cálculo, o ajuste manual e o registro de envio ao RM são etapas distintas. O assistente consulta registros existentes.',
        fonte: 'Guia do Vale Expresso',
        consultadoEm,
        links: [
          { texto: 'Processamentos', url: '/processamento' },
          { texto: 'Gestão de KM', url: '/gestao-km' },
          { texto: 'Relatórios', url: '/relatorios' },
        ],
      };
    }
    if (intent === 'esclarecer')
      return {
        texto:
          'Escolha uma consulta sugerida ou informe qual etapa do Vale quer investigar.',
      };
    if (!filtros.periodoId)
      return { texto: 'Selecione uma competência para consultar os dados.' };
    if (intent === 'erros' && !filtros.matricula)
      return this.errosPorFilial(filtros, consultadoEm);
    if (!filtros.filialId && intent !== 'pendencias')
      return { texto: 'Selecione uma filial para esta consulta.' };
    if (intent === 'formulas' && perfil !== 'admin') {
      return {
        texto:
          'O cadastro de fórmulas é acessível ao perfil administrador. Os resultados por fórmula estão disponíveis em Valores.',
      };
    }

    const periodo = await this.prisma.periodo.findUnique({
      where: { periodo_id: filtros.periodoId },
      select: { competencia: true },
    });
    if (!periodo) throw new BadRequestException('Competência não encontrada.');
    const filiais = await this.prisma.filial.findMany({
      where: filtros.filialId
        ? { filial_id: filtros.filialId }
        : { ativa: true },
      select: { filial_id: true, nome: true },
      orderBy: { filial_id: 'asc' },
      take: limite + 1,
    });
    if (!filiais.length)
      throw new BadRequestException('Nenhuma filial encontrada para o filtro.');
    if (filiais.length > limite)
      throw new BadRequestException(
        'Selecione uma filial para reduzir a consulta.',
      );
    const base = {
      competencia: periodo.competencia,
      filial: filtros.filialId ? filiais[0].nome : 'Todas as filiais ativas',
      matricula: filtros.matricula || undefined,
      fonte: 'Banco do Vale Expresso',
      consultadoEm,
    };
    if (intent === 'financeiro') {
      const relatorio = await this.dash.getFinanceiroTimeline({
        startCompetencia: periodo.competencia,
        endCompetencia: periodo.competencia,
        filialIds: [filiais[0].filial_id],
      });
      const { pago, desconto, saldo, funcionarios } = relatorio.totals;
      return {
        ...base,
        fonte: 'Relatório financeiro do Vale',
        texto: `O relatório financeiro registra ${funcionarios} funcionário(s) no recorte selecionado.`,
        detalhes:
          'Os indicadores usam os registros de envio do Vale. Os valores representam o relatório local, sem conciliação com o RM.',
        tabela: tabela(
          ['Pago', 'Desconto', 'Saldo', 'Funcionários'],
          [[pago, desconto, saldo, funcionarios]],
        ),
        grafico: [
          { rotulo: 'Pago', valor: pago, moeda: true },
          { rotulo: 'Desconto', valor: desconto, moeda: true },
          { rotulo: 'Saldo', valor: saldo, moeda: true },
        ],
        links: [{ texto: 'Relatórios', url: '/relatorios' }],
      };
    }

    const runs = await this.prisma.execucao.findMany({
      where: { historica_de_execucao_id:null,
        periodo_id: filtros.periodoId,
        filial: filtros.filialId
          ? { filial_id: filtros.filialId }
          : { ativa: true },
      },
      select: {
        execucao_id: true,
        filial_id: true,
        status: true,
        data_execucao: true,
      },
      take: limite + 1,
    });
    if (runs.length > limite)
      throw new BadRequestException(
        'Selecione uma filial para reduzir a consulta.',
      );
    if (intent === 'pendencias') {
      const criacao = await this.prisma.execucao_create_queue.groupBy({
        by: ['filial_id', 'status'],
        where: {
          periodo_id: filtros.periodoId,
          status: { in: ['PENDENTE', 'PROCESSANDO'] },
          filial: filtros.filialId
            ? { filial_id: filtros.filialId }
            : { ativa: true },
        },
        _count: true,
      });
      const counts = await this.prisma.execucao_funcionario_base.groupBy({
        by: ['execucao_id', 'status'],
        where: {
          execucao: {
            periodo_id: filtros.periodoId,
            filial: filtros.filialId
              ? { filial_id: filtros.filialId }
              : { ativa: true },
          },
        },
        _count: true,
      });
      const rows = filiais.map((filial): Cell[] => {
        const branchRuns = runs.filter(
          (run) => run.filial_id === filial.filial_id,
        );
        const [run] = branchRuns;
        const fila = criacao
          .filter((item) => item.filial_id === filial.filial_id)
          .reduce((total, item) => total + item._count, 0);
        if (branchRuns.length > 1)
          return [
            filial.nome,
            'Execuções duplicadas',
            null,
            fila,
            null,
            null,
            null,
          ];
        if (!run)
          return [filial.nome, 'Sem execução', null, fila, null, null, null];
        const bases = counts.filter(
          (item) => item.execucao_id === run.execucao_id,
        );
        const total = bases.reduce((soma, item) => soma + item._count, 0);
        const enviados =
          bases.find((item) => item.status === 'ENVIADO_RM')?._count ?? 0;
        const erros = bases
          .filter((item) => item.status?.startsWith('ERRO_'))
          .reduce((soma, item) => soma + item._count, 0);
        return [
          filial.nome,
          run.status,
          run.execucao_id,
          fila,
          total - enviados,
          erros,
          run.data_execucao.toISOString(),
        ];
      });
      const abertas = rows.filter(
        (row) =>
          row[1] !== 'FINALIZADA' || Number(row[3]) > 0 || Number(row[4]) > 0,
      ).length;
      return {
        ...base,
        texto: `${abertas} de ${rows.length} filial(is) têm execução ausente, aberta, duplicada, criação em fila ou funcionários sem envio registrado.`,
        grafico: [
          { rotulo: 'Filiais com pendência', valor: abertas },
          { rotulo: 'Filiais sem pendência', valor: rows.length - abertas },
          {
            rotulo: 'Criações na fila',
            valor: rows.reduce((soma, row) => soma + Number(row[3]), 0),
          },
        ],
        tabela: tabela(
          [
            'Filial',
            'Execução',
            'ID execução',
            'Criação em fila',
            'Funcionários sem envio',
            'Funcionários com erro',
            'Criada em',
          ],
          rows,
        ),
        links: [{ texto: 'Processamentos', url: '/processamento' }],
      };
    }
    if (intent === 'formulas') {
      const formulas = await this.prisma.formula.findMany({
        where: { filial_id: filiais[0].filial_id },
        select: {
          nome: true,
          versao: true,
          ativa: true,
          data_inicio_vigencia: true,
          data_fim_vigencia: true,
        },
        orderBy: { formula_id: 'asc' },
        take: limite + 1,
      });
      return {
        ...base,
        texto: 'Cadastro atual de fórmulas da filial.',
        detalhes:
          'A versão exibida vem do cadastro atual. A competência selecionada não reconstrói versões históricas.',
        tabela: tabela(
          ['Fórmula', 'Versão atual', 'Ativa', 'Início', 'Fim'],
          formulas.map((f) => [
            f.nome,
            f.versao,
            f.ativa ? 'Sim' : 'Não',
            f.data_inicio_vigencia.toISOString().slice(0, 10),
            f.data_fim_vigencia?.toISOString().slice(0, 10) ?? null,
          ]),
        ),
        links: [
          {
            texto: 'Cadastro de fórmulas',
            url: `/filial/formulas/${filiais[0].filial_id}`,
          },
        ],
      };
    }
    if (runs.length !== 1) {
      return {
        ...base,
        texto: runs.length
          ? 'Há mais de uma execução para esta filial e competência. Verifique as duplicidades em Processamentos.'
          : 'Não há execução para esta filial e competência.',
        links: [{ texto: 'Processamentos', url: '/processamento' }],
      };
    }
    const [run] = runs;
    const execucao_id = run.execucao_id;
    const links = [
      { texto: 'Abrir execução', url: `/processamento/${execucao_id}` },
    ];
    const scope = {
      execucao_id,
      ...(filtros.matricula ? { funcionario_id_rm: filtros.matricula } : {}),
    };
    if (intent === 'comparacao') {
      const competenciaAnterior = anterior(periodo.competencia);
      const previousRuns = await this.prisma.execucao.findMany({
        where: { historica_de_execucao_id:null,
          filial_id: run.filial_id,
          periodo: { competencia: competenciaAnterior },
        },
        select: { execucao_id: true, periodo_id: true },
        take: 2,
      });
      if (previousRuns.length !== 1)
        return {
          ...base,
          links,
          texto: `A competência ${competenciaAnterior} ${previousRuns.length ? 'tem execuções duplicadas' : 'não tem execução'} nesta filial.`,
        };
      const [prev] = previousRuns;
      const ids = [execucao_id, prev.execucao_id];
      const [populacao, formulasUsadas, formulasAtivas] = await Promise.all([
        this.prisma.execucao_funcionario_base.findMany({
          where: { execucao_id: { in: ids } },
          select: {
            execucao_id: true,
            codcoligada: true,
            funcionario_id_rm: true,
          },
          take: limite * 2 + 1,
        }),
        this.prisma.execucao_funcionario.groupBy({
          by: ['formula_id'],
          where: { execucao_id: { in: ids } },
          take: limite + 1,
          orderBy: { formula_id: 'asc' },
        }),
        this.prisma.formula.count({
          where: { filial_id: run.filial_id, ativa: true },
        }),
      ]);
      if (populacao.length > limite * 2)
        return {
          ...base,
          links,
          texto:
            'O volume excede o limite para comparar a população com precisão.',
        };
      const pessoas = (id: number) =>
        new Set(
          populacao
            .filter((p) => p.execucao_id === id)
            .map((p) => JSON.stringify([p.codcoligada, p.funcionario_id_rm])),
        );
      const atual = pessoas(execucao_id);
      const antes = pessoas(prev.execucao_id);
      const entraram = [...atual].filter((p) => !antes.has(p)).length;
      const sairam = [...antes].filter((p) => !atual.has(p)).length;
      const texto = `Em relação a ${competenciaAnterior}, ${entraram} funcionário(s) entraram e ${sairam} saíram da população da execução.`;
      if (
        populacao.length * Math.max(1, formulasUsadas.length + formulasAtivas) >
        10000
      ) {
        return {
          ...base,
          texto,
          links: [
            ...links,
            {
              texto: 'Variação por competência',
              url: '/variacao-competencias',
            },
          ],
          detalhes:
            'A tabela de variação excede o limite de consulta do assistente.',
        };
      }
      const variacao = await this.relatorios.variation(
        filtros.periodoId,
        prev.periodo_id,
        run.filial_id,
      );
      if (
        variacao.execucaoAtual !== execucao_id ||
        variacao.execucaoAnterior !== prev.execucao_id
      ) {
        return {
          ...base,
          links,
          texto:
            'As execuções do recorte mudaram durante a consulta. Atualize e consulte novamente.',
        };
      }
      return {
        ...base,
        fonte: 'Relatório de variação do Vale',
        links: [
          ...links,
          { texto: 'Variação por competência', url: '/variacao-competencias' },
        ],
        texto,
        detalhes:
          'A variação usa valores calculados e a fórmula gravada em cada execução. Alterações de fórmula, mudanças de população e registros sem versão histórica confiável aparecem separadamente.',
        tabela: tabela(
          [
            'Matrícula',
            'Funcionário',
            'Fórmula',
            competenciaAnterior,
            periodo.competencia,
            'Diferença',
            'Variação (%)',
            'Situação',
            'Observação',
          ],
          variacao.rows.map((v) => [
            v.matricula,
            v.nome,
            v.formula,
            numeroParaRelatorio(v.anterior),
            numeroParaRelatorio(v.atual),
            numeroParaRelatorio(v.diferenca),
            numeroParaRelatorio(v.percentual),
            v.situacao,
            v.observacao,
          ]),
        ),
      };
    }
    if (intent === 'km') {
      const km = await this.prisma.execucao_funcionario_base.findMany({
        where: scope,
        select: { funcionario_id_rm: true, nome_funcionario: true, km: true },
        orderBy: { execucao_funcionario_base_id: 'asc' },
        take: limite + 1,
      });
      return {
        ...base,
        texto: km.length
          ? 'Quilometragem registrada na base da execução.'
          : 'Nenhum funcionário encontrado neste recorte.',
        tabela: tabela(
          ['Matrícula', 'Funcionário', 'KM'],
          km.map((p) => [
            p.funcionario_id_rm,
            p.nome_funcionario,
            numeroParaRelatorio(p.km?.toString() ?? null),
          ]),
        ),
        links: [...links, { texto: 'Gestão de KM', url: '/gestao-km' }],
      };
    }
    if (intent === 'variaveis') {
      const memoria = await this.prisma.memoria_calculo.findMany({
        where: {
          execucao_funcionario: {
            execucao_id,
            execucao_funcionario_base: scope,
          },
        },
        select: {
          variavel_codigo: true,
          variavel_nome: true,
          valor: true,
          origem: true,
          data_registro: true,
          execucao_funcionario: {
            select: {
              funcionario_id_rm: true,
              formula_id: true,
              execucao_funcionario_base: { select: { status: true } },
            },
          },
        },
        orderBy: { memoria_id: 'asc' },
        take: limite + 1,
      });
      const falhas = await this.prisma.execucao_funcionario_base.count({
        where: { ...scope, status: 'ERRO_VARIAVEIS' },
      });
      const logs = await this.prisma.log_execucao.findMany({
        where: {
          execucao_id,
          nivel: 'ERROR',
          OR: [
            { mensagem: { startsWith: 'Erro RM variavel ' } },
            {
              mensagem: {
                startsWith: 'Valor RESULTADO inválido (NaN) para variavel ',
              },
            },
          ],
        },
        select: { mensagem: true, data_log: true },
        orderBy: { log_id: 'desc' },
        take: 100,
      });
      const falhasRecentes = logs.flatMap((log) => {
        const erro = classificarLog(log.mensagem);
        if (
          !erro ||
          (scope.funcionario_id_rm &&
            erro.matricula !== scope.funcionario_id_rm)
        )
          return [];
        return [
          [
            erro.matricula,
            null,
            erro.codigo,
            null,
            null,
            'Log histórico',
            erro.causa,
            log.data_log.toISOString(),
          ],
        ];
      });
      return {
        ...base,
        links,
        texto: `${memoria.length > limite ? 'Mais de ' + limite : memoria.length} registro(s) de variável gravados e ${falhas} funcionário(s) com status de erro nas variáveis.`,
        detalhes:
          'Variáveis gravadas contam mesmo quando o funcionário tem erro. Uma variável ausente pode não ter sido tentada. As falhas reconhecidas entre os 100 logs recentes de variáveis são históricas e podem já ter sido corrigidas.',
        tabela: tabela(
          [
            'Matrícula',
            'ID fórmula',
            'Variável',
            'Nome',
            'Valor',
            'Origem',
            'Estado ou causa registrada',
            'Registrada em',
          ],
          [
            ...falhasRecentes,
            ...memoria.map((m) => [
              m.execucao_funcionario.funcionario_id_rm,
              m.execucao_funcionario.formula_id,
              m.variavel_codigo,
              m.variavel_nome,
              numeroParaRelatorio(m.valor.toString()),
              m.origem,
              m.execucao_funcionario.execucao_funcionario_base.status,
              m.data_registro.toISOString(),
            ]),
          ],
        ),
      };
    }
    if (intent === 'erros') {
      const bases = await this.prisma.execucao_funcionario_base.findMany({
        where: {
          ...scope,
          OR: [
            {
              status: {
                in: [
                  'ERRO_VARIAVEIS',
                  'ERRO_RESULTADOS',
                  'RESULTADOS_PARCIAL',
                  'ERRO_RM',
                  'PREVIA',
                  'VARIAVEIS_PROCESSADAS',
                ],
              },
            },
            { status: null },
          ],
        },
        select: { funcionario_id_rm: true, status: true },
        orderBy: { execucao_funcionario_base_id: 'asc' },
        take: limite + 1,
      });
      const queue = await this.execucoes.getExecucaoQueueStatus(execucao_id);
      const logs = filtros.matricula
        ? await this.prisma.log_execucao.findMany({
            where: {
              execucao_id,
              nivel: 'ERROR',
              mensagem: { contains: filtros.matricula },
            },
            select: { mensagem: true, data_log: true },
            orderBy: { log_id: 'desc' },
            take: 100,
          })
        : [];
      const evidencias = logs.flatMap((log) => {
        const erro = classificarLog(log.mensagem);
        if (!erro || erro.matricula !== filtros.matricula) return [];
        return [
          [
            erro.matricula,
            'Log histórico',
            erro.codigo,
            erro.causa,
            log.data_log.toISOString(),
          ],
        ];
      });
      return {
        ...base,
        links,
        texto: `${queue.pending} item(ns) aguardando e ${queue.processing} em processamento na execução. Veja os estados por funcionário.`,
        detalhes:
          'Erro de variável: confira os logs e os valores gravados. Erro de resultado: verifique a memória e a fórmula vigente na tela. Em prévia ou com variáveis prontas, o estado indica a etapa e não comprova a causa. Erro de RM deve ser conferido no histórico da execução.',
        tabela: tabela(
          [
            'Matrícula',
            'Status',
            'Código relacionado',
            'Evidência histórica',
            'Registrada em',
          ],
          [
            ...bases.map((p) => [
              p.funcionario_id_rm,
              p.status,
              null,
              null,
              null,
            ]),
            ...evidencias,
          ],
        ),
      };
    }
    const valores = await this.prisma.execucao_funcionario.findMany({
      where: { execucao_id, execucao_funcionario_base: scope },
      select: {
        funcionario_id_rm: true,
        formula: { select: { nome: true, versao: true } },
        status: true,
        formula_snapshot: true,
        revisao: true,
        enviado_revisao: true,
        valor_calculado: true,
        valor_final: true,
        ajuste_manual: true,
        execucao_funcionario_base: { select: { nome_funcionario: true } },
      },
      orderBy: { execucao_funcionario_id: 'asc' },
      take: limite + 1,
    });
    return {
      ...base,
      links,
      texto: valores.length
        ? 'Resultados registrados por funcionário e fórmula.'
        : 'Nenhum resultado por fórmula encontrado neste recorte.',
      detalhes:
        'Campos vazios representam ausência de valor. A versão de cálculo só aparece quando há fórmula histórica confiável. O valor final é o registro local. Confira a revisão registrada no RM separadamente.',
      tabela: tabela(
        [
          'Matrícula',
          'Funcionário',
          'Fórmula',
          'Versão de cálculo',
          'Versão no cadastro',
          'Situação',
          'Calculado',
          'Final local',
          'Ajuste manual',
          'Status do resultado',
          'Revisão local',
          'Revisão com envio registrado',
        ],
        valores.map((v) => {
          const calculado = v.valor_calculado?.toString() ?? null;
          const formulaCalculada = lerSnapshotFormula(v.formula_snapshot);
          return [
            v.funcionario_id_rm,
            v.execucao_funcionario_base.nome_funcionario,
            formulaCalculada?.nome ?? v.formula.nome,
            formulaCalculada?.versao ?? null,
            v.formula.versao,
            situacaoValor(v.status, calculado),
            numeroParaRelatorio(calculado),
            numeroParaRelatorio(v.valor_final?.toString() ?? null),
            v.ajuste_manual ? 'Sim' : 'Não',
            v.status,
            v.revisao,
            v.enviado_revisao,
          ];
        }),
      ),
    };
  }
}
