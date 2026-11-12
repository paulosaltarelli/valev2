// Run from the API root, after backup and the additive migration. No result data is moved.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PrismaService}=require(path.join(process.cwd(),'dist/src/prisma/prisma.service'));
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert(Array.isArray(manifest)&&manifest.length>0&&manifest.length<=20);
assert(manifest.every(x=>[x.principal,x.historica,x.filial,x.periodo].every(v=>Number.isSafeInteger(v)&&v>0)&&x.principal!==x.historica));
const apply=process.argv.includes('--apply');
async function fingerprints(tx,ids){
 return Promise.all(ids.map(async id=>({id,
  bases:await tx.execucao_funcionario_base.count({where:{execucao_id:id}}),
  results:await tx.execucao_funcionario.count({where:{execucao_id:id}}),
  memories:await tx.memoria_calculo.count({where:{execucao_funcionario:{execucao_id:id}}}),
  adjustments:await tx.ajuste_manual.count({where:{execucao_funcionario:{execucao_id:id}}}),
  history:await tx.resultado_historico.count({where:{execucao_id:id}}),
  queues:await tx.execucao_queue.count({where:{execucao_id:id}}),
  logs:await tx.log_execucao.count({where:{execucao_id:id}}),
  digest:await tx.$queryRaw`SELECT CHECKSUM_AGG(BINARY_CHECKSUM(execucao_funcionario_id,formula_id,valor_calculado,valor_final,status,revisao,enviado_revisao,CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),formula_snapshot)),2))) AS digest FROM dbo.execucao_funcionario WHERE execucao_id=${id}`,
 })));
}
(async()=>{const p=new PrismaService();try{
 const result=await p.$transaction(async tx=>{
  for(const x of [...manifest].sort((a,b)=>a.filial-b.filial)){
   const resource=`vale:execucao:${x.filial}:${x.periodo}`;
   const [lock]=await tx.$queryRaw`DECLARE @r int; EXEC @r=sp_getapplock @Resource=${resource},@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000; SELECT @r AS result;`;
   assert(lock.result>=0,'Scope is being modified');
   await tx.$queryRaw`SELECT execucao_id FROM dbo.execucao WITH(UPDLOCK,HOLDLOCK) WHERE filial_id=${x.filial} AND periodo_id=${x.periodo}`;
   const runs=await tx.execucao.findMany({where:{filial_id:x.filial,periodo_id:x.periodo},select:{execucao_id:true,historica_de_execucao_id:true}});
   assert.deepEqual(runs.map(r=>r.execucao_id).sort((a,b)=>a-b),[x.principal,x.historica].sort((a,b)=>a-b),'Unexpected scope');
   assert.equal(runs.find(r=>r.execucao_id===x.principal).historica_de_execucao_id,null);
   assert([null,x.principal].includes(runs.find(r=>r.execucao_id===x.historica).historica_de_execucao_id));
   assert.equal(await tx.execucao_queue.count({where:{execucao_id:{in:[x.principal,x.historica]},status:{in:['PENDENTE','PROCESSANDO']}}}),0,'Scope has active work');
   assert.equal(await tx.execucao_create_queue.count({where:{filial_id:x.filial,periodo_id:x.periodo,status:{in:['PENDENTE','PROCESSANDO']}}}),0,'Scope has creation work');
   const total=await tx.execucao_funcionario.count({where:{execucao_id:x.principal}});
   const [sent]=await tx.$queryRaw`SELECT COUNT(*) AS n FROM dbo.execucao_funcionario WHERE execucao_id=${x.principal} AND status='ENVIADO_RM' AND enviado_revisao=revisao`;
   assert(total>0&&sent.n===total,'Principal needs a complete recorded receipt for its current revisions');
  }
  const ids=manifest.flatMap(x=>[x.principal,x.historica]);const before=await fingerprints(tx,ids);
  if(apply){
   for(const x of manifest)await tx.execucao.update({where:{execucao_id:x.historica},data:{historica_de_execucao_id:x.principal,historica_em:new Date(),historica_motivo:'Autorizado por Paulo Saltarelli. Primeira execução com envio completo registrado para as revisões locais; resultados, fórmulas, filas e históricos preservados. Release execucoes-principais-20261112.'}});
   const duplicates=await tx.$queryRaw`SELECT filial_id,periodo_id FROM dbo.execucao WHERE historica_de_execucao_id IS NULL GROUP BY filial_id,periodo_id HAVING COUNT(*)>1`;
   assert.equal(duplicates.length,0,'Other unresolved duplicate scopes');
   // Apply execution-principal-index.sql through the maintenance SQL account before reopening the API.
  }
  const after=await fingerprints(tx,ids);assert.deepEqual(after,before,'Child data changed; activation rolled back');
  return {applied:apply,archived:apply?manifest.length:0,principals:manifest.map(x=>x.principal),historical:manifest.map(x=>x.historica),childDataUnchanged:true};
 },{timeout:120000});console.log(JSON.stringify(result));
}finally{await p.$disconnect()}})().catch(e=>{console.error(JSON.stringify({activationFailed:true,kind:e?.constructor?.name,rolledBack:true}));process.exitCode=1});
