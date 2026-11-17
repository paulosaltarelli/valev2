import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RmService } from '../rm/rm.service';
import type { FalhaColeta } from './assistente-falha-coleta';

export type EstruturaSqlRm = {
  vinculoObrigatorio:boolean; regraObrigatoria:boolean; filtraColigada:boolean;
  filtraFilial:boolean; excluiDemitidos:boolean; limiteChapa:[number,number]|null;
};
export type LeituraSqlRm = {
  status:string; codigo?:string; coligada?:number; sistema?:string; texto?:string;
  hash?:string; alteradaEm?:string|null; consultadaEm?:string; estrutura?:EstruturaSqlRm;
};
export type AcessoSqlRm = {
  sessionId:string; perfil:string; incluirTexto?:boolean;
  memo?:Map<string,Promise<LeituraSqlRm>>;
};

/** Only structural facts from a fixed vocabulary leave the SQL reader. */
export function estruturaSqlRm(sql:string):EstruturaSqlRm {
  const semComentarios=sql.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\//g,' ');
  const s=semComentarios.replace(/'(?:''|[^'])*'/g,"'[literal]'");
  const length=/DATALENGTH\s*\(\s*value\s*\)\s+BETWEEN\s+(\d+)\s+AND\s+(\d+)/i.exec(s);
  return {
    vinculoObrigatorio:/\bINNER\s+JOIN\s+(?:\w+\.)?\[?ZMDVINCVCFUNC\b/i.test(s),
    regraObrigatoria:/\bINNER\s+JOIN\s+(?:\w+\.)?\[?ZMDREGRAVC\b/i.test(s),
    filtraColigada:/\b\w+\.CODCOLIGADA\s*=\s*:CODCOLIGADA\b/i.test(s),
    filtraFilial:/\b\w+\.CODFILIAL\s*=\s*:CODFILIAL\b/i.test(s),
    excluiDemitidos:/\b(?:\w+\.)?CODSITUACAO\s*(?:<>|!=)\s*'D'/i.test(semComentarios),
    limiteChapa:length&&Number(length[1])>=1&&Number(length[2])<=200 ? [Number(length[1]),Number(length[2])] : null,
  };
}

@Injectable()
export class AssistenteSqlRm {
  constructor(private readonly rm:RmService) {}
  async ler(falha:FalhaColeta|undefined,acesso?:AcessoSqlRm):Promise<LeituraSqlRm> {
    if(!falha)return {status:'CONSULTA_NAO_IDENTIFICADA'};
    if(!acesso?.sessionId)return {status:'SESSAO_NAO_DISPONIVEL'};
    // Same policy as source-code inspection: full technical definitions require admin.
    if(acesso.perfil!=='admin')return {status:'ADMINISTRADOR_NECESSARIO'};
    const key=falha.consulta;
    if(acesso.memo?.has(key))return acesso.memo.get(key)!;
    const read=(async():Promise<LeituraSqlRm>=>{
      try{
        const d=await this.rm.lerDefinicaoSql(key,acesso.sessionId);
        if(d.status!=='DISPONIVEL')return {status:d.status,codigo:key};
        if(/(?:password|pwd|senha|api[_-]?key|secret|token)\s*[:=]\s*[^\s;,]+|sk-(?:proj-|ant-)|Bearer\s+[A-Za-z0-9._-]+/i.test(d.texto))
          return {status:'CONTEUDO_SENSIVEL_OMITIDO',codigo:key};
        return {...d,hash:createHash('sha256').update(d.texto).digest('hex'),estrutura:estruturaSqlRm(d.texto)};
      }catch{return {status:'INDISPONIVEL',codigo:key};}
    })();
    acesso.memo?.set(key,read);
    return read;
  }
}

export function fonteSqlRm(d:LeituraSqlRm|undefined) {
  if(!d)return 'Texto SQL não consultado.';
  if(d.status!=='DISPONIVEL')return 'Texto SQL não disponível: '+d.status+'. Nenhuma sentença foi executada.';
  return `RM · ${d.codigo} · coligada ${d.coligada} · sistema ${d.sistema} · leitura ${d.consultadaEm} · alteração informada ${d.alteradaEm??'não informada'} · SHA-256 ${d.hash}. Definição atual; não comprova a versão da tentativa histórica. Leitura do cadastro, sem executar SQL.`;
}
