import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, formula } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';

type Tx = Prisma.TransactionClient;
export type Etapa = 'VARIAVEIS' | 'VALORES' | 'CONFERIR' | 'ENVIAR_RM';
export type PedidoOperacao = {
  etapa: Etapa;
  execucaoIds: number[];
  baseIds?: number[];
  recalcular?: boolean;
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

@Injectable()
export class OperacaoService {
  constructor(private readonly prisma: PrismaService) {}

  private async lock(tx: Tx, ids: number[]) {
    // Todos os comandos de usuário adquirem o mesmo lock, em ordem estável.
    for (const id of [...ids].sort((a, b) => a - b)) {
      const rows = await tx.$queryRaw<Array<{ execucao_id: number }>>(
        Prisma.sql`SELECT execucao_id FROM dbo.execucao WITH (UPDLOCK, HOLDLOCK) WHERE execucao_id = ${id}`,
      );
      if (!rows.length) throw new NotFoundException('Execução não encontrada.');
    }
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
        filial: { select: { nome: true } },
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
            execucao_funcionario_base_id: true,
          },
        },
      },
    });
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
        const situacao = errors
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
                    ? conferidos === total
                      ? 'envio'
                      : 'conferencia'
                    : 'inicio';
        return {
          id: e.execucao_id,
          filialId: e.filial_id,
          filial: e.filial.nome,
          periodoId: e.periodo_id,
          createdAt: e.data_execucao,
          latest,
          total,
          variaveis,
          valores,
          rm,
          conferidos,
          errors,
          processing,
          pending,
          nextRunAt,
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
    if (filter === 'pendencias')
      where.status = {
        in: [
          'ERRO_VARIAVEIS',
          'ERRO_RESULTADOS',
          'RESULTADOS_PARCIAL',
          'ERRO_RM',
        ],
      };
    if (filter === 'conferencia')
      where.status = { in: ['RESULTADOS_PROCESSADOS', 'ERRO_RM'] };
    if (filter === 'enviados') where.status = 'ENVIADO_RM';
    const safePage = Math.max(1, Math.floor(page) || 1);
    const [total, bases, queue] = await Promise.all([
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
              metadados_rm_id: true,
              formula: { select: { nome: true, codEvento: true } },
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
    ]);
    return {
      execucao,
      total,
      page: safePage,
      pageSize: 25,
      bases,
      queue,
      updatedAt: new Date(),
    };
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

  async saveCalculation(id: number, valor: number, formula: formula) {
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
          formula_snapshot: JSON.stringify(formula),
        },
      });
      await tx.resultado_historico.create({
        data: {
          resultado_id: id,
          execucao_id: r.execucao_id,
          revisao: updated.revisao,
          tipo: 'CALCULO',
          detalhe: JSON.stringify({
            formula,
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
          'Ajuste registrado. Confira a nova versão antes de enviar ao RM.',
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
    return {
      etapa: p.etapa,
      execucaoIds: idsValidos(p.execucaoIds),
      ...(p.baseIds ? { baseIds: idsValidos(p.baseIds) } : {}),
      recalcular: p.recalcular === true,
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
          include: { filial: { select: { nome: true } }, periodo: true },
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
    return bases.map((b) => {
      const results = b.execucao_funcionario;
      let reason = b.execucao_queue.length
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
        if (
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
        else if (results.some((r) => r.conferido_revisao !== r.revisao))
          reason = 'Conferência da versão atual pendente';
        else if (
          results.some((r) => {
            const f = r.formula_snapshot
              ? (JSON.parse(r.formula_snapshot) as formula)
              : r.formula;
            return !f.codEvento || !f.tipo;
          })
        )
          reason = 'Evento ou tipo RM não configurado';
      }
      const eventos = results.map((r) => {
        const f = r.formula_snapshot
          ? (JSON.parse(r.formula_snapshot) as formula)
          : r.formula;
        return {
          id: r.execucao_funcionario_id,
          revisao: r.revisao,
          conferencia: r.conferido_revisao,
          regra: fingerprint(f),
          nome: f.nome,
          evento: f.codEvento,
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
            CODEVENTO: f.codEvento,
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
        eventos,
      };
    });
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
          if (p.etapa !== 'ENVIAR_RM') {
            await tx.execucao_funcionario.updateMany({
              where: { execucao_funcionario_base_id: item.baseId },
              data: {
                status: 'PREVIA',
                conferido_revisao: null,
                conferido_por: null,
                conferido_em: null,
              },
            });
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
          data: { status: 'EM_PROCESSAMENTO' },
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

  async approvedEvent(baseId: number, resultId: number, revision: number) {
    const q = await this.prisma.execucao_queue.findFirst({
      where: {
        execucao_funcionario_base_id: baseId,
        tipo: 'ENVIAR_RM',
        status: 'PROCESSANDO',
      },
      orderBy: { queue_id: 'desc' },
    });
    if (!q?.revisao_payload)
      throw new ConflictException('Envio sem revisão. Gere uma nova prévia.');
    const payload = JSON.parse(q.revisao_payload) as {
      usuarioId: number;
      eventos: Array<{
        id: number;
        revisao: number;
        conferencia: number;
        record: Record<string, string | number>;
      }>;
    };
    const event = payload.eventos.find((e) => e.id === resultId);
    if (!event || event.revisao !== revision || event.conferencia !== revision)
      throw new ConflictException(
        'A versão do resultado difere do lote revisado.',
      );
    return { record: event.record, usuarioId: payload.usuarioId };
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
