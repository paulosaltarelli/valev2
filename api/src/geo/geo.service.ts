import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { FuncionarioRm } from 'src/models/FuncionarioRmModel';
import { PrismaService } from 'src/prisma/prisma.service';
import { RmService } from 'src/rm/rm.service';
import { Prisma } from '@prisma/client';
import { LimitedExecutor } from '../utils/limited-executor';
import { stripKeysDeepInPlace } from 'src/utils/rmPayload';

type RouteMatrixWaypoint = { waypoint: { address: string } };

type RouteMatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  status?: string;
};

type GoogleErrorResponse = {
  error?: {
    message?: string;
  };
};

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly googleUrl = process.env.GOOGLE_MAPS_API_URL ?? '';
  private readonly CHUNK_SIZE = 49; // Limite seguro para a API do Google

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly rmService: RmService,
  ) {}

  async calcularFuncionarioBatchAllFilial(
    filialId: number,
    sessionId: string,
  ): Promise<{ status: boolean; message: string; data?: FuncionarioRm[] }> {
    try {
      const filial = await this.prisma.filial.findUnique({
        where: { filial_id: filialId },
      });
      if (!filial) {
        return { status: false, message: 'Filial não encontrada.' };
      }

      const codSentenca = filial.sql_codigo_rm; // SQL codigo RM da filial que traz os funcionarios
      const resultado = await this.rmService.realizaConsultaSql(
        codSentenca,
        {
          CODCOLIGADA: filial.codcoligada,
          CODFILIAL: filial.codfilial,
        },
        sessionId,
      );
      if (!resultado.status) {
        return { status: false, message: resultado.message };
      }

      const funcionarios = resultado.data as FuncionarioRm[];
      return await this.calcularFuncionarioBatch(funcionarios);
    } catch (error) {
      this.logger.error(error);
      return {
        status: false,
        message: `Erro: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async calcularFuncionarioBatch(
    funcionarios: FuncionarioRm[],
  ): Promise<{ status: boolean; message: string; data?: FuncionarioRm[] }> {
    try {
      if (!funcionarios || funcionarios.length === 0) {
        return { status: false, message: 'Nenhum funcionário para processar.' };
      }

      this.logger.log(
        `Iniciando processamento de ${funcionarios.length} funcionários em lotes.`,
      );

      // Dividimos a lista original em pedaços de 500
      for (let i = 0; i < funcionarios.length; i += this.CHUNK_SIZE) {
        const chunk = funcionarios.slice(i, i + this.CHUNK_SIZE);
        this.logger.log(`Processando lote: ${i} até ${i + chunk.length}`);

        await this.processarLote(chunk);
      }

      return {
        status: true,
        message: `KM atualizado para ${funcionarios.length} funcionários.`,
        data: funcionarios,
      };
    } catch (error) {
      this.logger.error(
        `Erro crítico no processamento batch: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        status: false,
        message: `Erro: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Processa um pedaço (chunk) específico de funcionários
   */
  private async processarLote(chunk: FuncionarioRm[]): Promise<void> {
    // 1. Prepara origens (funcionários do lote) e destino (filial)
    const origins = chunk.map((f) => ({
      waypoint: { address: this.formatEnderecoFuncionario(f) },
    }));

    // Assume-se que a filial no primeiro registro do chunk é a correta
    const destination = {
      waypoint: { address: this.formatEnderecoFilial(chunk[0]) },
    };

    // 2. Chama a API
    const resultados = await this.callRoutesMatrixApi(origins, [destination]);

    // 3. Mapeia os resultados de volta para o objeto original do chunk
    // O originIndex da resposta do Google refere-se à posição NO ARRAY ENVIADO (0 a 499)
    resultados.forEach((res) => {
      const indexNoChunk = res.originIndex ?? 0;
      if (
        Number.isInteger(indexNoChunk) &&
        indexNoChunk >= 0 &&
        indexNoChunk < chunk.length
      ) {
        const metros = res.distanceMeters ?? 0;
        const km = (metros / 1000).toFixed(2);
        chunk[indexNoChunk].KM = `${km}`;
      }
    });
  }

  // --- MÉTODOS DE APOIO ---

  private async callRoutesMatrixApi(
    origins: RouteMatrixWaypoint[],
    destinations: RouteMatrixWaypoint[],
  ): Promise<RouteMatrixElement[]> {
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'originIndex,distanceMeters,status',
    };

    const body = {
      origins,
      destinations,
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    };

    try {
      const { data } = await firstValueFrom(
        this.http.post<RouteMatrixElement[]>(this.googleUrl, body, { headers }),
      );
      return data;
    } catch (e) {
      const message = isAxiosError<GoogleErrorResponse>(e)
        ? (e.response?.data?.error?.message ?? e.message)
        : e instanceof Error
          ? e.message
          : String(e);

      this.logger.error(`Erro na chamada ao Google: ${message}`);
      return []; // Retorna vazio para não quebrar o loop, mas loga o erro
    }
  }

  private formatEnderecoFuncionario(f: FuncionarioRm): string {
    return `${f.RUA_FUNC}, ${f.NUMERO_FUNC} - ${f.BAIRRO_FUNC}, ${f.CIDADE_FUNC} - ${f.ESTADO_FUNC}, ${f.CEP_FUNC}, Brasil`;
  }

  private formatEnderecoFilial(f: FuncionarioRm): string {
    return `${f.RUA_FILIAL}, ${f.NUMERO_FILIAL} - ${f.BAIRRO_FILIAL}, ${f.CIDADE_FILIAL} - ${f.ESTADO_FILIAL}, ${f.CEP_FILIAL}, Brasil`;
  }

  // ---------------------------------------------------------------------------
  // Queue GEO (processamento em segundo plano)
  // ---------------------------------------------------------------------------

  async enqueueGeoKm(params: {
    filialId: number;
    sessionId: string;
    items: Array<{
      chapa: string;
      codcoligada?: number | null;
      codfilial?: number | null;
    }>;
  }): Promise<number> {
    const filialId = Number(params.filialId);
    const sessionId = params.sessionId;
    const items = Array.isArray(params.items) ? params.items : [];

    const unique = Array.from(
      new Map(
        items
          .map((i) => ({
            chapa: typeof i?.chapa === 'string' ? i.chapa.trim() : '',
            codcoligada:
              typeof i?.codcoligada === 'number' &&
              Number.isFinite(i.codcoligada)
                ? i.codcoligada
                : null,
            codfilial:
              typeof i?.codfilial === 'number' && Number.isFinite(i.codfilial)
                ? i.codfilial
                : null,
          }))
          .filter((x) => Boolean(x.chapa))
          .map((x) => [
            `${x.chapa}|${x.codcoligada ?? ''}|${x.codfilial ?? ''}`,
            x,
          ]),
      ).values(),
    );

    if (unique.length === 0) return 0;

    const rows = unique.map(
      (x) =>
        Prisma.sql`(${filialId}, ${x.chapa}, ${x.codcoligada}, ${x.codfilial}, 'PENDENTE', ${sessionId})`,
    );

    await this.prisma.$executeRaw(
      Prisma.sql`
      INSERT INTO dbo.geo_queue (filial_id, chapa, codcoligada, codfilial, status, session_id)
      VALUES ${Prisma.join(rows)};
    `,
    );

    return unique.length;
  }

  async getGeoQueueStatusByFilialId(filialId: number): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        pending: number;
        processing: number;
        next_run_at: Date | null;
      }>
    >(
      Prisma.sql`
      SELECT
        SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'PROCESSANDO' THEN 1 ELSE 0 END) as processing,
        MIN(next_run_at) as next_run_at
      FROM dbo.geo_queue
      WHERE filial_id = ${filialId}
        AND status IN ('PENDENTE','PROCESSANDO');
    `,
    );

    const pending = Number(rows?.[0]?.pending ?? 0);
    const processing = Number(rows?.[0]?.processing ?? 0);
    const nextRunAt = rows?.[0]?.next_run_at
      ? rows[0].next_run_at.toISOString()
      : null;

    return {
      hasRunning: pending + processing > 0,
      pending,
      processing,
      nextRunAt,
    };
  }

  async getGeoQueueErrorsByFilialId(
    filialId: number,
    limit: number = 1000,
  ): Promise<
    Array<{
      geoQueueId: number;
      chapa: string;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastError: string;
    }>
  > {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 1000;
    const rows = await this.prisma.$queryRaw<
      Array<{
        geo_queue_id: number;
        chapa: string;
        status: string;
        tentativas: number;
        next_run_at: Date | null;
        locked_at: Date | null;
        created_at: Date;
        updated_at: Date;
        last_error: string | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP (${Prisma.raw(String(safeLimit))})
        geo_queue_id,
        chapa,
        status,
        tentativas,
        next_run_at,
        locked_at,
        created_at,
        updated_at,
        last_error
      FROM dbo.geo_queue
      WHERE filial_id = ${filialId}
        AND last_error IS NOT NULL
      ORDER BY updated_at DESC;
    `,
    );

    return (rows ?? []).map((r) => ({
      geoQueueId: r.geo_queue_id,
      chapa: r.chapa,
      status: r.status,
      tentativas: r.tentativas,
      nextRunAt: r.next_run_at ? r.next_run_at.toISOString() : null,
      lockedAt: r.locked_at ? r.locked_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      lastError: String(r.last_error ?? '').trim(),
    }));
  }

  /**
   * Processa um batch de chapas (já "claimed" pela fila) e atualiza no RM o `PFCOMPL.KM`.
   * Retorna ok/erro por item, para o worker atualizar a fila.
   */
  async processarGeoKmBatch(params: {
    filialId: number;
    sessionId: string;
    items: Array<{
      geo_queue_id: number;
      chapa: string;
      codcoligada: number | null;
      codfilial: number | null;
    }>;
  }): Promise<{
    okIds: number[];
    err: Array<{ geo_queue_id: number; error: string }>;
  }> {
    this.logger.log(
      `Processando batch de ${params.items.length} chapas para a filial ${params.filialId}`,
    );
    const okIds: number[] = [];
    const err: Array<{ geo_queue_id: number; error: string }> = [];

    const filial = await this.prisma.filial.findUnique({
      where: { filial_id: params.filialId },
    });
    if (!filial) {
      this.logger.error(`Filial ${params.filialId} não encontrada`);
      return {
        okIds,
        err: params.items.map((i) => ({
          geo_queue_id: i.geo_queue_id,
          error: 'Filial não encontrada',
        })),
      };
    }

    const fallbackCodcoligada = filial.codcoligada;
    const fallbackCodfilial = filial.codfilial;

    const normalizeItem = (item: {
      geo_queue_id: number;
      chapa: string;
      codcoligada: number | null;
      codfilial: number | null;
    }): {
      geo_queue_id: number;
      chapa: string;
      codcoligada: number;
      codfilial: number;
    } | null => {
      const chapa = typeof item?.chapa === 'string' ? item.chapa.trim() : '';
      const codcoligada =
        typeof item?.codcoligada === 'number' &&
        Number.isFinite(item.codcoligada)
          ? item.codcoligada
          : fallbackCodcoligada;
      const codfilial =
        typeof item?.codfilial === 'number' && Number.isFinite(item.codfilial)
          ? item.codfilial
          : fallbackCodfilial;

      if (!chapa) {
        err.push({
          geo_queue_id: item.geo_queue_id,
          error: 'CHAPA não informada',
        });
        return null;
      }
      if (
        typeof codcoligada !== 'number' ||
        !Number.isFinite(codcoligada) ||
        typeof codfilial !== 'number' ||
        !Number.isFinite(codfilial)
      ) {
        err.push({
          geo_queue_id: item.geo_queue_id,
          error: 'CODCOLIGADA/CODFILIAL não encontrados para este funcionário',
        });
        return null;
      }
      return {
        geo_queue_id: item.geo_queue_id,
        chapa,
        codcoligada,
        codfilial,
      };
    };

    const grouped = new Map<
      string,
      Array<{
        geo_queue_id: number;
        chapa: string;
        codcoligada: number;
        codfilial: number;
      }>
    >();
    for (const raw of params.items) {
      const n = normalizeItem(raw);
      if (!n) continue;
      const key = `${n.codcoligada}|${n.codfilial}`;
      const list = grouped.get(key) ?? [];
      list.push(n);
      grouped.set(key, list);
    }

    const destinationAddressCache = new Map<string, string>();
    const ensureDestinationAddress = async (key: string): Promise<string> => {
      const cached = destinationAddressCache.get(key);
      if (cached) return cached;

      const [codcoligadaStr, codfilialStr] = key.split('|');
      const codcoligada = Number(codcoligadaStr);
      const codfilial = Number(codfilialStr);
      const filialRmResponse = await this.rmService.getFilialData(
        codcoligada,
        codfilial,
        params.sessionId,
      );
      if (!filialRmResponse.status) {
        throw new Error(filialRmResponse.message);
      }

      const filialRm = filialRmResponse.data;
      const destinationAddress = this.formatEnderecoParts({
        rua: filialRm.RUA,
        numero: filialRm.NUMERO,
        bairro: filialRm.BAIRRO,
        cidade: filialRm.CIDADE,
        estado: filialRm.ESTADO,
        cep: filialRm.CEP,
        pais: filialRm.PAIS,
      });
      destinationAddressCache.set(key, destinationAddress);
      return destinationAddress;
    };

    // 1) Busca payload completo do RM + calcula KM por destino (codcoligada/codfilial)
    const kmById = new Map<number, string>();
    const kmDbById = new Map<number, Prisma.Decimal>();

    const payloadById = new Map<
      number,
      {
        chapa: string;
        codcoligada: number;
        codfilial: number;
        payload: Record<string, unknown>;
        originAddress: string;
      }
    >();

    for (const [destKey, items] of grouped.entries()) {
      let destinationAddress: string;
      try {
        destinationAddress = await ensureDestinationAddress(destKey);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `Erro ao buscar filial do RM (${destKey}) para filial interna ${params.filialId}: ${msg}`,
        );
        for (const it of items) {
          err.push({ geo_queue_id: it.geo_queue_id, error: msg });
        }
        continue;
      }

      // 1a) Busca até quatro cadastros no RM em paralelo.
      const reads = new LimitedExecutor(4);
      const readPayload = async (it: (typeof items)[number]) => {
        try {
          this.logger.log(
            `Buscando payload do funcionário ${it.chapa} (coligada=${it.codcoligada})`,
          );
          const payloadUnknownResponse =
            await this.rmService.getFuncByChapaEColigada(
              it.chapa,
              it.codcoligada,
              params.sessionId,
            );
          if (!payloadUnknownResponse.status) {
            throw new Error(payloadUnknownResponse.message);
          }

          const payloadUnknown = payloadUnknownResponse.data as Record<
            string,
            unknown
          >;
          if (!payloadUnknown || typeof payloadUnknown !== 'object') {
            throw new Error('Payload inválido do RM (não é objeto)');
          }
          const payload = payloadUnknown;

          const originAddress = this.formatEnderecoParts({
            rua: payload['RUA'],
            numero: payload['NUMERO'],
            bairro: payload['BAIRRO'],
            cidade: payload['CIDADE'],
            estado: payload['ESTADO'],
            cep: payload['CEP'],
            pais: payload['PAIS'],
          });

          return {
            id: it.geo_queue_id,
            value: {
              chapa: it.chapa,
              codcoligada: it.codcoligada,
              codfilial: it.codfilial,
              payload,
              originAddress,
            },
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(
            `Erro ao buscar payload do funcionário ${it.chapa}: ${msg}`,
          );
          err.push({ geo_queue_id: it.geo_queue_id, error: msg });
        }
      };
      const payloads = await Promise.all(
        items.map((it) => reads.run(() => readPayload(it))),
      );
      for (const entry of payloads) {
        if (entry) payloadById.set(entry.id, entry.value);
      }

      // 1b) Google Routes Matrix (por destino)
      const okWork = items
        .map(
          (it) => [it.geo_queue_id, payloadById.get(it.geo_queue_id)] as const,
        )
        .filter(([, v]) => Boolean(v)) as Array<
        readonly [
          number,
          {
            chapa: string;
            codcoligada: number;
            codfilial: number;
            payload: Record<string, unknown>;
            originAddress: string;
          },
        ]
      >;

      for (let i = 0; i < okWork.length; i += this.CHUNK_SIZE) {
        const chunk = okWork.slice(i, i + this.CHUNK_SIZE);
        const origins: RouteMatrixWaypoint[] = chunk.map(([, v]) => ({
          waypoint: { address: v.originAddress },
        }));
        const destinations: RouteMatrixWaypoint[] = [
          { waypoint: { address: destinationAddress } },
        ];

        const results = await this.callRoutesMatrixApi(origins, destinations);
        results.forEach((res) => {
          const idx = res.originIndex ?? 0;
          if (!Number.isInteger(idx) || idx < 0 || idx >= chunk.length) return;
          const [geoQueueId] = chunk[idx];
          const metros = res.distanceMeters ?? 0;
          const kmNumberStr = (metros / 1000).toFixed(2); // decimal com ponto (para persistir no banco)
          // RM costuma esperar decimal PT-BR (vírgula). Se mandarmos "23.72",
          // ele pode interpretar o ponto como separador de milhar e gravar 2372,00.
          const km = kmNumberStr.replace('.', ',');
          kmById.set(geoQueueId, km);
          kmDbById.set(geoQueueId, new Prisma.Decimal(kmNumberStr));
        });
      }
    }

    // 1c) Atualiza km no banco (execucao_funcionario_base) para execuções não finalizadas
    // Observação: updateMany não permite setar valores diferentes em um único comando,
    // então fazemos um loop item-a-item (batch é pequeno).
    for (const [geoQueueId, v] of payloadById.entries()) {
      const kmDb = kmDbById.get(geoQueueId);
      if (!kmDb) continue;
      try {
        await this.prisma.execucao_funcionario_base.updateMany({
          where: {
            funcionario_id_rm: v.chapa,
            codcoligada: v.codcoligada,
            codfilial: v.codfilial,
            execucao: { historica_de_execucao_id:null, status: { not: 'FINALIZADA' } },
          },
          data: { km: kmDb },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `Erro ao atualizar km na execucao_funcionario_base (chapa=${v.chapa}, geoQueueId=${geoQueueId}): ${msg}`,
        );
        // Best-effort: não falha o item GEO (principal é atualizar o RM).
      }
    }

    // 2) Atualiza RM por funcionário (PUT payload completo, sem id/parent_id)
    for (const [geoQueueId, v] of payloadById.entries()) {
      const km = kmById.get(geoQueueId);
      if (!km) {
        err.push({
          geo_queue_id: geoQueueId,
          error: 'Google não retornou distância para o funcionário',
        });
        continue;
      }

      try {
        // Mutação em-place é ok (payload vem como JSON)
        stripKeysDeepInPlace(v.payload, ['id', 'parent_id']);

        // No RM, PFCOMPL vem como ARRAY e sempre com 1 registro.
        // Precisamos atualizar PFCOMPL[0].KM mantendo o resto do payload intacto.
        const pfcompl = v.payload['PFCOMPL'];
        if (!Array.isArray(pfcompl) || pfcompl.length === 0) {
          v.payload['PFCOMPL'] = [{}];
        } else if (
          !pfcompl[0] ||
          typeof pfcompl[0] !== 'object' ||
          Array.isArray(pfcompl[0])
        ) {
          pfcompl[0] = {};
        }

        (v.payload['PFCOMPL'] as Array<Record<string, unknown>>)[0]['KM'] = km;

        const updateFuncDataResponse = await this.rmService.updateFuncData(
          v.payload,
          v.codcoligada,
          v.chapa,
          params.sessionId,
          v.codfilial,
        );
        if (!updateFuncDataResponse.status) {
          throw new Error(updateFuncDataResponse.message);
        }

        okIds.push(geoQueueId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`Erro ao atualizar RM (${v.chapa}): ${msg}`);
        err.push({
          geo_queue_id: geoQueueId,
          error: msg,
        });
      }
    }

    return { okIds, err };
  }

  private formatEnderecoParts(parts: {
    rua?: unknown;
    numero?: unknown;
    bairro?: unknown;
    cidade?: unknown;
    estado?: unknown;
    cep?: unknown;
    pais?: unknown;
  }): string {
    const rua = typeof parts.rua === 'string' ? parts.rua : '';
    const numero = typeof parts.numero === 'string' ? parts.numero : '';
    const bairro = typeof parts.bairro === 'string' ? parts.bairro : '';
    const cidade = typeof parts.cidade === 'string' ? parts.cidade : '';
    const estado = typeof parts.estado === 'string' ? parts.estado : '';
    const cep = typeof parts.cep === 'string' ? parts.cep : '';
    const pais =
      typeof parts.pais === 'string' && parts.pais.trim()
        ? parts.pais
        : 'Brasil';

    // Montagem tolerante: evita "undefined" e deixa a string aceitável pro Google
    const left = [rua, numero].filter(Boolean).join(', ');
    const mid = [bairro, cidade].filter(Boolean).join(', ');
    const right = [estado, cep].filter(Boolean).join(', ');
    return [left, mid, right, pais].filter(Boolean).join(' - ');
  }
}
