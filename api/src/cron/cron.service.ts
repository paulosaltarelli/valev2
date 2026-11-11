import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExecucaoService } from 'src/execucao/execucao.service';
import { Prisma } from '@prisma/client';
import { GeoService } from 'src/geo/geo.service';
import { formatQueueErrorLine } from 'src/utils/queueError';
import { randomUUID } from 'node:crypto';
import { pilotBatchSize, pilotQuery, pve2VariableCodes } from 'src/execucao/rm-variable-batch';
import { chunks, sqlServerIds } from 'src/utils/sql-server-ids';

@Injectable()
export class CronService {
  private tickRunning = false;
  private tickRunningGeo = false;
  private tickRunningCreateExecucao = false;
  private readonly lockOwner = `api-${randomUUID()}`;
  private readonly batchSize = 25;
  private readonly geoBatchSize = 49;
  private readonly createExecucaoBatchSize = 1;
  private readonly staleLockMinutes = 1; //tempo em minutos para destravar locks antigos
  private readonly maxAttempts = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly execucaoService: ExecucaoService,
    private readonly geoService: GeoService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS, {
    name: 'check-variables-to-process-execution',
    timeZone: 'America/Sao_Paulo',
  })
  async handleCheckVariablesToProcessExecution() {
    // console.log('handleCheckVariablesToProcessExecution', this.tickRunning);
    if (this.tickRunning) return;
    this.tickRunning = true;
    try {
      // 0) Destrava locks antigos (caso de crash/restart)
      await this.prisma.$executeRaw(
        Prisma.sql`
        DECLARE @staleVariables TABLE (base_id INT, tipo VARCHAR(20), status VARCHAR(20));
        UPDATE q
        SET
          status = CASE WHEN e.controle_fila = 'CANCELADA' THEN 'CANCELADO'
                        WHEN tentativas + 1 >= ${this.maxAttempts} THEN 'ERRO' ELSE 'PENDENTE' END,
          tentativas = tentativas + 1,
          next_run_at = CASE
            WHEN e.controle_fila = 'CANCELADA' OR tentativas + 1 >= ${this.maxAttempts} THEN NULL
            ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
          END,
          last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
            {
              code: 'LOCK_REINICIADO',
              message: 'Lock antigo detectado; item voltou para a fila',
              context: { queue: 'execucao_queue' },
            },
          )},
          lock_owner = NULL,
          locked_at = NULL,
          updated_at = SYSDATETIME()
        OUTPUT inserted.execucao_funcionario_base_id, inserted.tipo, inserted.status INTO @staleVariables
        FROM dbo.execucao_queue q JOIN dbo.execucao e ON e.execucao_id = q.execucao_id
        WHERE q.status = 'PROCESSANDO'
          AND locked_at IS NOT NULL
          AND locked_at < DATEADD(MINUTE, -${this.staleLockMinutes}, SYSDATETIME());

        UPDATE b SET status = 'ERRO_VARIAVEIS'
        FROM dbo.execucao_funcionario_base b
        JOIN @staleVariables expired ON expired.base_id = b.execucao_funcionario_base_id
        WHERE expired.tipo = 'VARIAVEIS' AND expired.status = 'ERRO';

        UPDATE q SET status = 'CANCELADO', next_run_at = NULL, updated_at = SYSDATETIME()
        FROM dbo.execucao_queue q JOIN dbo.execucao e ON e.execucao_id = q.execucao_id
        WHERE q.status = 'PENDENTE' AND e.controle_fila = 'CANCELADA';
        `,
      );

      while (await this.processNextExecutionBatch()) {
        // Cada lote reavalia a fila, incluindo pausas, cancelamentos e backoff.
      }
    } catch (e) {
      console.error('[CronService] tick error', e);
    } finally {
      this.tickRunning = false;
    }
  }

  private async processNextExecutionBatch(): Promise<boolean> {
    const runnable = Prisma.sql`
      q.status = 'PENDENTE'
      AND (q.next_run_at IS NULL OR q.next_run_at <= SYSDATETIME())
      AND EXISTS (SELECT 1 FROM dbo.execucao e WHERE e.execucao_id = q.execucao_id AND e.controle_fila IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM dbo.execucao_queue anterior
        WHERE anterior.execucao_id = q.execucao_id
          AND anterior.execucao_funcionario_base_id = q.execucao_funcionario_base_id
          AND anterior.status IN ('PENDENTE', 'PROCESSANDO')
          AND (
            (q.tipo IN ('VALORES', 'ENVIAR_RM') AND anterior.tipo = 'VARIAVEIS')
            OR (q.tipo = 'ENVIAR_RM' AND anterior.tipo = 'VALORES')
          )
      )
    `;

    // Uma execução em espera de retry cede a vez a outra pronta.
    const execRows = await this.prisma.$queryRaw<
      Array<{ execucao_id: number }>
    >(
      Prisma.sql`
      SELECT TOP 1 q.execucao_id
      FROM dbo.execucao_queue q
      WHERE ${runnable}
      ORDER BY q.created_at ASC, q.queue_id ASC;
      `,
    );
    const execucaoId = execRows?.[0]?.execucao_id;
    if (!execucaoId) return false;

    // 2) Decide qual tipo rodar agora (prioriza VARIAVEIS)
    const tipoRows = await this.prisma.$queryRaw<Array<{ tipo: string; session_id: string | null }>>(
      Prisma.sql`
      SELECT TOP 1 tipo, session_id
      FROM dbo.execucao_queue q
      WHERE q.execucao_id = ${execucaoId}
        AND ${runnable}
      ORDER BY
        CASE
          WHEN tipo = 'VARIAVEIS' THEN 0
          WHEN tipo = 'VALORES' THEN 1
          WHEN tipo = 'ENVIAR_RM' THEN 2
          ELSE 3
        END,
        created_at ASC, queue_id ASC;
      `,
    );
    const tipo = tipoRows?.[0]?.tipo;
    if (!tipo) {
      // nada runnable agora; ainda assim sincroniza status global
      await this.syncExecucaoStatus(execucaoId);
      return false;
    }
    const sessionId = tipoRows[0].session_id;
    const sessionFilter = sessionId === null
      ? Prisma.sql`AND q.session_id IS NULL`
      : Prisma.sql`AND q.session_id = ${sessionId}`;
    const pilotSize = tipo === 'VARIAVEIS' ? pilotBatchSize() : 0;

    // 3) Claim (lock) de um batch de itens para esta execução/tipo
    const claimed = await this.prisma.$transaction(async (tx) => {
      const [{ controle_fila }] = await tx.$queryRaw<Array<{ controle_fila: string | null }>>(
        Prisma.sql`SELECT controle_fila FROM dbo.execucao WITH (UPDLOCK, HOLDLOCK) WHERE execucao_id = ${execucaoId}`,
      );
      if (controle_fila) return [];
      const sqlCodes = tipo === 'VARIAVEIS' || tipo === 'VALORES' ? await tx.variavel.findMany({
        where: { ativa: true, filial: { execucao: { some: { execucao_id: execucaoId } } },
          sql_codigo_rm: { in: pilotSize ? [...pve2VariableCodes, pilotQuery] : pve2VariableCodes } },
        select: { sql_codigo_rm: true },
      }) : [];
      const hasPve2 = sqlCodes.some((v) => v.sql_codigo_rm?.startsWith('PVE2.'));
      const claimLimit = hasPve2 ? Prisma.empty : Prisma.sql`TOP (${sqlCodes.length ? pilotSize : this.batchSize})`;
      const claimOrder = hasPve2 ? Prisma.empty : Prisma.sql`ORDER BY q.created_at, q.queue_id`;
      const rows = await tx.$queryRaw<
      Array<{
        queue_id: number;
        execucao_funcionario_base_id: number;
        session_id: string | null;
        revisao_payload: string | null;
      }>
    >(
      Prisma.sql`
      ;WITH ready AS (
        SELECT ${claimLimit} q.queue_id
        FROM dbo.execucao_queue q
        WHERE q.execucao_id = ${execucaoId} AND q.tipo = ${tipo}
          AND ${runnable} ${sessionFilter}
        ${claimOrder}
      )
      UPDATE q
      SET
        status = 'PROCESSANDO',
        lock_owner = ${this.lockOwner},
        locked_at = SYSDATETIME(),
        updated_at = SYSDATETIME()
      OUTPUT inserted.queue_id, inserted.execucao_funcionario_base_id, inserted.session_id, inserted.revisao_payload
      FROM dbo.execucao_queue q
      JOIN ready ON ready.queue_id = q.queue_id;
      `,
    );
      if (tipo !== 'ENVIAR_RM') {
        const baseIds = rows.filter((row) => row.revisao_payload).map((row) => row.execucao_funcionario_base_id);
        for (const ids of chunks(baseIds, 500)) {
          await tx.execucao_funcionario.updateMany({
            where: { execucao_funcionario_base_id: { in: ids } },
            data: { status: 'PREVIA', conferido_revisao: null, conferido_por: null, conferido_em: null },
          });
        }
      }
      return rows;
    }, { timeout: 30_000 });

    if (!claimed || claimed.length === 0) {
      await this.syncExecucaoStatus(execucaoId);
      return false;
    }

    const baseIds = claimed.map((c) => c.execucao_funcionario_base_id);
    const queueIds = claimed.map((item) => item.queue_id);
    const claimedIdsSql = sqlServerIds(queueIds);

    if ((tipo === 'VARIAVEIS' || tipo === 'ENVIAR_RM') && !sessionId) {
      // Sem session_id não dá pra chamar o RM; devolve itens para pendente com backoff.
      await this.prisma.$executeRaw(
        Prisma.sql`
        UPDATE dbo.execucao_queue
        SET
          status = CASE WHEN tentativas + 1 >= ${this.maxAttempts} THEN 'ERRO' ELSE 'PENDENTE' END,
          tentativas = tentativas + 1,
          next_run_at = CASE
            WHEN tentativas + 1 >= ${this.maxAttempts} THEN NULL
            ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
          END,
          last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
            {
              code: 'SESSION_ID_AUSENTE',
              message: 'Não foi possível processar sem sessionId do RM',
              context: { execucaoId, tipo },
            },
          )},
          lock_owner = NULL,
          locked_at = NULL,
          updated_at = SYSDATETIME()
        WHERE execucao_id = ${execucaoId}
          AND tipo = ${tipo}
          AND status = 'PROCESSANDO'
          AND lock_owner = ${this.lockOwner}
          AND queue_id IN (${claimedIdsSql});
        `,
      );
      await this.syncExecucaoStatus(execucaoId);
      return true;
    }

    const rows = (await Promise.all([...chunks(baseIds, 500)].map((ids) =>
      this.prisma.execucao_funcionario_base.findMany({
        where: { execucao_funcionario_base_id: { in: ids } },
      }),
    ))).flat();

    const errosSemRetry = new Set<number>();
    let failedCall = false;
    let retryNotBefore = 0;
    // 4) Processa (usa seus métodos batch existentes)
    const heartbeat = tipo === 'VARIAVEIS' || tipo === 'VALORES'
      ? setInterval(() => {
        void this.prisma.$executeRaw`UPDATE dbo.execucao_queue SET locked_at = SYSDATETIME()
          WHERE queue_id IN (${claimedIdsSql}) AND lock_owner = ${this.lockOwner}
            AND status = 'PROCESSANDO'`
          .catch((error) => console.error('[CronService] heartbeat do cálculo', error));
      }, 20_000) : undefined;
    try {
      if (tipo === 'VARIAVEIS') {
        const resultado = await this.execucaoService.processarVariaveisBatch(
          execucaoId, rows, sessionId!, { owner: this.lockOwner, queueIds, batchSize: pilotSize },
        );
        failedCall = !resultado.status;
        retryNotBefore = resultado.retryNotBefore ?? 0;
        if (failedCall) {
          await this.prisma.$executeRaw`UPDATE b SET status = 'ERRO_VARIAVEIS'
            FROM dbo.execucao_funcionario_base b
            JOIN dbo.execucao_queue q ON q.execucao_funcionario_base_id = b.execucao_funcionario_base_id
            WHERE q.queue_id IN (${claimedIdsSql}) AND q.lock_owner = ${this.lockOwner}
              AND q.status = 'PROCESSANDO'`;
        }
        for (const id of resultado.falhasSemRetryIds ?? []) errosSemRetry.add(id);
      } else if (tipo === 'VALORES') {
        const aptos = rows.filter((row) => {
          if (row.status !== 'ERRO_VARIAVEIS') return true;
          errosSemRetry.add(row.execucao_funcionario_base_id);
          return false;
        });
        if (aptos.length) {
          const resultado = await this.execucaoService.processarValoresBatch(execucaoId, aptos, sessionId!);
          failedCall = !resultado.status;
          for (const id of resultado.falhasFormulaIds ?? []) errosSemRetry.add(id);
        }
      } else if (tipo === 'ENVIAR_RM') {
        await this.execucaoService.processarEnviarRmBatch(execucaoId, rows, sessionId!);
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }

    // 5) Marca cada item como CONCLUIDO/ERRO baseado no status do funcionario_base
    const refreshed = (await Promise.all([...chunks(baseIds, 500)].map((ids) =>
      this.prisma.execucao_funcionario_base.findMany({
        where: { execucao_funcionario_base_id: { in: ids } },
        select: { execucao_funcionario_base_id: true, status: true },
      }),
    ))).flat();

    const okIds: number[] = [];
    const errIds: number[] = [];
    for (const r of refreshed) {
      if (errosSemRetry.has(r.execucao_funcionario_base_id)) {
        errIds.push(r.execucao_funcionario_base_id);
      } else if (tipo === 'VARIAVEIS') {
        if (failedCall) {
          errIds.push(r.execucao_funcionario_base_id);
        } else if (r.status === 'VARIAVEIS_PROCESSADAS') {
          okIds.push(r.execucao_funcionario_base_id);
        } else if (r.status === 'ERRO_VARIAVEIS') {
          errIds.push(r.execucao_funcionario_base_id);
        }
      } else if (tipo === 'VALORES') {
        if (r.status === 'RESULTADOS_PROCESSADOS') {
          okIds.push(r.execucao_funcionario_base_id);
        } else if (failedCall || r.status === 'ERRO_RESULTADOS') {
          errIds.push(r.execucao_funcionario_base_id);
        }
      } else if (tipo === 'ENVIAR_RM') {
        if (r.status === 'ENVIADO_RM') {
          okIds.push(r.execucao_funcionario_base_id);
        } else if (r.status === 'ERRO_RM') {
          errIds.push(r.execucao_funcionario_base_id);
        }
      }
    }

    if (okIds.length > 0) {
      await this.prisma.$executeRaw(
        Prisma.sql`
        UPDATE dbo.execucao_queue
        SET
          status = 'CONCLUIDO',
          lock_owner = NULL,
          locked_at = NULL,
          updated_at = SYSDATETIME()
        WHERE execucao_id = ${execucaoId}
          AND tipo = ${tipo}
          AND status = 'PROCESSANDO'
          AND lock_owner = ${this.lockOwner}
          AND queue_id IN (${claimedIdsSql})
          AND execucao_funcionario_base_id IN (${sqlServerIds(okIds)});
        `,
      );
    }

    if (errIds.length > 0) {
      const terminal = Prisma.sql`execucao_funcionario_base_id IN (${sqlServerIds(errosSemRetry)}) OR tentativas + 1 >= ${this.maxAttempts}`;
      const retrySeconds = Math.min(2_147_483_647, Math.max(0, Math.ceil((retryNotBefore - Date.now()) / 1000)));
      await this.prisma.$executeRaw(
        Prisma.sql`
        UPDATE q
        SET
          status = CASE WHEN e.controle_fila = 'CANCELADA' THEN 'CANCELADO'
                        WHEN ${terminal} THEN 'ERRO' ELSE 'PENDENTE' END,
          tentativas = tentativas + 1,
          next_run_at = CASE
            WHEN e.controle_fila = 'CANCELADA' OR ${terminal} THEN NULL
            WHEN ${retrySeconds} > 300 * (tentativas + 1)
              THEN DATEADD(SECOND, ${retrySeconds}, SYSDATETIME())
            ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
          END,
          last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
            {
              code: 'ERRO_WORKER',
              message:
                'O processamento falhou para este item; verifique logs e tente reprocessar',
              context: { execucaoId, tipo },
            },
          )},
          lock_owner = NULL,
          locked_at = NULL,
          updated_at = SYSDATETIME()
        FROM dbo.execucao_queue q JOIN dbo.execucao e ON e.execucao_id = q.execucao_id
        WHERE q.execucao_id = ${execucaoId}
          AND tipo = ${tipo}
          AND q.status = 'PROCESSANDO'
          AND lock_owner = ${this.lockOwner}
          AND queue_id IN (${claimedIdsSql})
          AND execucao_funcionario_base_id IN (${sqlServerIds(errIds)});
        `,
      );
    }

    await this.syncExecucaoStatus(execucaoId);
    return true;
  }

  @Cron(CronExpression.EVERY_10_SECONDS, {
    name: 'check-geo-to-process',
    timeZone: 'America/Sao_Paulo',
  })
  async handleCheckGeoToProcess() {
    // console.log('handleCheckGeoToProcess', this.tickRunningGeo);
    if (this.tickRunningGeo) return;
    this.tickRunningGeo = true;
    try {
      // 0) Destrava locks antigos (caso de crash/restart)
      await this.prisma.$executeRaw(
        Prisma.sql`
        UPDATE dbo.geo_queue
        SET
          status = CASE WHEN tentativas + 1 >= ${this.maxAttempts} THEN 'ERRO' ELSE 'PENDENTE' END,
          tentativas = tentativas + 1,
          next_run_at = CASE
            WHEN tentativas + 1 >= ${this.maxAttempts} THEN NULL
            ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
          END,
          last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
            {
              code: 'LOCK_REINICIADO',
              message: 'Lock antigo detectado; item voltou para a fila',
              context: { queue: 'geo_queue' },
            },
          )},
          lock_owner = NULL,
          locked_at = NULL,
          updated_at = SYSDATETIME()
        WHERE status = 'PROCESSANDO'
          AND locked_at IS NOT NULL
          AND locked_at < DATEADD(MINUTE, -${this.staleLockMinutes}, SYSDATETIME());
        `,
      );

      // 1) Seleciona uma filial por vez que tenha itens pendentes/runnable
      const filialRows = await this.prisma.$queryRaw<
        Array<{ filial_id: number }>
      >(
        Prisma.sql`
        SELECT TOP 1 filial_id
        FROM dbo.geo_queue
        WHERE status = 'PENDENTE'
          AND (next_run_at IS NULL OR next_run_at <= SYSDATETIME())
        ORDER BY created_at ASC;
        `,
      );
      const filialId = filialRows?.[0]?.filial_id;
      if (!filialId) return;

      // 2) Claim (lock) de um batch de itens para esta filial
      const claimed = await this.prisma.$queryRaw<
        Array<{
          geo_queue_id: number;
          chapa: string;
          codcoligada: number | null;
          codfilial: number | null;
          session_id: string | null;
        }>
      >(
        Prisma.sql`
        UPDATE TOP (${Prisma.raw(String(this.geoBatchSize))}) q
        SET
          status = 'PROCESSANDO',
          lock_owner = ${this.lockOwner},
          locked_at = SYSDATETIME(),
          updated_at = SYSDATETIME()
        OUTPUT inserted.geo_queue_id, inserted.chapa, inserted.codcoligada, inserted.codfilial, inserted.session_id
        FROM dbo.geo_queue q
        WHERE q.filial_id = ${filialId}
          AND q.status = 'PENDENTE'
          AND (q.next_run_at IS NULL OR q.next_run_at <= SYSDATETIME());
        `,
      );

      if (!claimed || claimed.length === 0) return;

      // 3) Agrupa por session_id (cada session pode ter credenciais diferentes)
      const bySession = new Map<
        string | null,
        Array<{
          geo_queue_id: number;
          chapa: string;
          codcoligada: number | null;
          codfilial: number | null;
        }>
      >();
      for (const c of claimed) {
        const key = c.session_id ?? null;
        const list = bySession.get(key) ?? [];
        list.push({
          geo_queue_id: c.geo_queue_id,
          chapa: c.chapa,
          codcoligada: c.codcoligada ?? null,
          codfilial: c.codfilial ?? null,
        });
        bySession.set(key, list);
      }

      // 3a) Itens sem session_id: devolve com backoff
      const missingSession = bySession.get(null) ?? [];
      if (missingSession.length > 0) {
        const ids = missingSession.map((i) => i.geo_queue_id);
        await this.prisma.$executeRaw(
          Prisma.sql`
          UPDATE dbo.geo_queue
          SET
            status = CASE WHEN tentativas + 1 >= ${this.maxAttempts} THEN 'ERRO' ELSE 'PENDENTE' END,
            tentativas = tentativas + 1,
            next_run_at = CASE
              WHEN tentativas + 1 >= ${this.maxAttempts} THEN NULL
              ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
            END,
            last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
              {
                code: 'SESSION_ID_AUSENTE',
                message: 'Não foi possível processar sem sessionId do RM',
                context: { filialId },
              },
            )},
            lock_owner = NULL,
            locked_at = NULL,
            updated_at = SYSDATETIME()
          WHERE geo_queue_id IN (${Prisma.join(ids)})
            AND status = 'PROCESSANDO'
            AND lock_owner = ${this.lockOwner};
          `,
        );
      }

      // 4) Processa por sessionId
      for (const [sessionId, items] of bySession.entries()) {
        if (!sessionId) continue;

        let result:
          | {
              okIds: number[];
              err: Array<{ geo_queue_id: number; error: string }>;
            }
          | undefined;
        try {
          result = await this.geoService.processarGeoKmBatch({
            filialId,
            sessionId,
            items,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result = {
            okIds: [],
            err: items.map((i) => ({
              geo_queue_id: i.geo_queue_id,
              error: msg,
            })),
          };
        }

        const okIds = result.okIds ?? [];
        const err = result.err ?? [];

        if (okIds.length > 0) {
          await this.prisma.$executeRaw(
            Prisma.sql`
            UPDATE dbo.geo_queue
            SET
              status = 'CONCLUIDO',
              lock_owner = NULL,
              locked_at = NULL,
              updated_at = SYSDATETIME()
            WHERE geo_queue_id IN (${Prisma.join(okIds)})
              AND status = 'PROCESSANDO'
              AND lock_owner = ${this.lockOwner};
            `,
          );
        }

        // Atualiza erros item-a-item para registrar mensagem detalhada
        for (const e of err) {
          await this.prisma.$executeRaw(
            Prisma.sql`
            UPDATE dbo.geo_queue
            SET
              status = CASE WHEN tentativas + 1 >= ${this.maxAttempts} THEN 'ERRO' ELSE 'PENDENTE' END,
              tentativas = tentativas + 1,
              next_run_at = CASE
                WHEN tentativas + 1 >= ${this.maxAttempts} THEN NULL
                ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
              END,
              last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
                {
                  code: 'ERRO_GEO',
                  message: String(e.error ?? 'Erro ao processar GEO'),
                  context: { filialId, geoQueueId: e.geo_queue_id },
                },
              )},
              lock_owner = NULL,
              locked_at = NULL,
              updated_at = SYSDATETIME()
            WHERE geo_queue_id = ${e.geo_queue_id}
              AND status = 'PROCESSANDO'
              AND lock_owner = ${this.lockOwner};
            `,
          );
        }
      }
    } catch (e) {
      console.error('[CronService] geo tick error', e);
    } finally {
      this.tickRunningGeo = false;
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS, {
    name: 'check-create-execucao-to-process',
    timeZone: 'America/Sao_Paulo',
  })
  async handleCheckCreateExecucaoToProcess() {
    if (this.tickRunningCreateExecucao) return;
    this.tickRunningCreateExecucao = true;
    try {
      // 0) Destrava locks antigos (caso de crash/restart)
      await this.prisma.$executeRaw(
        Prisma.sql`
        UPDATE dbo.execucao_create_queue
        SET
          status = CASE WHEN tentativas + 1 >= ${this.maxAttempts} THEN 'ERRO' ELSE 'PENDENTE' END,
          tentativas = tentativas + 1,
          next_run_at = CASE
            WHEN tentativas + 1 >= ${this.maxAttempts} THEN NULL
            ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
          END,
          last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
            {
              code: 'LOCK_REINICIADO',
              message: 'Lock antigo detectado; item voltou para a fila',
              context: { queue: 'execucao_create_queue' },
            },
          )},
          lock_owner = NULL,
          locked_at = NULL,
          updated_at = SYSDATETIME()
        WHERE status = 'PROCESSANDO'
          AND locked_at IS NOT NULL
          AND locked_at < DATEADD(MINUTE, -${this.staleLockMinutes}, SYSDATETIME());
        `,
      );

      // 1) Claim de um batch pequeno (criar execução é pesado)
      const claimed = await this.prisma.$queryRaw<
        Array<{
          queue_id: number;
          filial_id: number;
          periodo_id: number;
          usuario_execucao: number;
          session_id: string | null;
          processar_variaveis_valores: boolean | null;
        }>
      >(
        Prisma.sql`
        UPDATE TOP (${Prisma.raw(String(this.createExecucaoBatchSize))}) q
        SET
          status = 'PROCESSANDO',
          lock_owner = ${this.lockOwner},
          locked_at = SYSDATETIME(),
          updated_at = SYSDATETIME()
        OUTPUT
          inserted.queue_id,
          inserted.filial_id,
          inserted.periodo_id,
          inserted.usuario_execucao,
          inserted.session_id,
          inserted.processar_variaveis_valores
        FROM dbo.execucao_create_queue q
        WHERE q.status = 'PENDENTE'
          AND (q.next_run_at IS NULL OR q.next_run_at <= SYSDATETIME());
        `,
      );

      if (!claimed || claimed.length === 0) return;

      for (const item of claimed) {
        if (!item.session_id) {
          await this.prisma.$executeRaw(
            Prisma.sql`
            UPDATE dbo.execucao_create_queue
            SET
              status = CASE WHEN tentativas + 1 >= ${this.maxAttempts} THEN 'ERRO' ELSE 'PENDENTE' END,
              tentativas = tentativas + 1,
              next_run_at = CASE
                WHEN tentativas + 1 >= ${this.maxAttempts} THEN NULL
                ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
              END,
              last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
                {
                  code: 'SESSION_ID_AUSENTE',
                  message: 'Não foi possível processar sem sessionId do RM',
                  context: {
                    queueId: item.queue_id,
                    filialId: item.filial_id,
                    periodoId: item.periodo_id,
                  },
                },
              )},
              lock_owner = NULL,
              locked_at = NULL,
              updated_at = SYSDATETIME()
            WHERE queue_id = ${item.queue_id}
              AND status = 'PROCESSANDO'
              AND lock_owner = ${this.lockOwner};
            `,
          );
          continue;
        }

        let result:
          | { status: boolean; message: string; data?: unknown }
          | undefined;
        try {
          result = await this.execucaoService.createExecucao(
            item.filial_id,
            { periodo_id: item.periodo_id },
            item.usuario_execucao,
            item.session_id,
            { queueId: item.queue_id, owner: this.lockOwner, autoProcessar: Boolean(item.processar_variaveis_valores) },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result = { status: false, message: msg };
        }

        if (!result?.status) {
          const errorMsg = result?.message ?? 'worker_error';
          const isNonRetryable =
            errorMsg.includes('Nenhum funcionário retornado pelo SQL RM') ||
            errorMsg.includes('SQL codigo RM not found') ||
            errorMsg.includes('Formula not found');
          await this.prisma.$executeRaw(
            Prisma.sql`
            UPDATE dbo.execucao_create_queue
            SET
              status = ${
                isNonRetryable
                  ? Prisma.sql`'ERRO'`
                  : Prisma.sql`CASE WHEN tentativas + 1 >= ${this.maxAttempts} THEN 'ERRO' ELSE 'PENDENTE' END`
              },
              tentativas = tentativas + 1,
              next_run_at = CASE
                WHEN ${
                  isNonRetryable
                    ? Prisma.sql`1=1`
                    : Prisma.sql`tentativas + 1 >= ${this.maxAttempts}`
                } THEN NULL
                ELSE DATEADD(MINUTE, 5 * (tentativas + 1), SYSDATETIME())
              END,
              last_error = COALESCE(last_error, '') + '\n' + ${formatQueueErrorLine(
                {
                  code: 'ERRO_CRIACAO_EXECUCAO',
                  message: String(errorMsg),
                  context: {
                    queueId: item.queue_id,
                    filialId: item.filial_id,
                    periodoId: item.periodo_id,
                  },
                },
              )},
              lock_owner = NULL,
              locked_at = NULL,
              updated_at = SYSDATETIME()
            WHERE queue_id = ${item.queue_id}
              AND status = 'PROCESSANDO'
              AND lock_owner = ${this.lockOwner};
            `,
          );
        }
      }
    } catch (e) {
      console.error('[CronService] create-execucao tick error', e);
    } finally {
      this.tickRunningCreateExecucao = false;
    }
  }

  private async syncExecucaoStatus(execucaoId: number) {
    await this.prisma.$executeRaw`
      UPDATE q SET status = 'CANCELADO', next_run_at = NULL, updated_at = SYSDATETIME()
      FROM dbo.execucao_queue q JOIN dbo.execucao e ON e.execucao_id = q.execucao_id
      WHERE q.execucao_id = ${execucaoId} AND q.status = 'PENDENTE' AND e.controle_fila = 'CANCELADA'
    `;
    const pendingCount = await this.prisma.$queryRaw<Array<{ cnt: number }>>(
      Prisma.sql`
      SELECT COUNT(1) as cnt
      FROM dbo.execucao_queue
      WHERE execucao_id = ${execucaoId}
        AND status IN ('PENDENTE','PROCESSANDO');
      `,
    );

    const hasPending = Number(pendingCount?.[0]?.cnt ?? 0) > 0;
    if (hasPending) {
      await this.prisma.execucao.update({
        where: { execucao_id: execucaoId },
        data: { status: 'EM_PROCESSAMENTO' },
      });
      return;
    }

    const notEnviado = await this.prisma.execucao_funcionario_base.count({
      where: {
        execucao_id: execucaoId,
        status: { not: 'ENVIADO_RM' },
      },
    });
    const totalBases = await this.prisma.execucao_funcionario_base.count({
      where: { execucao_id: execucaoId },
    });

    await this.prisma.execucao.update({
      where: { execucao_id: execucaoId },
      data:
        totalBases > 0 && notEnviado === 0
          ? { status: 'FINALIZADA' }
          : { status: 'AGUARDANDO' },
    });
  }
}
