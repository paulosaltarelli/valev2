import { AxiosError } from 'axios';
import { RmService, extractAxiosResponseMessage, rmClassNotFound, extractRmApplicationError, rmRecordPayload } from './rm.service';

const rejected={messages:[{code:'0007',type:'error',detail:'Classe não encontrada: RMSPRJ4791552Server'}],length:0,data:null};
describe('Falhas de gravação no RM',()=>{
 it('extrai o detalhe de messages retornado pelo RM',()=>{
  expect(extractAxiosResponseMessage(rejected)).toBe('Classe não encontrada: RMSPRJ4791552Server');
 });
 it('classifica somente a rejeição explícita da classe configurada como não gravada',()=>{
  expect(rmClassNotFound('RMSPRJ4791552Server',500,rejected)).toBe(true);
  expect(rmClassNotFound('OutroServer',500,rejected)).toBe(false);
  expect(rmClassNotFound('RMSPRJ4791552Server',503,rejected)).toBe(false);
  expect(rmClassNotFound('RMSPRJ4791552Server',500,{...rejected,data:{id:1}})).toBe(false);
  expect(rmClassNotFound('RMSPRJ4791552Server',500,{messages:[{code:'0007',type:'error',detail:'Falha de banco de dados'}],length:0,data:null})).toBe(false);
 });
 it.each([
  [500,rejected,true],
  [500,{message:'Falha durante gravação'},false],
  [504,undefined,false],
  [403,{message:'Acesso negado'},true],
 ])('preserva a mensagem e a segurança em HTTP %s',async(status,data,notSent)=>{
  const service=new RmService({} as never,{} as never);
  jest.spyOn(service,'getBasicAuthHeaderFromSession').mockResolvedValue('test');
  jest.spyOn((service as unknown as {http:{post:()=>Promise<unknown>}}).http,'post').mockRejectedValue(
    new AxiosError('Request failed','ERR_BAD_RESPONSE',{} as never,{}, {status,data,headers:{},config:{},statusText:'error'} as never));
  const before=process.env.RM_API_URL;process.env.RM_API_URL='http://rm.test/rest/';
  try {
   const answer=await service.saveRecordMetaData('RMSPRJ4791552Server','TABLE',{},'session');
   expect(answer.status).toBe(false);
   expect(answer.notSent).toBe(notSent);
   if(data===rejected)expect(answer.message).toContain('Classe não encontrada: RMSPRJ4791552Server');
  } finally { if(before===undefined)delete process.env.RM_API_URL;else process.env.RM_API_URL=before; }
 });
});

describe('Erros de atualização e erros de aplicação com HTTP 200',()=>{
 const create=()=>{
  const service=new RmService({} as never,{} as never);
  jest.spyOn(service,'getBasicAuthHeaderFromSession').mockResolvedValue('test');
  process.env.RM_API_URL='http://rm.test/rest/';
  return service;
 };
 const original=process.env.RM_API_URL;
 afterEach(()=>{if(original===undefined)delete process.env.RM_API_URL;else process.env.RM_API_URL=original;});
 it('mostra o erro de aplicação no POST mesmo com HTTP 200, mantendo a confirmação pendente',async()=>{
  const service=create();
  jest.spyOn((service as unknown as {http:{post:()=>Promise<unknown>}}).http,'post').mockResolvedValue({data:rejected});
  const response=await service.saveRecordMetaData('Server','TABLE',{},'session');
  expect(response.status).toBe(false);expect(response.notSent).toBe(false);expect(response.message).toContain('Classe não encontrada');
 });
 it('mostra o detalhe do erro de HTTP no PUT',async()=>{
  const service=create();
  jest.spyOn((service as unknown as {http:{put:()=>Promise<unknown>}}).http,'put').mockRejectedValue(new AxiosError('Request failed','ERR_BAD_RESPONSE',{} as never,{}, {status:500,data:rejected,headers:{},config:{},statusText:'error'} as never));
  await expect(service.putRecordMetaData('Server','TABLE',1,{},'session')).rejects.toThrow('Classe não encontrada');
 });
 it('mostra a rejeição de aplicação no PUT com HTTP 200',async()=>{
  const service=create();
  jest.spyOn((service as unknown as {http:{put:()=>Promise<unknown>}}).http,'put').mockResolvedValue({data:rejected});
  await expect(service.putRecordMetaData('Server','TABLE',1,{},'session')).rejects.toThrow('Classe não encontrada');
 });
});

describe('Contrato confirmado pelo GetSchema do DataServer',()=>{
 const warning={messages:[{code:'0006',type:'warning',detail:'Ocorreu uma falha ao tentar criar o registro.'}],length:0,data:null};
 it('mostra a falha que veio como warning sem registro',()=>{
  expect(extractRmApplicationError(warning)).toBe('Ocorreu uma falha ao tentar criar o registro.');
  expect(extractRmApplicationError({...warning,length:1,data:{id:12}})).toBeUndefined();
 });
 it('monta ZMDMOVVC e ID=-1 para inserção sem alterar o registro aprovado',()=>{
  const record={CODCOLIGADA:1,CODFILIAL:1,CHAPA:'0014893',CODEVENTO:'R066',VALOR:550,TIPO:'V'};
  expect(rmRecordPayload('RMSPRJ4870400Server','ZMDMOVVC',record)).toEqual({ZMDMOVVC:[{ID:-1,CODCOLIGADA:1,CHAPA:'0014893',CODEVENTO:'R066',VALOR:550,TIPO:'V'}]});
  expect(record.CODFILIAL).toBe(1);
 });
 it('usa a chave ID real em atualizações e recusa a tabela antiga',()=>{
  expect(rmRecordPayload('RMSPRJ4870400Server','ZMDMOVVC',{CODCOLIGADA:1,CODFILIAL:1,VALOR:550},12000)).toEqual({ZMDMOVVC:[{ID:12000,CODCOLIGADA:1,VALOR:550}]});
  expect(()=>rmRecordPayload('RMSPRJ4870400Server','ZMDVALORES_VALE',{})).toThrow('exige ZMDMOVVC');
  expect(rmRecordPayload('OutroServer','OTHER',{VALOR:5},10)).toEqual({OTHER:[{VALOR:5,id:10}]});
 });
 it('posta o DataSet confirmado e preserva o recibo retornado',async()=>{
  const service=new RmService({} as never,{} as never);
  jest.spyOn(service,'getBasicAuthHeaderFromSession').mockResolvedValue('test');
  const post=jest.spyOn((service as unknown as {http:{post:(url:string,body:unknown,options:unknown)=>Promise<unknown>}}).http,'post').mockResolvedValue({data:{messages:[],length:1,data:{id:'12000',ID:12000}}});
  const old=process.env.RM_API_URL;process.env.RM_API_URL='http://rm.test/rest/';
  try {
   const response=await service.saveRecordMetaData('RMSPRJ4870400Server','ZMDMOVVC',{CODCOLIGADA:1,CODFILIAL:1,CHAPA:'0014893',VALOR:550},'session');
   expect(response.status).toBe(true);
   expect(post.mock.calls[0][1]).toEqual({ZMDMOVVC:[{ID:-1,CODCOLIGADA:1,CHAPA:'0014893',VALOR:550}]});
  } finally {if(old===undefined)delete process.env.RM_API_URL;else process.env.RM_API_URL=old;}
 });
});
