import { AxiosError } from 'axios';
import { RmService, extractAxiosResponseMessage, rmClassNotFound } from './rm.service';

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
