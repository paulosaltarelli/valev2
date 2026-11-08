/* Integração em SQL Server descartável. Não chama o TOTVS RM. */
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');
const { OperacaoService } = require('../dist/src/execucao/operacao.service');
if (!/^vale_ux_test_\d+$/.test(process.env.DATABASE_NAME || '')) throw Error('Banco de teste obrigatório');
const prisma = new PrismaClient({ adapter: new PrismaMssql({ server:process.env.DATABASE_HOST, port:Number(process.env.DATABASE_PORT), user:process.env.DATABASE_USER, password:process.env.DATABASE_PASSWORD, database:process.env.DATABASE_NAME, options:{encrypt:true,trustServerCertificate:true} }) });
const service = new OperacaoService(prisma);
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('OK '+name); }
async function rejects(fn, status) { await assert.rejects(fn, e=>e.getStatus?.()===status); }
(async()=>{
  const user=await prisma.usuario.create({data:{rm_user_id:'UX_TEST',login:'ux_test',nome:'Operador fictício',perfil:'operator'}});
  const period=await prisma.periodo.create({data:{competencia:'10/2026',data_inicio:new Date('2026-10-01'),data_fim:new Date('2026-10-31')}});
  const branch=await prisma.filial.create({data:{nome:'Filial fictícia',codcoligada:1,codfilial:1,sql_codigo_rm:'TEST'}});
  const formula=await prisma.formula.create({data:{filial_id:branch.filial_id,expressao:'100',versao:1,nome:'Benefício fictício',codEvento:'DEMO',tipo:'V',data_inicio_vigencia:new Date('2026-01-01')}});
  const execution=await prisma.execucao.create({data:{filial_id:branch.filial_id,periodo_id:period.periodo_id,usuario_execucao:user.usuario_id,status:'AGUARDANDO'}});
  const other=await prisma.execucao.create({data:{filial_id:branch.filial_id,periodo_id:period.periodo_id,usuario_execucao:user.usuario_id,status:'AGUARDANDO'}});
  const base=await prisma.execucao_funcionario_base.create({data:{execucao_id:execution.execucao_id,funcionario_id_rm:'FICTICIO1',nome_funcionario:'Pessoa fictícia',codcoligada:1,codfilial:1,status:'RESULTADOS_PROCESSADOS'}});
  let result=await prisma.execucao_funcionario.create({data:{execucao_id:execution.execucao_id,execucao_funcionario_base_id:base.execucao_funcionario_base_id,formula_id:formula.formula_id,funcionario_id_rm:'FICTICIO1',valor_calculado:100,valor_final:100,status:'PROCESSADO'}});
  const eid=execution.execucao_id, rid=result.execucao_funcionario_id, uid=user.usuario_id;
  const request={etapa:'ENVIAR_RM',execucaoIds:[eid]};
  await check('vínculo obrigatório no ajuste',async()=>{await rejects(()=>service.adjust(other.execucao_id,rid,120,'Teste de vínculo',1,uid),404);assert.equal((await prisma.execucao_funcionario.findUnique({where:{execucao_funcionario_id:rid}})).valor_final.toString(),'100');});
  await check('valor e motivo validados',async()=>{await rejects(()=>service.adjust(eid,rid,NaN,'Teste válido',1,uid),400);await rejects(()=>service.adjust(eid,rid,120,'x',1,uid),400);});
  await check('resultado calculado pode ser enviado sem conferência',async()=>{const p=await service.preview(request,uid);assert.equal(p.elegiveis,1);});
  await check('conferência registra versão e memória',async()=>{await service.review(eid,rid,1,uid);assert.equal(await prisma.resultado_historico.count({where:{tipo:'CONFERENCIA',resultado_id:rid}}),1);});
  const stale=await service.preview(request,uid);
  await check('ajuste atômico invalida conferência',async()=>{await service.adjust(eid,rid,120,'Correção fictícia',1,uid);result=await prisma.execucao_funcionario.findUnique({where:{execucao_funcionario_id:rid}});assert.equal(result.revisao,2);assert.equal(result.conferido_revisao,null);assert.equal(await prisma.ajuste_manual.count({where:{execucao_funcionario_id:rid}}),1);assert.equal(await prisma.resultado_historico.count({where:{tipo:'AJUSTE',resultado_id:rid}}),1);});
  await check('prévia desatualizada não enfileira',async()=>{await rejects(()=>service.confirm(stale.id,uid,'sessao-ficticia'),409);assert.equal(await prisma.execucao_queue.count(),0);});
  await check('concorrência otimista do ajuste',async()=>{await rejects(()=>service.adjust(eid,rid,150,'Outra correção',1,uid),409);});
  await service.review(eid,rid,2,uid);
  const ready=await service.preview(request,uid);
  await check('prévia separa novo envio e versão',async()=>{assert.equal(ready.elegiveis,1);assert.equal(ready.items[0].eventos[0].operacao,'novo');assert.equal(ready.items[0].eventos[0].revisao,2);});
  await check('duas confirmações concorrentes geram um job',async()=>{const outcomes=await Promise.allSettled([service.confirm(ready.id,uid,'sessao-ficticia'),service.confirm(ready.id,uid,'sessao-ficticia')]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(await prisma.execucao_queue.count(),1);});
  await check('ajuste bloqueado enquanto envio está agendado',async()=>{await rejects(()=>service.adjust(eid,rid,130,'Teste concorrente',2,uid),409);});
  const q=await prisma.execucao_queue.findFirst();
  await prisma.execucao_queue.update({where:{queue_id:q.queue_id},data:{status:'PROCESSANDO'}});
  await check('worker recebe exatamente o evento aprovado',async()=>{await prisma.formula.update({where:{formula_id:formula.formula_id},data:{codEvento:'OUTRO'}});const a=await service.approvedEvent(base.execucao_funcionario_base_id,rid,2);assert.equal(a.record.CODEVENTO,'DEMO');assert.equal(a.record.VALOR,120);await rejects(()=>service.approvedEvent(base.execucao_funcionario_base_id,rid,99),409);});
  await service.receipt(rid,2,12345,uid,{CODEVENTO:'DEMO',VALOR:120});
  await prisma.execucao_queue.update({where:{queue_id:q.queue_id},data:{status:'CONCLUIDO'}});
  await prisma.execucao_funcionario_base.update({where:{execucao_funcionario_base_id:base.execucao_funcionario_base_id},data:{status:'ENVIADO_RM'}});
  await check('mesma versão confirmada não é reenviada',async()=>{const p=await service.preview(request,uid);assert.equal(p.elegiveis,0);assert.match(p.items[0].reason,/já enviada/);});
  await check('ajuste após envio mantém recibo anterior e indica atualização',async()=>{await service.adjust(eid,rid,125,'Correção após envio',2,uid);result=await prisma.execucao_funcionario.findUnique({where:{execucao_funcionario_id:rid}});assert.equal(result.enviado_revisao,2);assert.equal(result.revisao,3);assert.equal(result.status,'PROCESSADO');assert.equal(result.metadados_rm_id,12345);await service.review(eid,rid,3,uid);const p=await service.preview(request,uid);assert.equal(p.items[0].eventos[0].operacao,'atualizacao');});
  await check('resumo não confunde cálculo com envio',async()=>{const summary=await service.summary(period.periodo_id);const row=summary.rows.find(r=>r.id===eid);assert.equal(row.valores,1);assert.equal(row.rm,0);assert.equal(row.situacao,'envio');assert.equal(row.latest,false);});
  await check('retomada padrão exclui etapas concluídas',async()=>{const p=await service.preview({etapa:'VARIAVEIS',execucaoIds:[eid]},uid);assert.equal(p.elegiveis,0);const explicit=await service.preview({etapa:'VARIAVEIS',execucaoIds:[eid],recalcular:true},uid);assert.equal(explicit.elegiveis,1);});
  await check('recálculo cria versão e preserva ajuste',async()=>{await service.saveCalculation(rid,140,formula);result=await prisma.execucao_funcionario.findUnique({where:{execucao_funcionario_id:rid}});assert.equal(result.revisao,4);assert.equal(result.conferido_revisao,null);assert.equal(result.valor_calculado.toString(),'140');assert.equal(result.valor_final.toString(),'125');});
  await check('ajuste não mascara resultado parcial',async()=>{await prisma.execucao_funcionario_base.update({where:{execucao_funcionario_base_id:base.execucao_funcionario_base_id},data:{status:'RESULTADOS_PARCIAL'}});await rejects(()=>service.adjust(eid,rid,130,'Resultado incompleto',4,uid),409);await prisma.execucao_funcionario_base.update({where:{execucao_funcionario_base_id:base.execucao_funcionario_base_id},data:{status:'RESULTADOS_PROCESSADOS'}});});
  // Exercita o worker real com um RM estritamente simulado.
  const {ExecucaoService}=require('../dist/src/execucao/execucao.service');
  const calls=[]; let fail=true; let loseReceipt=false;
  process.env.RM_METADATA_DATASERVER='SIMULADO';
  const fakeRm={saveRecordMetaData:async(_ds,_table,record)=>{calls.push({method:'POST',record});if(loseReceipt)throw Error('Resposta perdida');return {status:true,data:{id:23456}};},putRecordMetaData:async(_ds,_table,rmId,record)=>{calls.push({method:'PUT',rmId,record});if(fail)throw Error('Falha transitória simulada');return {data:{id:rmId}};}};
  const worker=new ExecucaoService(prisma,{}, {},fakeRm,service);
  worker.logger={log:()=>{},error:()=>{},warn:()=>{}};
  await service.execute(request,uid,'sessao-ficticia');
  let job=await prisma.execucao_queue.findFirst({where:{status:'PENDENTE',tipo:'ENVIAR_RM'}});
  await prisma.execucao_queue.update({where:{queue_id:job.queue_id},data:{status:'PROCESSANDO'}});
  await check('falha do worker não cria recibo de sucesso',async()=>{await worker.processarEnviarRmBatch(eid,[base],'sessao-ficticia');const b=await prisma.execucao_funcionario_base.findUnique({where:{execucao_funcionario_base_id:base.execucao_funcionario_base_id}});assert.equal(b.status,'ERRO_RM');assert.equal(await prisma.resultado_historico.count({where:{resultado_id:rid,tipo:'ENVIO_RM',revisao:4}}),0);});
  fail=false;
  await check('worker atualiza o mesmo evento e registra a versão aprovada',async()=>{await worker.processarEnviarRmBatch(eid,[base],'sessao-ficticia');result=await prisma.execucao_funcionario.findUnique({where:{execucao_funcionario_id:rid}});assert.equal(result.enviado_revisao,4);assert.equal(result.metadados_rm_id,12345);assert.equal(calls.at(-1).method,'PUT');assert.equal(calls.at(-1).rmId,12345);assert.equal(calls.at(-1).record.VALOR,125);assert.equal(await prisma.resultado_historico.count({where:{resultado_id:rid,tipo:'ENVIO_RM',revisao:4}}),1);});
  await check('repetição do worker não reenvia evento confirmado',async()=>{const n=calls.length;await worker.processarEnviarRmBatch(eid,[base],'sessao-ficticia');assert.equal(calls.length,n);});
  await prisma.execucao_queue.update({where:{queue_id:job.queue_id},data:{status:'CONCLUIDO'}});
  const freshBase=await prisma.execucao_funcionario_base.create({data:{execucao_id:eid,funcionario_id_rm:'FICTICIO2',nome_funcionario:'Outra pessoa fictícia',codcoligada:1,codfilial:1,status:'RESULTADOS_PROCESSADOS'}});
  const fresh=await prisma.execucao_funcionario.create({data:{execucao_id:eid,execucao_funcionario_base_id:freshBase.execucao_funcionario_base_id,formula_id:formula.formula_id,funcionario_id_rm:'FICTICIO2',valor_calculado:100,valor_final:100,status:'PROCESSADO'}});
  await check('ações diretas concorrentes agendam apenas um envio',async()=>{
    const pedido={etapa:'ENVIAR_RM',execucaoIds:[eid],baseIds:[freshBase.execucao_funcionario_base_id]};
    const outcomes=await Promise.allSettled([service.execute(pedido,uid,'sessao-ficticia'),service.execute(pedido,uid,'sessao-ficticia')]);
    assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
    assert.equal(await prisma.execucao_queue.count({where:{execucao_funcionario_base_id:freshBase.execucao_funcionario_base_id,tipo:'ENVIAR_RM'}}),1);
  });
  job=await prisma.execucao_queue.findFirst({where:{status:'PENDENTE',tipo:'ENVIAR_RM'}});await prisma.execucao_queue.update({where:{queue_id:job.queue_id},data:{status:'PROCESSANDO'}});
  await check('worker cria evento novo e persiste o identificador retornado',async()=>{await worker.processarEnviarRmBatch(eid,[freshBase],'sessao-ficticia');const r=await prisma.execucao_funcionario.findUnique({where:{execucao_funcionario_id:fresh.execucao_funcionario_id}});assert.equal(r.metadados_rm_id,23456);assert.equal(r.enviado_revisao,1);assert.equal(calls.at(-1).method,'POST');});
  await prisma.execucao_queue.update({where:{queue_id:job.queue_id},data:{status:'CONCLUIDO'}});
  await service.adjust(eid,fresh.execucao_funcionario_id,110,'Ajuste para conferência em seleção',1,uid);
  const confer={etapa:'CONFERIR',execucaoIds:[eid],baseIds:[freshBase.execucao_funcionario_base_id]};
  await check('conferência por seleção registra versão sem criar fila',async()=>{const count=await prisma.execucao_queue.count();const p=await service.preview(confer,uid);assert.equal(p.elegiveis,1);assert.equal(p.items[0].eventos[0].valor.toString(),'110');await service.confirm(p.id,uid,'sessao-ficticia');const r=await prisma.execucao_funcionario.findUnique({where:{execucao_funcionario_id:fresh.execucao_funcionario_id}});assert.equal(r.conferido_revisao,2);assert.equal(r.conferido_por,uid);assert.equal(await prisma.execucao_queue.count(),count);await rejects(()=>service.confirm(p.id,uid,'sessao-ficticia'),409);});
  await check('seleção exclui versões já conferidas',async()=>{const p=await service.preview(confer,uid);assert.equal(p.elegiveis,0);assert.match(p.items[0].reason,/já conferida/);});
  await check('conferência por seleção recusa valor alterado após prévia',async()=>{await service.adjust(eid,fresh.execucao_funcionario_id,120,'Outro ajuste fictício',2,uid);const p=await service.preview(confer,uid);await service.adjust(eid,fresh.execucao_funcionario_id,130,'Mudou após prévia',3,uid);await rejects(()=>service.confirm(p.id,uid,'sessao-ficticia'),409);});
  await check('POST sem confirmação não é reenviado e aparece como exclusão no escopo',async()=>{
    const pendingBase=await prisma.execucao_funcionario_base.create({data:{
      execucao_id:eid,funcionario_id_rm:'FICTICIO3',nome_funcionario:'Pessoa fictícia',
      codcoligada:1,codfilial:1,status:'RESULTADOS_PROCESSADOS',
    }});
    await prisma.execucao_funcionario.create({data:{
      execucao_id:eid,execucao_funcionario_base_id:pendingBase.execucao_funcionario_base_id,
      formula_id:formula.formula_id,funcionario_id_rm:'FICTICIO3',
      valor_calculado:100,valor_final:100,status:'PROCESSADO',
    }});
    const scope={etapa:'ENVIAR_RM',execucaoIds:[eid],baseIds:[pendingBase.execucao_funcionario_base_id]};
    assert.equal((await service.sendScope(scope)).eligible,1);
    await service.execute(scope,uid,'sessao-ficticia');
    const queued=await prisma.execucao_queue.findFirst({where:{status:'PENDENTE',tipo:'ENVIAR_RM'}});
    await prisma.execucao_queue.update({where:{queue_id:queued.queue_id},data:{status:'PROCESSANDO'}});
    loseReceipt=true;
    const before=calls.length;
    await worker.processarEnviarRmBatch(eid,[pendingBase],'sessao-ficticia');
    await worker.processarEnviarRmBatch(eid,[pendingBase],'sessao-ficticia');
    assert.equal(calls.length,before+1);
    await prisma.execucao_queue.update({where:{queue_id:queued.queue_id},data:{status:'ERRO'}});
    const after=await service.sendScope(scope);
    assert.equal(after.eligible,0);
    assert.equal(after.excluded['Aguardando confirmação do RM'],1);
    await rejects(()=>service.execute(scope,uid,'sessao-ficticia'),400);
  });
  const { CronService } = require('../dist/src/cron/cron.service');
  const otherBase = await prisma.execucao_funcionario_base.create({ data: {
    execucao_id: other.execucao_id, funcionario_id_rm: 'FICTICIO4', nome_funcionario: 'Pessoa fictícia',
    codcoligada: 1, codfilial: 1, status: 'VARIAVEIS_PROCESSADAS',
  } });
  const visits = [];
  const cron = new CronService(prisma, {
    processarValoresBatch: async (id, rows) => {
      visits.push(id);
      await prisma.execucao_funcionario_base.updateMany({
        where: { execucao_funcionario_base_id: { in: rows.map((row) => row.execucao_funcionario_base_id) } },
        data: { status: 'RESULTADOS_PROCESSADOS' },
      });
      return {};
    },
  }, null);
  const redo = { etapa: 'VALORES', execucaoIds: [eid], baseIds: [freshBase.execucao_funcionario_base_id], recalcular: true };
  await check('pausar deixa outra execução avançar e retomar atualiza a sessão', async () => {
    await service.execute(redo, uid, 'sessao-antiga');
    await service.controlQueue(eid, 'pausar', 'sessao-antiga');
    await rejects(() => service.execute(redo, uid, 'sessao-antiga'), 400);
    await service.execute({ etapa: 'VALORES', execucaoIds: [other.execucao_id], baseIds: [otherBase.execucao_funcionario_base_id] }, uid, 'sessao-outra');
    await cron.handleCheckVariablesToProcessExecution();
    assert.deepEqual(visits, [other.execucao_id]);
    assert.equal((await service.summary(period.periodo_id)).rows.find((r) => r.id === eid).situacao, 'pausada');
    await service.controlQueue(eid, 'retomar', 'sessao-nova');
    const pending = await prisma.execucao_queue.findFirstOrThrow({ where: { execucao_id: eid, status: 'PENDENTE' } });
    assert.equal(pending.session_id, 'sessao-nova');
    await cron.handleCheckVariablesToProcessExecution();
    assert.deepEqual(visits, [other.execucao_id, eid]);
  });
  await check('cancelar preserva o resultado anterior do item pendente e permite novo agendamento', async () => {
    await prisma.execucao_funcionario.update({
      where: { execucao_funcionario_id: fresh.execucao_funcionario_id },
      data: { status: 'PROCESSADO' },
    });
    await service.execute(redo, uid, 'sessao-nova');
    await service.controlQueue(eid, 'cancelar', 'sessao-nova');
    await cron.handleCheckVariablesToProcessExecution();
    assert.equal(visits.length, 2);
    assert.equal(await prisma.execucao_queue.count({ where: { execucao_id: eid, status: 'CANCELADO' } }), 1);
    assert.equal((await prisma.execucao_funcionario.findUniqueOrThrow({
      where: { execucao_funcionario_id: fresh.execucao_funcionario_id },
    })).status, 'PROCESSADO');
    await service.execute(redo, uid, 'sessao-nova');
    await cron.handleCheckVariablesToProcessExecution();
    assert.equal(visits.length, 3);
  });
  console.log(`PASS ${passed} cenários de integração; nenhuma chamada ao RM.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
