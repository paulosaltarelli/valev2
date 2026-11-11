import { transportRules, ruleKey, ruleEventValues } from './transport-rules';
import { chunks } from 'src/utils/sql-server-ids';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, formula, type execucao_funcionario_base, type variavel } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hasStageFailure, hasStagePending } from './retry-errors';
import { operationProgress } from './operation-progress';
import { RmService } from 'src/rm/rm.service';
import { employeeKey, isBatchChapa, isPve2EventQuery, readPve2EventValues } from './rm-variable-batch';


export type CalculationEvent = { referencia: string; variavel: string | null; valor: string | null; origem: string; coletadoEm: string; consulta?: string };
type FormulaWithEvent = formula & { evento_calculo?: CalculationEvent; snapshot_origem?: string };
export const calculationEventCode = (f: Partial<FormulaWithEvent>) => {
  if (f.evento_calculo) return f.evento_calculo.valor;
  const reference = f.codEvento?.trim() ?? '';
  return reference && !reference.includes('(:') ? reference : null;
};

type Tx = Prisma.TransactionClient;
export type Etapa = 'VARIAVEIS' | 'VALORES' | 'CONFERIR' | 'ENVIAR_RM';
export type PedidoOperacao = {
  etapa: Etapa;
  execucaoIds: number[];
  baseIds?: number[];
  recalcular?: boolean;
  somenteErros?: boolean;
  somentePendencias?: boolean;
};
const ativos = ['PENDENTE', 'PROCESSANDO'];
const calculados = ['RESULTADOS_PROCESSADOS', 'ENVIADO_RM', 'ERRO_RM'];
const resultadoValido = (r: { status: string; valor_final: unknown }) =>
  ['PROCESSADO', 'ENVIADO_RM'].includes(r.status) && r.valor_final !== null;
export const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const idsValidos = (value: unknown): number[] => {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 5000 ||
    value.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new BadRequestException('Selecione identificadores válidos.');
  return [...new Set(value as number[])].sort((a, b) => a - b);
};
const dateRm = (value: Date) =>
  `${value.toISOString().slice(0, 10)}T00:00:00-03:00`;

type SendComponent = {id:number;revisao:number;[key:string]:unknown};
type SendEvent = {id:number;revisao:number;record:Record<string,string|number|null>;componentes?:SendComponent[]};
export function groupSendEvents<T extends SendEvent>(events:T[]):T[] {
  const groups=new Map<string,T[]>();
  for(const event of events) {
    const key=JSON.stringify([event.record.CODCOLIGADA,event.record.CODFILIAL,event.record.CHAPA,event.record.DATAINI,event.record.DATAFIM,event.record.CODEVENTO,event.record.TIPO]);
    const group=groups.get(key)??[];group.push(event);groups.set(key,group);
  }
  return [...groups.values()].map(group=>{
    const first=group[0];
    const total=group.reduce((sum,e)=>sum.plus(String(e.record.VALOR)),new Prisma.Decimal(0));
    if(!total.isFinite())throw new BadRequestException('Valor inválido na soma do evento.');
    return {...first,valor:total.toFixed(2),nome:group.length>1 ? "Soma de "+group.length+" parcelas" : (first as T & {nome?:string}).nome,record:{...first.record,VALOR:total.toDecimalPlaces(2).toNumber()},
      componentes:group.map(({componentes:_,...event})=>event as SendComponent)};
  });
}

@Injectable()
export class OperacaoService {
  constructor(private readonly prisma: PrismaService, private readonly rm: RmService) {}

  private async lock(tx: Tx, ids: number[]) {
    // Todos os comandos de usuário adquirem o mesmo lock, em ordem estável.
    for (const id of [...ids].sort((a, b) => a - b)) {
      const rows = await tx.$queryRaw<Array<{ execucao_id: number }>>(
        Prisma.sql`SELECT execucao_id FROM dbo.execucao WITH (UPDLOCK, HOLDLOCK) WHERE execucao_id = ${id}`,
      );
      if (!rows.length) throw new NotFoundException('Execução não encontrada.');
    }
  }

  async controlQueue(id: number, action: string, sessionId: string) {
    if (!['pausar', 'retomar', 'cancelar'].includes(action))
      throw new BadRequestException('Comando de fila inválido.');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, [id]);
      const where = { execucao_id: id };
      const execution = await tx.execucao.findUniqueOrThrow({ where });
      const pending = { ...where, status: 'PENDENTE' };
      if (action === 'retomar') {
        if (execution.controle_fila !== 'PAUSADA')
          throw new ConflictException('A execução precisa estar pausada para retomar.');
        await tx.execucao_queue.updateMany({ where: pending, data: { session_id: sessionId } });
        await tx.execucao.update({ where, data: { controle_fila: null } });
        return { message: 'A execução voltou à fila.' };
      }
      if (execution.controle_fila === 'CANCELADA' ||
          !(await tx.execucao_queue.count({ where: { ...where, status: { in: ativos } } })))
        throw new ConflictException('A execução não tem trabalho disponível para este comando.');
      if (action === 'cancelar') {
        await tx.execucao_queue.updateMany({
          where: pending,
          data: { status: 'CANCELADO', next_run_at: null, updated_at: new Date() },
        });
      }
      await tx.execucao.update({
        where,
        data: { controle_fila: action === 'pausar' ? 'PAUSADA' : 'CANCELADA' },
      });
      return { message: action === 'pausar'
        ? 'Pausa registrada. O lote em andamento pode terminar.'
        : 'Cancelamento registrado. O lote em andamento pode terminar.' };
    });
  }

  async summary(periodoId?: number) {
    const periodos = await this.prisma.periodo.findMany({
      orderBy: { data_inicio: 'desc' },
    });
    const periodo = periodoId
      ? periodos.find((p) => p.periodo_id === periodoId)
      : (periodos.find((p) => p.ativo) ?? periodos[0]);
    if (periodoId && !periodo)
      throw new NotFoundException('Competência não encontrada.');
    if (!periodo)
      return { periodos, periodo: null, rows: [], updatedAt: new Date() };
    const rows = await this.prisma.execucao.findMany({
      where: { periodo_id: periodo.periodo_id },
      orderBy: { execucao_id: 'desc' },
      include: {
        filial: { select: {
          nome: true,
          formula: { where: { ativa: true }, select: { formula_id: true, expressao: true } },
          variavel: { where: { ativa: true }, select: { codigo: true } },
        } },
        execucao_funcionario_base: {
          select: {
            execucao_funcionario_base_id: true,
            status: true,
            execucao_funcionario: {
              select: {
                status: true,
                revisao: true,
                conferido_revisao: true,
                enviado_revisao: true,
                valor_final: true,
                valor_calculado: true,
                formula_id: true,
                codigo_regra_rm: true,
                formula_snapshot: true,
              },
            },
          },
        },
        execucao_queue: {
          where: { status: { in: ativos } },
          select: {
            tipo: true,
            status: true,
            next_run_at: true,
            tentativas: true,
            updated_at: true,
            execucao_funcionario_base_id: true,
          },
        },
      },
    });
    // Aggregate in SQL instead of loading every duplicated memory row or its value.
    const memory = await this.prisma.$queryRaw<Array<{ baseId: number; codigo: string }>>(Prisma.sql`
      SELECT DISTINCT r.execucao_funcionario_base_id AS baseId, CASE WHEN r.codigo_regra_rm = '' THEN m.variavel_codigo ELSE CONCAT(r.codigo_regra_rm, '|', m.variavel_codigo) END AS codigo
      FROM dbo.memoria_calculo m
      INNER JOIN dbo.execucao_funcionario r ON r.execucao_funcionario_id = m.execucao_funcionario_id
      INNER JOIN dbo.execucao e ON e.execucao_id = r.execucao_id
      WHERE e.periodo_id = ${periodo.periodo_id}`);
    const savedByBase = new Map<number, string[]>();
    for (const item of memory) {
      const saved = savedByBase.get(item.baseId) ?? [];
      saved.push(item.codigo);
      savedByBase.set(item.baseId, saved);
    }
    const seen = new Set<number>();
    return {
      periodos,
      periodo,
      updatedAt: new Date(),
      rows: rows.map((e) => {
        const latest = !seen.has(e.filial_id);
        seen.add(e.filial_id);
        const bases = e.execucao_funcionario_base;
        const total = bases.length;
        const progresso = bases.reduce((sum, base) => {
          const partial = operationProgress(e.filial.formula, e.filial.variavel.map((v) => v.codigo),
            base.execucao_funcionario, savedByBase.get(base.execucao_funcionario_base_id) ?? []);
          return {
            variaveisCalculadas: sum.variaveisCalculadas + partial.variaveisCalculadas,
            variaveisPrevistas: sum.variaveisPrevistas + partial.variaveisPrevistas,
            formulasCalculadas: sum.formulasCalculadas + partial.formulasCalculadas,
            formulasPrevistas: sum.formulasPrevistas + partial.formulasPrevistas,
          };
        }, { variaveisCalculadas: 0, variaveisPrevistas: 0, formulasCalculadas: 0, formulasPrevistas: 0 });
        const variaveis = bases.filter(
          (b) => b.status && !['PREVIA', 'ERRO_VARIAVEIS'].includes(b.status),
        ).length;
        const valores = bases.filter(
          (b) =>
            calculados.includes(b.status ?? '') &&
            b.execucao_funcionario.length &&
            b.execucao_funcionario.every(resultadoValido),
        ).length;
        const rm = bases.filter(
          (b) =>
            b.execucao_funcionario.length &&
            b.execucao_funcionario.every(
              (r) =>
                r.status === 'ENVIADO_RM' && r.enviado_revisao === r.revisao,
            ),
        ).length;
        const conferidos = bases.filter(
          (b) =>
            b.execucao_funcionario.length &&
            b.execucao_funcionario.every(
              (r) => resultadoValido(r) && r.conferido_revisao === r.revisao,
            ),
        ).length;
        const jobs = e.execucao_queue;
        const processing = jobs.filter(
          (q) => q.status === 'PROCESSANDO',
        ).length;
        const pending = jobs.filter((q) => q.status === 'PENDENTE').length;
        const nextRunAt =
          jobs
            .filter((q) => q.next_run_at && q.tentativas > 0)
            .map((q) => q.next_run_at!)
            .sort((a, b) => +a - +b)[0] ?? null;
        const errors = bases.filter(
          (b) =>
            [
              'ERRO_VARIAVEIS',
              'ERRO_RESULTADOS',
              'RESULTADOS_PARCIAL',
              'ERRO_RM',
            ].includes(b.status ?? '') &&
            !jobs.some(
              (q) =>
                q.execucao_funcionario_base_id ===
                b.execucao_funcionario_base_id,
            ),
        ).length;
        const situacao = e.controle_fila === 'PAUSADA'
          ? (processing ? 'pausando' : 'pausada')
          : e.controle_fila === 'CANCELADA'
            ? (processing ? 'cancelando' : 'cancelada')
            : errors
          ? 'acao'
          : processing
            ? 'andamento'
            : pending && nextRunAt
              ? 'tentativa'
              : pending
                ? 'fila'
                : total > 0 && rm === total
                  ? 'enviado'
                  : valores > rm
                    ? 'envio'
                    : 'inicio';
        return {
          id: e.execucao_id,
          filialId: e.filial_id,
          filial: e.filial.nome,
          periodoId: e.periodo_id,
          createdAt: e.data_execucao,
          latest,
          total,
          progresso,
          variaveis,
          valores,
          rm,
          conferidos,
          errors,
          processing,
          pending,
          controleFila: e.controle_fila,
          nextRunAt,
          lastActivityAt: jobs.reduce<Date | null>((last, q) =>
            !last || q.updated_at > last ? q.updated_at : last, null),
          etapas: [...new Set(jobs.map((q) => q.tipo))],
          situacao,
        };
      }),
    };
  }

  async detail(id: number, page = 1, search = '', filter = 'todos') {
    const execucao = await this.prisma.execucao.findUnique({
      where: { execucao_id: id },
      include: {
        filial: { select: { nome: true, filial_id: true } },
        periodo: true,
      },
    });
    if (!execucao) throw new NotFoundException('Execução não encontrada.');
    const where: Prisma.execucao_funcionario_baseWhereInput = {
      execucao_id: id,
    };
    if (search)
      where.OR = [
        { nome_funcionario: { contains: search.slice(0, 150) } },
        { funcionario_id_rm: { contains: search.slice(0, 50) } },
      ];
    // Complemento do critério de funcionários com valores concluídos do resumo.
    // AND preserva a busca por nome/matrícula, que já ocupa where.OR.
    if (filter === 'pendencias' || filter === 'formulas_pendentes')
      where.AND = [{ OR: [
        { status: null },
        { status: { notIn: calculados } },
        { execucao_funcionario: { none: {} } },
        { execucao_funcionario: { some: { OR: [
          { status: { notIn: ['PROCESSADO', 'ENVIADO_RM'] } },
          { valor_final: null },
        ] } } },
        ...(filter === 'pendencias' ? [{ status: 'ERRO_RM' }] : []),
      ] }];
    if (filter === 'conferencia' || filter === 'resultados')
      where.status = { in: ['RESULTADOS_PROCESSADOS', 'ERRO_RM'] };
    if (filter === 'enviados') where.status = 'ENVIADO_RM';
    const safePage = Math.max(1, Math.floor(page) || 1);
    const [total, bases, queue, sendFailures] = await Promise.all([
      this.prisma.execucao_funcionario_base.count({ where }),
      this.prisma.execucao_funcionario_base.findMany({
        where,
        orderBy: [
          { nome_funcionario: 'asc' },
          { execucao_funcionario_base_id: 'asc' },
        ],
        skip: (safePage - 1) * 25,
        take: 25,
        include: {
          execucao_funcionario: {
            select: {
              execucao_funcionario_id: true,
              revisao: true,
              conferido_revisao: true,
              enviado_revisao: true,
              status: true,
              valor_calculado: true,
              valor_final: true,
              ajuste_manual: true,
              formula_snapshot: true,
              codigo_regra_rm: true,
              metadados_rm_id: true,
              formula: { select: { nome: true, codEvento: true, tipo: true } },
            },
          },
        },
      }),
      this.prisma.execucao_queue.findMany({
        where: { execucao_id: id, status: { in: ativos } },
        select: {
          queue_id: true,
          execucao_funcionario_base_id: true,
          tipo: true,
          status: true,
          tentativas: true,
          next_run_at: true,
          updated_at: true,
          execucao_funcionario_base: {
            select: { nome_funcionario: true, funcionario_id_rm: true },
          },
        },
        orderBy: { queue_id: 'asc' },
      }),
      this.prisma.execucao_queue.findMany({
        where: {execucao_id:id,tipo:'ENVIAR_RM',status:'ERRO',
          execucao_funcionario_base:{status:'ERRO_RM'}},
        orderBy:{queue_id:'desc'},take:100,
        select:{queue_id:true,execucao_funcionario_base_id:true,last_error:true,
          execucao_funcionario_base:{select:{nome_funcionario:true,funcionario_id_rm:true}}},
      }),
    ]);
    return {
      execucao,
      total,
      page: safePage,
      pageSize: 25,
      bases: bases.map((base) => ({
        ...base,
        execucao_funcionario: base.execucao_funcionario.map(({ formula_snapshot, ...result }) => {
          let formulaUtilizada: { nome?: string; codEvento?: string | null; tipo?: string; versao?: number; snapshot_origem?: string; evento_calculo?: CalculationEvent } | null = null;
          if (formula_snapshot) {
            try {
              const snapshot = JSON.parse(formula_snapshot);
              if (snapshot && typeof snapshot === 'object') {
                formulaUtilizada = { nome: snapshot.nome, codEvento: snapshot.codEvento, tipo: snapshot.tipo, versao: snapshot.versao, snapshot_origem: snapshot.snapshot_origem, evento_calculo: snapshot.evento_calculo };
              }
            } catch { /* Legacy invalid snapshots must not break the results list. */ }
          }
          return { ...result, formulaUtilizada };
        }),
      })),
      queue,
      sendFailures: sendFailures.filter((q,i,all)=>all.findIndex(item=>item.execucao_funcionario_base_id===q.execucao_funcionario_base_id)===i).map(q=>{
        const lines=q.last_error?.split(/\r?\n|\\n/).filter(Boolean)??[];
        const specific=lines.filter(line=>line.includes('[ERRO_ENVIAR_RM]')).pop();
        return {baseId:q.execucao_funcionario_base_id,
          chapa:q.execucao_funcionario_base.funcionario_id_rm,
          nome:q.execucao_funcionario_base.nome_funcionario,
          message:specific?.split('[ERRO_ENVIAR_RM] ')[1]??'O envio falhou. Consulte o histórico para mais detalhes.'};
      }),
      updatedAt: new Date(),
    };
  }



  // Display is strictly historical: never calls RM or reads today's variable definition.
  async employeeEvents(execucaoId: number, baseId: number) {
    const base = await this.prisma.execucao_funcionario_base.findFirst({
      where: { execucao_id: execucaoId, execucao_funcionario_base_id: baseId },
      select: { execucao_funcionario: { select: { execucao_funcionario_id: true, formula_snapshot: true } } },
    });
    if (!base) throw new NotFoundException('Funcionário não pertence a esta execução.');
    return { events: base.execucao_funcionario.map(result => {
      let snapshot: FormulaWithEvent | null = null;
      try { snapshot = result.formula_snapshot ? JSON.parse(result.formula_snapshot) : null; } catch { /* legacy */ }
      const reference = snapshot?.codEvento?.trim() ?? '';
      const variable = reference.match(/^\(\s*:([A-Za-z_][A-Za-z0-9_]*)\s*\)$/)?.[1] ?? null;
      const historical = snapshot && snapshot.snapshot_origem !== 'CONFERENCIA_LEGADO';
      const stored = historical && snapshot ? snapshot.evento_calculo : null;
      const value = historical && snapshot ? calculationEventCode(snapshot) : null;
      return { resultadoId: result.execucao_funcionario_id, variavel: stored?.variavel ?? variable,
        nome: stored?.variavel ?? variable ?? 'Evento RM', valor: value, origem: 'CALCULO',
        coletadoEm: stored?.coletadoEm ?? null,
        ...(!historical || (variable && !stored) ? { erro: 'Evento não registrado neste cálculo.' } : {}),
      };
    }) };
  }

  async preparePve2CalculationEvents(
    formulas: formula[],
    variables: variavel[],
    bases: execucao_funcionario_base[],
    sessionId?: string,
  ) {
    const cache = new Map<string, CalculationEvent>();
    if (!sessionId) return cache;
    const byBranch = new Map<string, execucao_funcionario_base[]>();
    for (const base of bases) {
      if (!isBatchChapa(base.funcionario_id_rm, 20)) continue;
      const key = JSON.stringify([base.codcoligada, base.codfilial]);
      const group = byBranch.get(key) ?? [];
      group.push(base);
      byBranch.set(key, group);
    }
    const requested = new Map<string, { variable: string; reference: string; query: string; limit: number | null }>();
    for (const formula of formulas) {
      const reference = formula.codEvento?.trim() ?? '';
      const variable = reference.match(/^\(\s*:([A-Za-z_][A-Za-z0-9_]*)\s*\)$/)?.[1];
      if (!variable) continue;
      const definition = variables.find(v => v.ativa && v.codigo.toUpperCase() === variable.toUpperCase());
      const query = definition?.sql_codigo_rm ?? null;
      if (definition?.valor_fixo != null || !isPve2EventQuery(query)) continue;
      requested.set(variable, { variable, reference, query, limit: definition?.chapas_por_chamada ?? null });
    }
    for (const { variable, reference, query, limit } of requested.values()) {
      for (const group of byBranch.values()) {
        const byChapa = new Map<string, execucao_funcionario_base[]>();
        for (const base of group) {
          const matches = byChapa.get(base.funcionario_id_rm) ?? [];
          matches.push(base);
          byChapa.set(base.funcionario_id_rm, matches);
        }
        const chapas = [...byChapa.keys()];
        const { codcoligada, codfilial } = group[0];
        for (const pack of chunks(chapas, limit ?? chapas.length)) {
          const employees = pack.map(chapa => ({ codcoligada, codfilial, chapa }));
          const response = await this.rm.realizaConsultaSql(query, {
            CHAPAS: pack.join(','),
            CODCOLIGADA: codcoligada,
            CODFILIAL: codfilial,
          }, sessionId);
          const requestedRules = group.filter(b=>pack.includes(b.funcionario_id_rm)).flatMap(b=>transportRules(b).map(regra=>({codcoligada,codfilial,chapa:b.funcionario_id_rm,regra})));
          const values = ruleEventValues(requestedRules, response.status ? response.data : null);
          const collected = new Date().toISOString();
          for (const employee of employees) {
            for (const base of byChapa.get(employee.chapa)!) for (const regra of transportRules(base)) {
              const valor=values.get(ruleKey(employee,regra)) ?? null;
              const key = JSON.stringify([base.execucao_funcionario_base_id, variable, query, null, regra]);
              cache.set(key, {
                referencia: reference, variavel: variable, valor,
                origem: 'RM', coletadoEm: collected, consulta: query,
              });
            }
          }
        }
      }
    }
    return cache;
  }


  private async captureCalculationEvent(id: number, formula: formula, sessionId?: string,
    cache = new Map<string, CalculationEvent>()): Promise<CalculationEvent> {
    const reference = formula.codEvento?.trim() ?? '';
    const variable = reference.match(/^\(\s*:([A-Za-z_][A-Za-z0-9_]*)\s*\)$/)?.[1] ?? null;
    const collected = () => new Date().toISOString();
    if (!variable) {
      if (reference.includes('(:')) throw new BadRequestException('Referência de evento RM inválida.');
      return { referencia: reference, variavel: null, valor: reference || null, origem: 'FORMULA', coletadoEm: collected() };
    }
    const result = await this.prisma.execucao_funcionario.findUniqueOrThrow({ where: { execucao_funcionario_id: id },
      include: { execucao_funcionario_base: { include: { execucao: { include: { periodo: true, filial: { include: { variavel: true } } } } } } },
    });
    const base = result.execucao_funcionario_base;
    const definition = base.execucao.filial.variavel.find(v => v.ativa && v.codigo.toUpperCase() === variable.toUpperCase());
    if (!definition) throw new BadRequestException('Variável de evento não configurada: ' + variable);
    const key = JSON.stringify([base.execucao_funcionario_base_id, variable, definition.sql_codigo_rm, definition.valor_fixo, result.codigo_regra_rm]);
    const cached = cache.get(key);
    if (cached) {
      if (cached.valor === null) throw new BadRequestException('RM não retornou um código válido para ' + variable + '. O cálculo não foi concluído.');
      return cached;
    }
    let value: string;
    if (definition.valor_fixo != null) value = String(definition.valor_fixo);
    else {
      if (!definition.sql_codigo_rm || !sessionId) throw new BadRequestException('Não foi possível registrar o evento ' + variable + ': consulta ou sessão RM indisponível.');
      const employee = { codcoligada: base.codcoligada, codfilial: base.codfilial, chapa: base.funcionario_id_rm };
      const pve2 = isPve2EventQuery(definition.sql_codigo_rm);
      if (pve2 && !isBatchChapa(employee.chapa, 20)) throw new BadRequestException('Chapa inválida para consulta de evento em lote.');
      const response = await this.rm.realizaConsultaSql(definition.sql_codigo_rm, pve2
        ? { CHAPAS: employee.chapa, CODCOLIGADA: employee.codcoligada, CODFILIAL: employee.codfilial }
        : {
          DTINICIO: base.execucao.periodo.data_inicio.toISOString().slice(0,10), DTFINAL: base.execucao.periodo.data_fim.toISOString().slice(0,10),
          CODCOLIGADA: base.codcoligada, CODFILIAL: base.codfilial, CHAPA: base.funcionario_id_rm, KM_MAX: Number(base.execucao.filial.km_max),
        }, sessionId);
      const raw = !response.status ? null : pve2
        ? ruleEventValues([{...employee,regra:result.codigo_regra_rm}], response.data).get(ruleKey(employee,result.codigo_regra_rm))
        : Array.isArray(response.data) ? response.data[0]?.RESULTADO : null;
      if (!((typeof raw === 'string' && raw.trim()) || (typeof raw === 'number' && Number.isFinite(raw))))
        throw new BadRequestException('RM não retornou um código válido para ' + variable + '. O cálculo não foi concluído.');
      value = String(raw).trim();
    }
    const event = { referencia: reference, variavel: variable, valor: value, origem: definition.valor_fixo != null ? 'FIXO' : 'RM', coletadoEm: collected(), consulta: definition.sql_codigo_rm ?? undefined };
    cache.set(key,event);
    return event;
  }

  async employeeVariables(execucaoId: number, baseId: number) {
    const base = await this.prisma.execucao_funcionario_base.findFirst({
      where: { execucao_id: execucaoId, execucao_funcionario_base_id: baseId },
      select: {
        status: true,
        funcionario_id_rm: true,
        execucao_queue: {
          where: { tipo: 'VARIAVEIS' },
          orderBy: { queue_id: 'desc' },
          take: 1,
          select: { status: true, last_error: true },
        },
        execucao_funcionario: {
          select: {
            codigo_regra_rm: true,
            formula: { select: { nome: true } },
            memoria_calculo: true,
          },
        },
      },
    });
    if (!base) throw new NotFoundException('Funcionário não pertence a esta execução.');
    const job = base.execucao_queue[0];
    const failed = base.status === 'ERRO_VARIAVEIS' || job?.status === 'ERRO';
    let error: string | null = null;
    if (failed) {
      const lines = job?.last_error?.split(/\r?\n|\\n/).filter((line) => line.trim()) ?? [];
      const specific = lines.filter((line) => line.includes('[ERRO_VARIAVEIS]')).pop();
      const legacy = specific ? null : await this.prisma.log_execucao.findFirst({
        where: {
          execucao_id: execucaoId,
          nivel: 'ERROR',
          mensagem: {
            startsWith: 'Erro RM variavel ',
            contains: ` para funcionário ${base.funcionario_id_rm}:`,
          },
        },
        orderBy: { log_id: 'desc' },
        select: { mensagem: true },
      });
      error = specific?.split('[ERRO_VARIAVEIS] ')[1] ?? legacy?.mensagem ??
        (lines.length ? lines[lines.length - 1] : null) ??
        'A consulta de variáveis falhou. Este registro não tem detalhe individual.';
    }
    return { results: base.execucao_funcionario, error };
  }

  async sendScope(pedido: PedidoOperacao) {
    const p = this.normalize({ ...pedido, etapa: 'ENVIAR_RM' });
    const items = await this.candidates(this.prisma, p);
    const excluded: Record<string, number> = {};
    let eligible = 0;
    for (const item of items) {
      if (item.reason) excluded[item.reason] = (excluded[item.reason] ?? 0) + 1;
      else eligible++;
    }
    return { eligible, excluded };
  }

  async result(execucaoId: number, id: number) {
    const r = await this.prisma.execucao_funcionario.findFirst({
      where: { execucao_id: execucaoId, execucao_funcionario_id: id },
      include: {
        formula: true,
        memoria_calculo: true,
        execucao_funcionario_base: {
          select: {
            nome_funcionario: true,
            funcionario_id_rm: true,
            status: true,
          },
        },
        ajuste_manual_fk: {
          include: { usuario: { select: { nome: true } } },
          orderBy: { ajuste_id: 'desc' },
          take: 50,
        },
      },
    });
    if (!r)
      throw new NotFoundException('Resultado não pertence a esta execução.');
    const historico = await this.prisma.resultado_historico.findMany({
      where: { resultado_id: id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return {
      ...r,
      formulaUtilizada: r.formula_snapshot
        ? (JSON.parse(r.formula_snapshot) as unknown)
        : null,
      historico: historico.map((h) => ({
        ...h,
        detalhe: JSON.parse(h.detalhe) as unknown,
      })),
    };
  }

  async history(execucaoId: number, resultadoId: number, before?: number) {
    const r = await this.prisma.execucao_funcionario.findFirst({
      where: { execucao_id: execucaoId, execucao_funcionario_id: resultadoId },
      select: { execucao_funcionario_id: true },
    });
    if (!r) throw new NotFoundException('Resultado não encontrado.');
    return this.prisma.resultado_historico.findMany({
      where: {
        resultado_id: resultadoId,
        ...(before ? { id: { lt: before } } : {}),
      },
      take: 100,
      orderBy: { id: 'desc' },
    });
  }

  async saveCalculation(id: number, valor: number, formula: formula, sessionId?: string, eventCache?: Map<string, CalculationEvent>) {
    const evento_calculo = await this.captureCalculationEvent(id, formula, sessionId, eventCache);
    const capturedFormula = { ...formula, evento_calculo };
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.execucao_funcionario.findUniqueOrThrow({
        where: { execucao_funcionario_id: id },
        include: { memoria_calculo: true },
      });
      const updated = await tx.execucao_funcionario.update({
        where: { execucao_funcionario_id: id },
        data: {
          valor_calculado: valor,
          ...(r.ajuste_manual ? {} : { valor_final: valor }),
          status: 'PROCESSADO',
          revisao: { increment: 1 },
          conferido_revisao: null,
          conferido_por: null,
          conferido_em: null,
          formula_snapshot: JSON.stringify(capturedFormula),
        },
      });
      await tx.resultado_historico.create({
        data: {
          resultado_id: id,
          execucao_id: r.execucao_id,
          revisao: updated.revisao,
          tipo: 'CALCULO',
          detalhe: JSON.stringify({
            formula: capturedFormula,
            evento_calculo,
            memoria: r.memoria_calculo,
            calculado: updated.valor_calculado,
            final: updated.valor_final,
          }),
        },
      });
      return updated;
    });
  }

  async adjust(
    execucaoId: number,
    id: number,
    valor: unknown,
    motivo: unknown,
    revision: unknown,
    usuarioId: number,
  ) {
    if (
      typeof valor !== 'number' ||
      !Number.isFinite(valor) ||
      Math.abs(valor) >= 1e14 ||
      Math.abs(valor * 100 - Math.round(valor * 100)) > 0.001
    )
      throw new BadRequestException(
        'Informe um valor com até duas casas decimais.',
      );
    if (
      typeof motivo !== 'string' ||
      motivo.trim().length < 5 ||
      motivo.trim().length > 255
    )
      throw new BadRequestException(
        'Descreva o motivo com 5 a 255 caracteres.',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, [execucaoId]);
      const r = await tx.execucao_funcionario.findFirst({
        where: { execucao_id: execucaoId, execucao_funcionario_id: id },
        include: { execucao_funcionario_base: { select: { status: true } } },
      });
      if (!r)
        throw new NotFoundException('Resultado não pertence a esta execução.');
      if (revision !== r.revisao)
        throw new ConflictException(
          'O resultado mudou. Atualize e revise novamente.',
        );
      await this.assertIdle(tx, execucaoId, r.execucao_funcionario_base_id);
      if (!resultadoValido(r) || !calculados.includes(r.execucao_funcionario_base.status ?? ''))
        throw new ConflictException('Conclua o cálculo antes de ajustar.');
      await tx.execucao_funcionario.update({
        where: { execucao_funcionario_id: id },
        data: {
          valor_final: valor,
          ajuste_manual: true,
          revisao: { increment: 1 },
          conferido_revisao: null,
          conferido_por: null,
          conferido_em: null,
          status: 'PROCESSADO',
        },
      });
      await tx.ajuste_manual.create({
        data: {
          execucao_funcionario_id: id,
          usuario_id: usuarioId,
          motivo: motivo.trim(),
          valor_anterior: r.valor_final,
          valor_novo: valor,
        },
      });
      await tx.resultado_historico.create({
        data: {
          resultado_id: id,
          execucao_id: execucaoId,
          revisao: r.revisao + 1,
          tipo: 'AJUSTE',
          usuario_id: usuarioId,
          detalhe: JSON.stringify({
            motivo: motivo.trim(),
            anterior: r.valor_final,
            novo: valor,
            enviadoRevisao: r.enviado_revisao,
          }),
        },
      });
      await tx.execucao_funcionario_base.update({
        where: { execucao_funcionario_base_id: r.execucao_funcionario_base_id },
        data: { status: 'RESULTADOS_PROCESSADOS' },
      });
      await tx.execucao.update({
        where: { execucao_id: execucaoId },
        data: { status: await tx.execucao_queue.count({ where: { execucao_id: execucaoId, status: { in: ativos } } }) ? 'EM_PROCESSAMENTO' : 'AGUARDANDO' },
      });
      return {
        status: true,
        message:
          'Ajuste registrado. A nova versão está disponível para envio ao RM.',
      };
    });
  }

  private async assertIdle(tx: Tx, execucaoId: number, baseId: number) {
    if (
      await tx.execucao_queue.count({
        where: {
          execucao_id: execucaoId,
          execucao_funcionario_base_id: baseId,
          status: { in: ativos },
        },
      })
    )
      throw new ConflictException(
        'Há uma etapa agendada ou em andamento para esta pessoa. Aguarde a conclusão.',
      );
  }

  async review(
    execucaoId: number,
    id: number,
    revision: number,
    usuarioId: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, [execucaoId]);
      return this.reviewResult(tx, execucaoId, id, revision, usuarioId);
    });
  }

  private async reviewResult(tx: Tx, execucaoId: number, id: number, revision: number, usuarioId: number) {
      const r = await tx.execucao_funcionario.findFirst({
        where: { execucao_id: execucaoId, execucao_funcionario_id: id },
        include: {
          formula: true,
          memoria_calculo: true,
          execucao_funcionario_base: true,
        },
      });
      if (!r) throw new NotFoundException('Resultado não encontrado.');
      if (
        r.revisao !== revision ||
        !resultadoValido(r) ||
        !calculados.includes(r.execucao_funcionario_base.status ?? '')
      )
        throw new ConflictException(
          'Resultado alterado ou incompleto. Atualize a conferência.',
        );
      await this.assertIdle(tx, execucaoId, r.execucao_funcionario_base_id);
      const snapshot =
        r.formula_snapshot ??
        JSON.stringify({ ...r.formula, snapshot_origem: 'CONFERENCIA_LEGADO' });
      await tx.execucao_funcionario.update({
        where: { execucao_funcionario_id: id },
        data: {
          conferido_revisao: revision,
          conferido_por: usuarioId,
          conferido_em: new Date(),
          formula_snapshot: snapshot,
        },
      });
      await tx.resultado_historico.create({
        data: {
          resultado_id: id,
          execucao_id: execucaoId,
          revisao: revision,
          usuario_id: usuarioId,
          tipo: 'CONFERENCIA',
          detalhe: JSON.stringify({
            formula: JSON.parse(snapshot),
            memoria: r.memoria_calculo,
            valor: r.valor_final,
            legado: !r.formula_snapshot,
          }),
        },
      });
      return {
        status: true,
        message: 'Conferência registrada para esta versão.',
      };
  }

  private normalize(p: PedidoOperacao): PedidoOperacao {
    if (!p || typeof p !== 'object')
      throw new BadRequestException('Pedido inválido.');
    if (!['VARIAVEIS', 'VALORES', 'CONFERIR', 'ENVIAR_RM'].includes(p.etapa))
      throw new BadRequestException('Etapa inválida.');
    if ((p.somenteErros || p.somentePendencias) && !['VARIAVEIS', 'VALORES'].includes(p.etapa))
      throw new BadRequestException('Retentativa disponível somente para variáveis ou valores.');
    return {
      etapa: p.etapa,
      execucaoIds: idsValidos(p.execucaoIds),
      ...(p.baseIds ? { baseIds: idsValidos(p.baseIds) } : {}),
      recalcular: p.somentePendencias === true || p.somenteErros === true || p.recalcular === true,
      somentePendencias: p.somentePendencias === true,
      somenteErros: p.somenteErros === true,
    };
  }

  private async candidates(tx: Tx, p: PedidoOperacao) {
    const bases = await tx.execucao_funcionario_base.findMany({
      where: {
        execucao_id: { in: p.execucaoIds },
        ...(p.baseIds
          ? { execucao_funcionario_base_id: { in: p.baseIds } }
          : {}),
      },
      orderBy: { execucao_funcionario_base_id: 'asc' },
      include: {
        execucao: {
          include: { filial: { select: { nome: true, formula: { where: { ativa: true }, select: { formula_id: true } } } }, periodo: true },
        },
        execucao_funcionario: {
          orderBy: { execucao_funcionario_id: 'asc' },
          include: { formula: true },
        },
        execucao_queue: {
          where: { status: { in: ativos } },
          select: { queue_id: true },
        },
      },
    });
    if (p.baseIds && bases.length !== p.baseIds.length)
      throw new BadRequestException(
        'A seleção contém pessoas de outra execução.',
      );
    const pendingReceipts = p.etapa === 'ENVIAR_RM'
      ? await tx.resultado_historico.findMany({
          where: { execucao_id: { in: p.execucaoIds }, tipo: 'ENVIO_RM_INICIADO' },
          select: { resultado_id: true },
        })
      : [];
    const started = new Set(pendingReceipts.map((row) => row.resultado_id));
    const draining = new Set((await tx.execucao_queue.findMany({
      where: {
        execucao_id: { in: p.execucaoIds },
        status: { in: ativos },
        execucao: { controle_fila: 'CANCELADA' },
      },
      select: { execucao_id: true },
      distinct: ['execucao_id'],
    })).map((q) => q.execucao_id));
    return bases.filter(b => {
      if (p.somentePendencias) {
        const activeFormulas = b.execucao.filial.formula;
        const rules = transportRules(b);
        const currentResults = activeFormulas ? b.execucao_funcionario.filter(result =>
          activeFormulas.some(formula => formula.formula_id === result.formula_id) && rules.includes(result.codigo_regra_rm ?? '')) : b.execucao_funcionario;
        if (p.etapa === 'VALORES' && activeFormulas?.length === 0) return false;
        const missingFormula = (activeFormulas ?? []).some(formula => rules.some(rule =>
          !currentResults.some(result => result.formula_id === formula.formula_id && (result.codigo_regra_rm ?? '') === rule)));
        return hasStagePending({ ...b, execucao_funcionario: currentResults }, p.etapa, missingFormula);
      }
      return !p.somenteErros || hasStageFailure(b, p.etapa);
    }).map((b) => {
      const results = b.execucao_funcionario;
      let reason = b.execucao.controle_fila === 'PAUSADA'
        ? 'Retome ou cancele a fila pausada desta execução'
        : draining.has(b.execucao_id)
          ? 'Aguarde o lote em andamento encerrar'
          : b.execucao_queue.length
            ? 'Etapa já agendada ou em andamento'
            : '';
      if (
        !reason &&
        p.etapa === 'VARIAVEIS' &&
        !p.recalcular &&
        !['PREVIA', 'ERRO_VARIAVEIS'].includes(b.status ?? '')
      )
        reason = 'Variáveis já concluídas';
      if (
        !reason &&
        p.etapa === 'VALORES' &&
        ![
          'VARIAVEIS_PROCESSADAS',
          'ERRO_RESULTADOS',
          'RESULTADOS_PARCIAL',
          ...(p.recalcular ? calculados : []),
        ].includes(b.status ?? '')
      )
        reason =
          'Conclua as variáveis; valores já concluídos ficam fora da retomada';
      if (!reason && p.etapa === 'CONFERIR') {
        if (!calculados.includes(b.status ?? '') || !results.length || !results.every(resultadoValido))
          reason = 'Cálculo incompleto';
        else if (results.every((r) => r.conferido_revisao === r.revisao))
          reason = 'Versão atual já conferida';
      }
      if (!reason && p.etapa === 'ENVIAR_RM') {
        if (results.some((r) => !r.metadados_rm_id && started.has(r.execucao_funcionario_id)))
          reason = 'Aguardando confirmação do RM';
        else if (
          !calculados.includes(b.status ?? '') ||
          !results.length ||
          !results.every(resultadoValido)
        )
          reason = 'Cálculo incompleto';
        else if (
          results.every(
            (r) => r.status === 'ENVIADO_RM' && r.enviado_revisao === r.revisao,
          )
        )
          reason = 'Versão atual já enviada';
        else if (
          results.some((r) => {
            const f = r.formula_snapshot
              ? (JSON.parse(r.formula_snapshot) as FormulaWithEvent)
              : r.formula;
            return !calculationEventCode(f) || !f.tipo;
          })
        )
          reason = 'Evento histórico ou tipo RM indisponível. Recalcule para registrar o evento.';
      }
      const eventos = results.map((r) => {
        const f = r.formula_snapshot
          ? (JSON.parse(r.formula_snapshot) as FormulaWithEvent)
          : r.formula;
        return {
          componentes: undefined as SendComponent[] | undefined,
          id: r.execucao_funcionario_id,
          revisao: r.revisao,
          conferencia: r.conferido_revisao,
          regra: fingerprint(f),
          codigoRegra: r.codigo_regra_rm,
          nome: f.nome,
          evento: calculationEventCode(f),
          tipo: f.tipo,
          valor: r.valor_final,
          operacao:
            r.enviado_revisao === r.revisao && r.status === 'ENVIADO_RM'
              ? 'ja_enviado'
              : r.metadados_rm_id
                ? 'atualizacao'
                : 'novo',
          record: {
            CODCOLIGADA: b.codcoligada,
            CODFILIAL: b.codfilial,
            CHAPA: b.funcionario_id_rm,
            DATAINI: dateRm(b.execucao.periodo.data_inicio),
            DATAFIM: dateRm(b.execucao.periodo.data_fim),
            CODEVENTO: calculationEventCode(f),
            VALOR: Number(r.valor_final),
            TIPO: f.tipo,
          },
        };
      });
      return {
        baseId: b.execucao_funcionario_base_id,
        execucaoId: b.execucao_id,
        nome: b.nome_funcionario,
        chapa: b.funcionario_id_rm,
        filial: b.execucao.filial.nome,
        competencia: b.execucao.periodo.competencia,
        status: b.status,
        reason,
        eventos: p.etapa === 'ENVIAR_RM' ? groupSendEvents(eventos) : eventos,
      };
    });
  }

  private async periodExecutionIds(periodoId: number) {
    idsValidos([periodoId]);
    const rows = await this.prisma.execucao.findMany({
      where: { periodo_id: periodoId }, orderBy: { execucao_id: 'desc' },
      distinct: ['filial_id'], select: { execucao_id: true, filial_id: true },
    });
    return rows.map(row => row.execucao_id);
  }

  async periodPendingScope(periodoId: number) {
    return this.pendingScopeIds(await this.periodExecutionIds(periodoId), true);
  }

  async executePeriodPending(periodoId: number, etapa: Etapa, usuarioId: number, sessionId: string) {
    if (!['VARIAVEIS', 'VALORES'].includes(etapa)) throw new BadRequestException('Escolha variáveis ou fórmulas.');
    const execucaoIds = await this.periodExecutionIds(periodoId);
    if (!execucaoIds.length) throw new BadRequestException('Nenhuma execução nesta competência.');
    return this.execute({ etapa, execucaoIds, somentePendencias: true }, usuarioId, sessionId);
  }

  async retryScope(execucaoId: number, pending = false) {
    return this.pendingScopeIds([execucaoId], pending);
  }

  private async pendingScopeIds(execucaoIds: number[], pending: boolean) {
    if (!execucaoIds.length) return { VARIAVEIS: { elegiveis: 0, bloqueados: 0, filiais: 0 }, VALORES: { elegiveis: 0, bloqueados: 0, filiais: 0 } };
    const counts = await Promise.all((['VARIAVEIS', 'VALORES'] as const).map(async etapa => {
      const items = await this.candidates(this.prisma, this.normalize({ etapa, execucaoIds, ...(pending ? { somentePendencias: true } : { somenteErros: true }) }));
      return [etapa, { elegiveis: items.filter(item => !item.reason).length, bloqueados: items.filter(item => item.reason).length, filiais: new Set(items.filter(item => !item.reason).map(item => item.execucaoId)).size }] as const;
    }));
    return Object.fromEntries(counts);
  }

  async employeeFailures(execucaoId: number, baseId: number) {
    const base = await this.prisma.execucao_funcionario_base.findFirst({
      where: { execucao_id: execucaoId, execucao_funcionario_base_id: baseId },
      include: { execucao_funcionario: true },
    });
    if (!base) throw new NotFoundException('Funcionário não pertence a esta execução.');
    const stages = ['VARIAVEIS', 'VALORES'].filter(stage => hasStageFailure(base, stage));
    if (base.status === 'ERRO_RM') stages.push('ENVIAR_RM');
    return Promise.all(stages.map(async etapa => {
      const queue = await this.prisma.execucao_queue.findFirst({
        where: { execucao_id: execucaoId, execucao_funcionario_base_id: baseId, tipo: etapa, last_error: { not: null } },
        orderBy: { queue_id: 'desc' }, select: { last_error: true, updated_at: true },
      });
      const logs = await this.prisma.log_execucao.findMany({
        where: { execucao_id: execucaoId, nivel: 'ERROR', mensagem: { contains: `funcionário ${base.funcionario_id_rm}:` } },
        orderBy: { log_id: 'desc' }, take: 50, select: { mensagem: true },
      });
      const messages = [...new Set(logs.map(log => log.mensagem).filter(message => etapa === 'VARIAVEIS'
        ? message.startsWith('Erro RM variavel ')
        : etapa === 'VALORES' ? /calcular fórmula|processar valores|Sem memoria_calculo/.test(message) : false))].slice(0, 6);
      return { etapa, mensagens: messages.length ? messages : [queue?.last_error || 'O processamento registrou uma falha, mas não armazenou o detalhe individual.'], atualizadoEm: queue?.updated_at ?? null };
    }));
  }

  async preview(pedido: PedidoOperacao, usuarioId: number) {
    const p = this.normalize(pedido);
    const items = await this.candidates(this.prisma, p);
    const id = randomUUID();
    const expiraEm = new Date(Date.now() + 10 * 60_000);
    await this.prisma.operacao_previa.create({
      data: {
        id,
        usuario_id: usuarioId,
        expira_em: expiraEm,
        pedido: JSON.stringify(p),
        fingerprint: fingerprint(items),
      },
    });
    return {
      id,
      etapa: p.etapa,
      recalcular: p.recalcular,
      expiraEm,
      items,
      elegiveis: items.filter((i) => !i.reason).length,
      excluidos: items.filter((i) => i.reason).length,
    };
  }

  // Ação direta do operador. Não exige conferência, prévia nem aprovação separada.
  async execute(pedido: PedidoOperacao, usuarioId: number, sessionId: string) {
    const p = this.normalize(pedido);
    if (p.etapa === 'CONFERIR') throw new BadRequestException('A conferência não é uma etapa de processamento.');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, p.execucaoIds);
      const items = await this.candidates(tx, p);
      const eligible = items.filter(i => !i.reason);
      if (!eligible.length) throw new BadRequestException(items[0]?.reason || 'Nenhuma pessoa disponível para esta etapa.');
      for (const item of eligible) {
        await tx.execucao_queue.create({ data: {
          execucao_id: item.execucaoId,
          execucao_funcionario_base_id: item.baseId,
          tipo: p.etapa,
          session_id: sessionId,
          revisao_payload: JSON.stringify({ usuarioId, eventos: item.eventos, somenteErros: p.somenteErros === true, somentePendencias: p.somentePendencias === true }),
        } });
      }
      await tx.execucao.updateMany({ where: { execucao_id: { in: [...new Set(eligible.map(i => i.execucaoId))] } }, data: { status: 'EM_PROCESSAMENTO', controle_fila: null } });
      return { status: true, message: `${eligible.length} pessoa(s) na fila de ${p.etapa === 'VARIAVEIS' ? 'variáveis' : p.etapa === 'VALORES' ? 'valores' : 'envio ao RM'}.${items.length > eligible.length ? ` ${items.length - eligible.length} fora da fila por etapa concluída, incompleta ou já agendada.` : ''}` };
    }, { timeout: 60000 });
  }

  async confirm(id: string, usuarioId: number, sessionId: string) {
    if (typeof id !== 'string' || id.length > 36)
      throw new BadRequestException('Prévia inválida.');
    return this.prisma.$transaction(
      async (tx) => {
        const previa = await tx.operacao_previa.findUnique({ where: { id } });
        if (!previa || previa.usuario_id !== usuarioId)
          throw new NotFoundException('Prévia não encontrada.');
        const p = JSON.parse(previa.pedido) as PedidoOperacao;
        await this.lock(tx, p.execucaoIds);
        const current = await tx.operacao_previa.findUniqueOrThrow({
          where: { id },
        });
        if (current.consumida_em)
          throw new ConflictException(
            'Este lote já foi confirmado. Consulte o andamento.',
          );
        if (current.expira_em < new Date())
          throw new ConflictException('A revisão expirou. Gere outra prévia.');
        const items = await this.candidates(tx, p);
        if (fingerprint(items) !== current.fingerprint)
          throw new ConflictException(
            'Os dados ou a fila mudaram. Revise uma nova prévia antes de confirmar.',
          );
        const eligible = items.filter((i) => !i.reason);
        if (!eligible.length)
          throw new BadRequestException('Nenhum item elegível neste recorte.');
        for (const item of eligible) {
          if (p.etapa === 'CONFERIR') {
            for (const event of item.eventos) {
              if (event.conferencia !== event.revisao)
                await this.reviewResult(tx, item.execucaoId, event.id, event.revisao, usuarioId);
            }
            continue;
          }
          await tx.execucao_queue.create({
            data: {
              execucao_id: item.execucaoId,
              execucao_funcionario_base_id: item.baseId,
              tipo: p.etapa,
              session_id: sessionId,
              revisao_payload: JSON.stringify({
                usuarioId,
                previaId: id,
                somenteErros: p.somenteErros === true,
                somentePendencias: p.somentePendencias === true,
                eventos: item.eventos,
              }),
            },
          });
        }
        if (p.etapa !== 'CONFERIR') await tx.execucao.updateMany({
          where: {
            execucao_id: {
              in: [...new Set(eligible.map((i) => i.execucaoId))],
            },
          },
          data: { status: 'EM_PROCESSAMENTO', controle_fila: null },
        });
        await tx.operacao_previa.update({
          where: { id },
          data: { consumida_em: new Date() },
        });
        return {
          status: true,
          message: p.etapa === 'CONFERIR'
            ? `Conferência registrada para ${eligible.length} pessoa(s). ${items.length - eligible.length} excluída(s) conforme a revisão.`
            : `${eligible.length} pessoa(s) incluída(s) na fila. ${items.length - eligible.length} excluída(s) conforme a revisão.`,
        };
      },
      { timeout: 60000 },
    );
  }

  // Exclusivo para a criação automática. Não recalcula resultados existentes.
  async enqueueInitial(
    execucaoId: number,
    ids: number[],
    etapa: 'VARIAVEIS' | 'VALORES',
    sessionId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, [execucaoId]);
        const execution = await tx.execucao.findUniqueOrThrow({ where: { execucao_id: execucaoId } });
        if (execution.controle_fila === 'CANCELADA')
          return { status: true, message: 'Fila inicial cancelada.' };
        const bases = await tx.execucao_funcionario_base.findMany({
          where: {
            execucao_id: execucaoId,
            execucao_funcionario_base_id: { in: idsValidos(ids) },
            status: {
              in: ['PREVIA', 'ERRO_VARIAVEIS', 'VARIAVEIS_PROCESSADAS'],
            },
          },
        });
        for (const b of bases) {
          const existing = await tx.execucao_queue.count({
            where: {
              execucao_funcionario_base_id: b.execucao_funcionario_base_id,
              tipo: etapa,
              status: { in: ativos },
            },
          });
          if (!existing)
            await tx.execucao_queue.create({
              data: {
                execucao_id: execucaoId,
                execucao_funcionario_base_id: b.execucao_funcionario_base_id,
                session_id: sessionId,
                tipo: etapa,
              },
            });
        }
        if (bases.length)
          await tx.execucao.update({
            where: { execucao_id: execucaoId },
            data: { status: 'EM_PROCESSAMENTO' },
          });
        return { status: true, message: 'Etapas iniciais agendadas.' };
      },
      { timeout: 60000 },
    );
  }

  async approvedSendGroups(baseId: number) {
    const q = await this.prisma.execucao_queue.findFirst({
      where: {execucao_funcionario_base_id:baseId,tipo:'ENVIAR_RM',status:'PROCESSANDO'},
      orderBy:{queue_id:'desc'},
    });
    if (!q?.revisao_payload) throw new ConflictException('Envio sem revisão. Gere uma nova prévia.');
    const payload=JSON.parse(q.revisao_payload) as {usuarioId:number;eventos:SendEvent[]};
    const [current]=await this.candidates(this.prisma,{etapa:'ENVIAR_RM',execucaoIds:[q.execucao_id],baseIds:[baseId]});
    const rows=await this.prisma.execucao_funcionario.findMany({where:{execucao_funcionario_base_id:baseId}});
    if (!current || !payload.eventos.length || payload.eventos.length !== current.eventos.length)
      throw new ConflictException('O conjunto de eventos mudou. Gere uma nova prévia.');
    return payload.eventos.map(event=>{
      const now=current.eventos.find(e=>e.id===event.id);
      // Compare every contribution, its revision, formula, value, event and employee scope.
      const comparable=(e:SendEvent)=>({id:e.id,revisao:e.revisao,record:e.record,componentes:e.componentes?.map(c=>({id:c.id,revisao:c.revisao,regra:c.regra,codigoRegra:c.codigoRegra,record:c.record}))});
      if (!now || fingerprint(comparable(now)) !== fingerprint(comparable(event)))
        throw new ConflictException('As regras ou valores mudaram depois da revisão. Gere uma nova prévia.');
      const components=event.componentes ?? [{id:event.id,revisao:event.revisao}];
      const members=components.map(c=>rows.find(r=>r.execucao_funcionario_id===c.id && r.revisao===c.revisao));
      if (members.some(r=>!r || !resultadoValido(r))) throw new ConflictException('Cálculo incompleto no envio.');
      const rmIds=[...new Set(members.flatMap(r=>r?.metadados_rm_id?[r.metadados_rm_id]:[]))];
      if(rmIds.length>1) throw new ConflictException('Evento com mais de um registro histórico no RM. Concilie os registros antes de reenviar.');
      const enviado=members.every(r=>r!.status==='ENVIADO_RM' && r!.enviado_revisao===r!.revisao);
      return {...event,componentes:components,usuarioId:payload.usuarioId,rmId:rmIds[0]??null,enviado};
    });
  }

  async receiptGroup(components: SendComponent[], rmId: number, usuarioId: number, record: unknown) {
    return this.prisma.$transaction(async tx=>{
      let rows=await tx.execucao_funcionario.findMany({where:{execucao_funcionario_id:{in:components.map(c=>c.id)}}});
      if(rows.length!==components.length)throw new ConflictException('Resultados ausentes durante o envio.');
      await this.lock(tx,[...new Set(rows.map(r=>r.execucao_id))]);
      rows=await tx.execucao_funcionario.findMany({where:{execucao_funcionario_id:{in:components.map(c=>c.id)}}});
      for(const component of components) {
        const row=rows.find(r=>r.execucao_funcionario_id===component.id)!;
        if(row.revisao!==component.revisao)throw new ConflictException('Resultado alterado durante o envio.');
        await tx.execucao_funcionario.update({where:{execucao_funcionario_id:row.execucao_funcionario_id},data:{metadados_rm_id:rmId,enviado_revisao:component.revisao,status:'ENVIADO_RM'}});
        await tx.resultado_historico.create({data:{resultado_id:row.execucao_funcionario_id,execucao_id:row.execucao_id,revisao:component.revisao,usuario_id:usuarioId,tipo:'ENVIO_RM',detalhe:JSON.stringify({metadadosRmId:rmId,record,componentes:components,confirmado:true})}});
      }
    });
  }

  async beginRmInsert(execucaoId: number, id: number, revisao: number, usuarioId: number, record: unknown) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, [execucaoId]);
      const prior = await tx.resultado_historico.findFirst({
        where: { resultado_id: id, tipo: 'ENVIO_RM_INICIADO' },
        select: { id: true },
      });
      if (prior) throw new ConflictException('Aguardando confirmação do RM. Verifique se o evento foi gravado antes de reenviar.');
      await tx.resultado_historico.create({
        data: {
          resultado_id: id,
          execucao_id: execucaoId,
          revisao,
          usuario_id: usuarioId,
          tipo: 'ENVIO_RM_INICIADO',
          detalhe: JSON.stringify({ record }),
        },
      });
    });
  }

  async releaseRmInsert(id: number, revisao: number) {
    await this.prisma.resultado_historico.deleteMany({
      where: { resultado_id: id, revisao, tipo: 'ENVIO_RM_INICIADO' },
    });
  }

  async receipt(
    id: number,
    revision: number,
    rmId: number,
    usuarioId: number,
    record: unknown,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.execucao_funcionario.findUniqueOrThrow({
        where: { execucao_funcionario_id: id },
      });
      if (r.revisao !== revision)
        throw new ConflictException('Resultado alterado durante o envio.');
      await tx.execucao_funcionario.update({
        where: { execucao_funcionario_id: id },
        data: {
          metadados_rm_id: rmId,
          enviado_revisao: revision,
          status: 'ENVIADO_RM',
        },
      });
      await tx.resultado_historico.create({
        data: {
          resultado_id: id,
          execucao_id: r.execucao_id,
          revisao: revision,
          usuario_id: usuarioId,
          tipo: 'ENVIO_RM',
          detalhe: JSON.stringify({
            metadadosRmId: rmId,
            record,
            confirmado: true,
          }),
        },
      });
    });
  }
}
