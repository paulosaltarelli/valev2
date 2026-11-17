import { ExecucaoService } from './execucao.service';
import { OperacaoService } from './operacao.service';

function fixture(existing = [{execucao_id:10}]) {
 const tx:any={
  $queryRaw:jest.fn().mockResolvedValue([{result:0}]),
  execucao:{findMany:jest.fn().mockResolvedValue(existing),findFirst:jest.fn().mockResolvedValue(existing[0]??null),create:jest.fn()},
  execucao_create_queue:{findFirst:jest.fn().mockResolvedValue({queue_id:1}),updateMany:jest.fn().mockResolvedValue({count:1}),create:jest.fn()},
 };
 const prisma:any={$transaction:jest.fn(async(fn:any)=>fn(tx))};
 const formula:any={getActiveFormulaByFilialId:jest.fn()};
 return {tx,formula,service:new ExecucaoService(prisma,formula,{} as any,{} as any,{} as any)};
}
it('reutiliza a principal e não cria nem reenfileira uma execução existente',async()=>{
 const f=fixture();const result=await f.service.createExecucao(1,{periodo_id:2},3,'session');
 expect(result).toMatchObject({status:true,data:{execucaoId:10,alreadyExists:true}});
 expect(f.tx.execucao.create).not.toHaveBeenCalled();expect(f.formula.getActiveFormulaByFilialId).not.toHaveBeenCalled();
 expect(f.tx.execucao.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{filial_id:1,periodo_id:2,historica_de_execucao_id:null}}));
});
it('confirma atomicamente uma solicitação antiga sem repetir os trabalhos',async()=>{
 const f=fixture();const result=await f.service.createExecucao(1,{periodo_id:2},3,'session',{queueId:1,owner:'worker',autoProcessar:true});
 expect(result).toMatchObject({status:true,data:{alreadyExists:true}});expect(f.tx.execucao_create_queue.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({lock_owner:'worker',status:'PROCESSANDO'}),data:expect.objectContaining({status:'CONCLUIDO'})}));expect(f.tx.execucao.create).not.toHaveBeenCalled();
});
it('não escolhe entre duplicidades sem referência e não agenda outra criação',async()=>{
 const f=fixture([{execucao_id:10},{execucao_id:11}]);expect(await f.service.createExecucao(1,{periodo_id:2},3,'session')).toMatchObject({status:false});expect(f.tx.execucao.create).not.toHaveBeenCalled();
 const g=fixture();const r=await g.service.enqueueCreateExecucaoBatch({filialIds:[1,1],periodoId:2,usuarioId:3,sessionId:'session'});expect(r).toMatchObject({status:false,data:{inserted:0,skipped:1}});expect(g.tx.execucao_create_queue.create).not.toHaveBeenCalled();
});
it('permite consultar uma histórica mas bloqueia comandos antes de alterar a fila',async()=>{
 const update=jest.fn();const tx:any={$queryRaw:jest.fn().mockResolvedValue([{execucao_id:11,historica_de_execucao_id:10}]),execucao_queue:{updateMany:update}};
 const prisma:any={$transaction:async(fn:any)=>fn(tx)};const service=new OperacaoService(prisma,{} as any);
 await expect(service.controlQueue(11,'retomar','session')).rejects.toThrow('principal #10');expect(update).not.toHaveBeenCalled();
});
