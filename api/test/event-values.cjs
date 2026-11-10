const assert=require('node:assert/strict');
const {OperacaoService,calculationEventCode}=require('../dist/src/execucao/operacao.service');
let calls=0,writes=0,rmValue='R0066';const records=new Map(),history=[];
const base={execucao_funcionario_base_id:7,codcoligada:1,codfilial:2,funcionario_id_rm:'TEST',execucao:{periodo:{data_inicio:new Date('2026-10-01'),data_fim:new Date('2026-10-31')},filial:{km_max:70,variavel:[{codigo:'EVENTOPAG',ativa:true,sql_codigo_rm:'TEST.PAG',valor_fixo:null}]}}};
const record=id=>records.get(id)??{execucao_funcionario_id:id,execucao_id:42,revisao:1,ajuste_manual:false,valor_final:0,memoria_calculo:[],execucao_funcionario_base:base};
const prisma={execucao_funcionario:{findUniqueOrThrow:async({where})=>record(where.execucao_funcionario_id),update:async({where,data})=>{writes++;const r={...record(where.execucao_funcionario_id),...data,revisao:record(where.execucao_funcionario_id).revisao+1};records.set(where.execucao_funcionario_id,r);return r;}},resultado_historico:{create:async({data})=>history.push(data)},execucao_funcionario_base:{findFirst:async()=>({execucao_funcionario:[...records.values()]})}};prisma.$transaction=async fn=>fn(prisma);
const rm={realizaConsultaSql:async()=>{calls++;return {status:true,data:[{RESULTADO:rmValue}]}}};const service=new OperacaoService(prisma,rm);
(async()=>{
 const formula={formula_id:1,nome:'Teste',codEvento:'(:EVENTOPAG)',tipo:'V',versao:4};const cache=new Map();
 await service.saveCalculation(1,100,formula,'session',cache);await service.saveCalculation(2,20,formula,'session',cache);
 assert.equal(calls,1);const saved=JSON.parse(records.get(1).formula_snapshot);assert.equal(saved.evento_calculo.valor,'R0066');assert.equal(saved.evento_calculo.variavel,'EVENTOPAG');assert.equal(saved.codEvento,'(:EVENTOPAG)');assert.equal(JSON.parse(history[0].detalhe).evento_calculo.valor,'R0066');assert.equal(history[0].revisao,2);
 rmValue='9999';const before=calls;const shown=await service.employeeEvents(42,7);assert.equal(calls,before);assert.equal(shown.events[0].valor,'R0066');assert.equal(calculationEventCode(saved),'R0066');assert.equal(calculationEventCode({codEvento:'(:EVENTOPAG)'}),null);
 await service.saveCalculation(1,110,formula,'session',new Map());assert.equal(JSON.parse(records.get(1).formula_snapshot).evento_calculo.valor,'9999');assert.equal(JSON.parse(history[0].detalhe).evento_calculo.valor,'R0066');
 rmValue='';const count=writes;await assert.rejects(()=>service.saveCalculation(3,20,formula,'session',new Map()));assert.equal(writes,count);
 await service.saveCalculation(4,10,{...formula,codEvento:'0042'});assert.equal(JSON.parse(records.get(4).formula_snapshot).evento_calculo.valor,'0042');
 records.set(5,{...record(5),formula_snapshot:JSON.stringify(formula)});const legacy=await service.employeeEvents(42,7);assert.ok(legacy.events.find(e=>e.resultadoId===5).erro);assert.equal(legacy.events.find(e=>e.resultadoId===5).valor,null);
 console.log('PASS: immutable event snapshot, revision history, per-batch dedup, no read-time RM calls, stored send code, explicit legacy and failure without success write');
})().catch(e=>{console.error(e);process.exit(1)});
