import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { RmUserModel } from 'src/auth/models/RmUserModel';
import { CryptoService } from 'src/security/crypto.service';
import {
  RmSessionService,
  type RmSessaoRow,
} from 'src/rm-session/rm-session.service';
import { FilialRm } from 'src/models/FilialRmModel';
import { RmRequestGate } from './rm-request-gate';

type RmUserResponse = {
  data?: RmUserModel[];
};

const pve2ScheduleQueries = new Set(['PVE2.DIAS_TRABAL', 'PVE2.D.RECEB.PAS']);

function joinUrl(base: string, path: string) {
  const b = base.endsWith('/') ? base : `${base}/`;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}${p}`;
}

export function extractAxiosResponseMessage(data: unknown): string | undefined {
  if (!data) return undefined;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    return trimmed.length ? trimmed : undefined;
  }

  if (typeof data !== 'object') return undefined;

  const obj = data as Record<string, unknown>;
  const directCandidates: unknown[] = [
    obj.message,
    obj.Message,
    obj.erro,
    obj.Erro,
    obj.error,
    obj.Error,
    obj.ExceptionMessage,
    obj.InternalMessage,
    obj.detail,
    obj.details,
    obj.title,
  ];

  for (const c of directCandidates) {
    if (typeof c === 'string' && c.trim().length) return c.trim();
  }

  if (Array.isArray(obj.messages)) {
    const messages = obj.messages.map(item => {
      if (!item || typeof item !== 'object') return '';
      return [item.detail, item.message, item.Message].find(v => typeof v === 'string' && v.trim()) ?? '';
    }).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }

  const nestedError = obj.error;
  if (nestedError && typeof nestedError === 'object') {
    const ne = nestedError as Record<string, unknown>;
    const nestedCandidates: unknown[] = [
      ne.message,
      ne.Message,
      ne.detail,
      ne.details,
      ne.title,
    ];
    for (const c of nestedCandidates) {
      if (typeof c === 'string' && c.trim().length) return c.trim();
    }
  }

  return undefined;
}

// This RM rejection occurs before the class can be instantiated or a record persisted.
// Do not classify generic HTTP 500s or transport timeouts as safe to retry.
export function rmClassNotFound(dataServer: string, status: number | undefined, data: unknown): boolean {
  if (status !== 500 || !data || typeof data !== 'object') return false;
  const body = data as {data?:unknown;length?:unknown;messages?:Array<{code?:unknown;type?:unknown;detail?:unknown}>};
  return body.data === null && body.length === 0 && Array.isArray(body.messages) && body.messages.length > 0 &&
    body.messages.every(m => ['0004','0007'].includes(String(m?.code)) && m.type === 'error' &&
      m.detail === 'Classe não encontrada: ' + dataServer);
}

export function extractRmApplicationError(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const body=data as {messages?:Array<{type?:unknown}>;data?:unknown;length?:unknown};
  const messages=body.messages;
  const withoutRecord=body.data == null || body.length === 0;
  return Array.isArray(messages) && messages.some(m=>m?.type==='error' || (m?.type==='warning' && withoutRecord))
    ? extractAxiosResponseMessage(data) ?? 'RM retornou erro sem detalhe.'
    : undefined;
}

export function rmRecordPayload(
  dataServer: string, tableName: string, dataRecord: unknown, recordId?: number,
): Record<string, unknown> {
  if (!dataRecord || typeof dataRecord !== 'object' || Array.isArray(dataRecord))
    throw new Error('Registro RM inválido.');
  const record={...(dataRecord as Record<string,unknown>)};
  if(dataServer === 'RMSPRJ4870400Server') {
    if(tableName !== 'ZMDMOVVC') throw new Error('Tabela RM incompatível: este DataServer exige ZMDMOVVC.');
    delete record.CODFILIAL;
    delete record.id;
    delete record.RESTDS_TEMP_ID;
    record.ID=recordId ?? -1;
  } else if(recordId !== undefined) record.id=recordId;
  return {[tableName]:[record]};
}

@Injectable()
export class RmService {
  private readonly logger = new Logger(RmService.name);
  private readonly traffic = new RmRequestGate();
  private readonly http = axios.create({
    adapter: (config) => this.traffic.run(async () => {
      try {
        return await axios.getAdapter(axios.defaults.adapter)(config);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          this.pauseRm(error.response.headers['retry-after']);
        }
        throw error;
      }
    }),
  });

  private pauseRm(retryAfter: unknown) {
    const wait = this.traffic.defer(retryAfter);
    this.logger.warn(`RM respondeu HTTP 429. Novas chamadas aguardam ${wait} ms.`);
  }
  constructor(
    private readonly rmSessionService: RmSessionService,
    private readonly cryptoService: CryptoService,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<RmUserModel | undefined> {
    const baseUrl = process.env.RM_API_URL;
    if (!baseUrl) throw new Error('RM_API_URL not configured');

    const url = joinUrl(baseUrl, 'GlbUsuarioData');
    const basic = Buffer.from(`${username}:${password}`, 'utf8').toString(
      'base64',
    );

    const resp = await this.traffic.run(async () => {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: 'application/json',
        },
      });
      if (response.status === 429) this.pauseRm(response.headers.get('retry-after'));
      return response;
    });

    if (!resp.ok) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const body = (await resp.json().catch(() => ({}))) as RmUserResponse;
    if (!('data' in body))
      throw new UnauthorizedException('Resposta inválida do RM');
    return body.data?.[0];
  }

  private async getBasicAuthHeaderFromSession(
    sessionId: string,
  ): Promise<string> {
    const sess = (await this.rmSessionService.getBySessionId(
      sessionId,
    )) as unknown as RmSessaoRow | null;
    if (!sess) throw new UnauthorizedException();
    if (sess.expires_at.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }

    const creds = this.cryptoService.decryptJson<{
      username: string;
      password: string;
    }>(sess.encrypted_credentials);
    if (!creds?.username || !creds?.password) throw new UnauthorizedException();

    const basic = Buffer.from(
      `${creds.username}:${creds.password}`,
      'utf8',
    ).toString('base64');
    return `Basic ${basic}`;
  }

  private buildRmParameters(
    params: Record<string, string | number | boolean | null | undefined>,
  ): string {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      )
      .join(';');
  }

  async realizaConsultaSql(
    codSentenca: string,
    params: Record<string, string | number | boolean | null | undefined>,
    sessionId: string,
  ): Promise<{
    status: boolean;
    message: string;
    data: unknown;
    http?: {
      status?: number;
      statusText?: string;
      url?: string;
      method?: string;
      axiosCode?: string;
      retryNotBefore?: number;
    };
  }> {
    try {
      const rmBase = process.env.RM_NEW_API_URL;
      if (!rmBase) throw new Error('RM_NEW_API_URL not configured');

      //coloca a sentença, coligada 0 e codSistema na url: baseUrl + codSentenca + 0 + G
      const statementCompany = codSentenca.startsWith('PVE2.')
        ? process.env.RM_PVE2_COLIGADA ?? '1'
        : process.env.RM_COLIGADA_GLOBAL;
      const baseUrl = `${rmBase}consultaSQLServer/RealizaConsulta/${codSentenca}/${statementCompany}/${process.env.RM_COD_SISTEMA}`;

      //constroi a url com os parametros: baseUrl + ?parameters=paramKey1=paramVAlue1;paramKey2=paramValue2;...
      const parameters = this.buildRmParameters(params);

      const url = joinUrl(baseUrl, `?parameters=${parameters}`);

      const authorization = await this.getBasicAuthHeaderFromSession(sessionId);
      const response = await this.http.get<unknown>(url, {
        timeout: pve2ScheduleQueries.has(codSentenca) ? 240_000
          : codSentenca.startsWith('PVE2.') ? 90_000 : undefined,
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
        },
      });

      return {
        status: true,
        message: 'Consulta SQL realizada com sucesso',
        data: response.data,
        http: {
          status: response.status,
          statusText: response.statusText,
          url: response.config?.url,
          method: response.config?.method,
        },
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Erro ao realizar consulta SQL no RM (sentenca=${codSentenca})`,
          error.stack,
        );
        const responseMsg = extractAxiosResponseMessage(error.response?.data);
        return {
          status: false,
          message: `Erro ao realizar consulta SQL: ${
            responseMsg ?? error.message ?? 'Erro desconhecido'
          }`,
          data: error.response?.data as unknown,
          http: {
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: error.config?.url,
            method: error.config?.method,
            axiosCode: error.code,
            retryNotBefore: error.response?.status === 429 ? this.traffic.retryNotBefore : undefined,
          },
        };
      }
      this.logger.error(
        `Erro ao realizar consulta SQL no RM (sentenca=${codSentenca})`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        status: false,
        message: 'Erro ao realizar consulta SQL: ' + error,
        data: null,
        http: undefined,
      };
    }
  }

  async getFuncByChapaEColigada(
    chapa: string,
    coligada: number,
    sessionId: string,
  ): Promise<{ status: boolean; message: string; data: unknown }> {
    const rmBase = process.env.RM_API_URL;
    if (!rmBase) throw new Error('RM_API_URL not configured');
    //monta url assim: FopFuncData/9$_$0311825
    const url = joinUrl(rmBase, `FopFuncData/${coligada}$_$${chapa}`);
    const authorization = await this.getBasicAuthHeaderFromSession(sessionId);
    const response = await this.http.get<{ data: unknown }>(url, {
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        CODCOLIGADA: coligada,
      },
    });
    return {
      status: true,
      message: 'Function data retrieved successfully',
      data: response.data?.data,
    };
  }

  async updateFuncData(
    funcData: unknown,
    codcoligada: number,
    chapa: string,
    sessionId: string,
    codfilial?: number,
  ): Promise<{ status: boolean; message: string; data: unknown }> {
    const rmBase = process.env.RM_API_URL;
    if (!rmBase) throw new Error('RM_API_URL not configured');
    const url = joinUrl(rmBase, `FopFuncData/${codcoligada}$_$${chapa}`);
    const authorization = await this.getBasicAuthHeaderFromSession(sessionId);
    const response = await this.http.put<unknown>(url, funcData, {
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        CODCOLIGADA: codcoligada,
        ...(typeof codfilial === 'number' && Number.isFinite(codfilial)
          ? { CODFILIAL: codfilial }
          : {}),
      },
    });
    return {
      status: true,
      message: 'Function data updated successfully',
      data: response.data,
    };
  }

  async getFilialData(
    codcoligada: number,
    codfilial: number,
    sessionId: string,
  ): Promise<{ status: boolean; message: string; data: FilialRm }> {
    const rmBase = process.env.RM_API_URL;
    if (!rmBase) throw new Error('RM_API_URL not configured');
    const url = joinUrl(
      rmBase,
      `FisFilialDataBR/${codcoligada}$_$${codfilial}`,
    );
    const authorization = await this.getBasicAuthHeaderFromSession(sessionId);
    const response = await this.http.get<{ data: FilialRm }>(url, {
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        CODCOLIGADA: codcoligada,
        CODFILIAL: codfilial,
      },
    });
    return {
      status: true,
      message: 'Filial data retrieved successfully',
      data: response.data?.data,
    };
  }

  async saveRecordMetaData(
    dataServer: string,
    tableName: string,
    dataRecord: unknown,
    sessionId: string,
  ): Promise<{ status: boolean; message: string; data: unknown; notSent?: boolean }> {
    let dispatched = false;
    try {
      const rmBase = process.env.RM_API_URL;
      if (!rmBase) throw new Error('RM_API_URL not configured');
      // rmBase já pode conter ".../RMSRestDataServer/rest/" (como no .env atual).
      // Então aqui apenas anexamos o DataServer.
      const url = joinUrl(rmBase, `${dataServer}`);
      const authorization = await this.getBasicAuthHeaderFromSession(sessionId);
      // O DataServer customizado recebe o DataSet e a chave definidos por GetSchema.
      const body = rmRecordPayload(dataServer, tableName, dataRecord);

      dispatched = true;
      const response = await this.http.post<unknown>(url, body, {
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
        },
      });
      const applicationError = extractRmApplicationError(response.data);
      if (applicationError) return {
        status: false, message: 'RM recusou a gravação: ' + applicationError,
        data: response.data, notSent: false,
      };
      return {
        status: true,
        message: 'Record meta data saved successfully',
        data: response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseMsg = extractAxiosResponseMessage(error.response?.data);
        const httpStatus = error.response?.status;

        this.logger.error(
          `Erro ao salvar metadados no RM (dataServer=${dataServer}, tableName=${tableName}, httpStatus=${httpStatus ?? 'n/a'}, url=${error.config?.url ?? 'n/a'})`,
          error.stack,
        );

        return {
          status: false,
          message: `Erro ao salvar metadados no RM${
            httpStatus ? ` (HTTP ${httpStatus})` : ''
          }: ${responseMsg ?? error.message ?? 'Erro desconhecido'}`,
          data: error.response?.data ?? {},
          notSent: !dispatched || [401, 403, 429].includes(httpStatus ?? 0) || rmClassNotFound(dataServer, httpStatus, error.response?.data),
        };
      }
      return {
        status: false,
        message: 'Erro ao salvar metadados no RM',
        notSent: !dispatched,
        data: {},
      };
    }
  }

  async saveRecordMetaDataBatch(
    dataServer: string,
    dataRecords: unknown[],
    sessionId: string,
  ): Promise<{ status: boolean; message: string; data: unknown }> {
    const rmBase = process.env.RM_API_URL;
    if (!rmBase) throw new Error('RM_API_URL not configured');
    const url = joinUrl(rmBase, `${dataServer}`);
    const authorization = await this.getBasicAuthHeaderFromSession(sessionId);
    const body = {
      // Mantemos compatibilidade: o caller precisa passar `dataRecords` já como array de records.
      // A chave correta precisa ser o nome da tabela; este método pode ser ajustado futuramente conforme uso.
      // Por enquanto, enviamos como "tableName" apenas se for exigido; o recomendado é usar saveRecordMetaData.
      tableName: dataRecords,
    } as Record<string, unknown>;
    const response = await this.http.post<unknown>(url, body, {
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
      },
    });
    return {
      status: true,
      message: 'Record meta data batch saved successfully',
      data: response.data,
    };
  }

  async putRecordMetaData(
    dataServer: string,
    tableName: string,
    recordId: number,
    dataRecord: unknown,
    sessionId: string,
  ): Promise<{ status: boolean; message: string; data: unknown }> {
    const rmBase = process.env.RM_API_URL;
    if (!rmBase) throw new Error('RM_API_URL not configured');
    const url = joinUrl(rmBase, `${dataServer}/${recordId}`);
    const authorization = await this.getBasicAuthHeaderFromSession(sessionId);
    const body = rmRecordPayload(dataServer, tableName, dataRecord, recordId);

    const response = await this.http.put<unknown>(url, body, {
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
      },
    }).catch((error: unknown) => {
      if (!axios.isAxiosError(error)) throw error;
      const detail=extractAxiosResponseMessage(error.response?.data) ?? error.message;
      throw new Error('Erro ao atualizar metadados no RM' +
        (error.response?.status ? ' (HTTP ' + error.response.status + ')' : '') + ': ' + detail);
    });
    const applicationError=extractRmApplicationError(response.data);
    if(applicationError) throw new Error('RM recusou a atualização: ' + applicationError);
    return {
      status: true,
      message: 'Record meta data put successfully',
      data: response.data,
    };
  }
}
