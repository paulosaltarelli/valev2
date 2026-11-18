import { distributeRuleResult, ruleEventValues, ruleKey, transportRules } from './transport-rules';
import { groupSendEvents, OperacaoService } from './operacao.service';
import { ExecucaoService } from './execucao.service';
import { operationProgress } from './operation-progress';

const employees=['0018611','0018640'].map(chapa=>({codcoligada:1,codfilial:1,chapa}));
const rules=['01.001.011','01.001.012'];
const requested=employees.flatMap(e=>rules.map(regra=>({...e,regra})));
const rows=requested.map(e=>({CODCOLIGADA:e.codcoligada,CODFILIAL:e.codfilial,CHAPA:e.chapa,CODREGRA:e.regra,RESULTADO:e.regra===rules[0]?5:9.9}));
const event=(id:number,rule:string,value:number,code='R066',type='V')=>({
  id,revisao:2,conferencia:2,regra:'hash',codigoRegra:rule,nome:'Pagamento',evento:code,tipo:type,valor:String(value),operacao:'novo',
  record:{CODCOLIGADA:1,CODFILIAL:1,CHAPA:'0018611',DATAINI:'2026-10-01',DATAFIM:'2026-10-31',CODEVENTO:code,TIPO:type,VALOR:value},
});
describe('Transporte com várias regras por colaborador',()=>{
  it('separa as duas tarifas nas duas chapas, preservando zeros',()=>{
    const distributed=distributeRuleResult(requested,rows,'PVE2.VALOR_VIAGE');
    for(const employee of employees) {
      expect(distributed.results.get(ruleKey(employee,rules[0]))).toEqual({value:5});
      expect(distributed.results.get(ruleKey(employee,rules[1]))).toEqual({value:9.9});
    }
    expect(distributeRuleResult([requested[0]],[{...rows[0],RESULTADO:0}],'PVE2.VALOR_VIAGE').results.get(ruleKey(requested[0],rules[0]))).toEqual({value:0});
  });
  it('recusa duplicação do mesmo vínculo, regra ausente e SQL sem CODREGRA',()=>{
    expect(distributeRuleResult(requested,[...rows,rows[0]],'PVE2.VALOR_VIAGE').results.get(ruleKey(requested[0],rules[0]))).toHaveProperty('error');
    expect(distributeRuleResult(requested,rows.slice(1),'PVE2.VALOR_VIAGE').results.get(ruleKey(requested[0],rules[0]))).toHaveProperty('error');
    expect(distributeRuleResult(requested,[{...rows[0],CODREGRA:undefined}],'PVE2.VALOR_VIAGE').results.get(ruleKey(requested[0],rules[0]))).toHaveProperty('error');
  });
  it('bloqueia uma nova regra inesperada em vez de enviar valor incompleto',()=>{
    expect(distributeRuleResult([requested[0]],rows.slice(0,2),'PVE2.VALOR_VIAGE').results.get(ruleKey(requested[0],rules[0]))).toHaveProperty('error');
  });
  it('não confunde coligada, filial ou zeros à esquerda de evento',()=>{
    const values=ruleEventValues(requested,rows.map(r=>({...r,RESULTADO:r.CODREGRA===rules[0]?'0066':'R066'})));
    expect(values.get(ruleKey(requested[0],rules[0]))).toBe('0066');
    expect(values.get(ruleKey({...requested[0],codfilial:2},rules[0]))).toBeUndefined();
  });
  it('aceita legado somente quando existe uma regra inequívoca',()=>{
    expect(transportRules({})).toEqual(['']);
    expect(distributeRuleResult([{...employees[0],regra:''}],rows.slice(0,1),'PVE2.VALOR_VIAGE').results.get(ruleKey(employees[0],''))).toEqual({value:5});
    expect(distributeRuleResult([{...employees[0],regra:''}],rows.slice(0,2),'PVE2.VALOR_VIAGE').results.get(ruleKey(employees[0],''))).toHaveProperty('error');
  });
  it('soma 29,80 por dia em um envio por evento, sem misturar dias ou outros eventos',()=>{
    const groups=groupSendEvents([event(1,rules[0],10),event(2,rules[1],19.8),event(3,rules[0],22,'R066','D'),event(4,rules[0],3,'R244')]);
    expect(groups).toHaveLength(3);
    expect(groups[0].record.VALOR).toBe(29.8);
    expect(groups[0].valor).toBe('29.80');
    expect(groups[0].componentes?.map(c=>c.id)).toEqual([1,2]);
    expect(groupSendEvents([event(1,rules[0],0.1),event(2,rules[1],0.2)])[0].record.VALOR).toBe(0.3);
  });
  it('conta resultados e variáveis de cada regra sem duplicar fórmulas compartilhadas',()=>{
    const progress=operationProgress([{formula_id:1,expressao:':A'}],['A'],rules.map(codigo_regra_rm=>({formula_id:1,codigo_regra_rm,status:'PROCESSADO',valor_calculado:5,formula_snapshot:null})),rules.map(rule=>rule+'|A'));
    expect(progress).toEqual({variaveisCalculadas:2,variaveisPrevistas:2,formulasCalculadas:2,formulasPrevistas:2});
  });
  it('processa duas regras com uma única base por chapa e compartilha a consulta de dias',async()=>{
    const bases=employees.map((e,i)=>({execucao_funcionario_base_id:i+1,funcionario_id_rm:e.chapa,codcoligada:1,codfilial:1,regras_rm:JSON.stringify(rules)}));
    const formulas=[{formula_id:1,expressao:':TARIFA * :VIAGENS * :DIAS',ativa:true}];
    const definitions=[['TARIFA','PVE2.VALOR_VIAGE'],['VIAGENS','PVE2.NRO_VIAGEN'],['DIAS','PVE2.DIAS_TRABAL']].map(([codigo,sql_codigo_rm],i)=>({variavel_id:i+1,codigo,nome:codigo,sql_codigo_rm,ativa:true,valor_fixo:null,chapas_por_chamada:null}));
    const execution={execucao_id:1,execucao_funcionario_base:bases,filial:{formula:formulas,variavel:definitions,km_max:{toNumber:()=>70}},periodo:{data_inicio:new Date('2026-10-01Z'),data_fim:new Date('2026-10-31Z')}};
    const memory:Array<{execucao_funcionario_id:number;variavel_codigo:string;valor:number}>=[];
    let next=1;
    const results:Record<string,unknown>[]=[];
    const prisma={
      execucao:{findUnique:jest.fn().mockResolvedValue(execution)},
      execucao_funcionario:{findMany:jest.fn().mockResolvedValue([]),upsert:jest.fn(({create})=>{const item={...create,execucao_funcionario_id:next++};results.push(item);return Promise.resolve(item);})},
      execucao_funcionario_base:{updateMany:jest.fn().mockResolvedValue({count:2})},
      memoria_calculo:{deleteMany:jest.fn(),createMany:jest.fn(({data})=>{memory.push(...data);return Promise.resolve({count:data.length});})},
      log_execucao:{create:jest.fn()},
    };
    const rm={realizaConsultaSql:jest.fn(async(query:string)=>({status:true,message:'ok',data:query==='PVE2.DIAS_TRABAL'?employees.map(e=>({CODCOLIGADA:1,CODFILIAL:1,CHAPA:e.chapa,RESULTADO:22})):rows.map(r=>({...r,RESULTADO:query==='PVE2.NRO_VIAGEN'?2:r.RESULTADO}))}))};
    const service=new ExecucaoService(prisma as never,{} as never,{} as never,rm as never,{} as never);
    const result=await service.processarVariaveisBatch(1,bases as never,'test');
    expect(result.status).toBe(true);
    expect(rm.realizaConsultaSql).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(4);
    expect(memory).toHaveLength(12);
    for(const base of bases) {
      const totals=results.filter(r=>r.execucao_funcionario_base_id===base.execucao_funcionario_base_id).map(r=>{
        const vars=Object.fromEntries(memory.filter(m=>m.execucao_funcionario_id===r.execucao_funcionario_id).map(m=>[m.variavel_codigo,m.valor]));
        return vars.TARIFA*vars.VIAGENS*vars.DIAS;
      });
      expect(totals).toEqual([220,435.6]);
      expect(totals.reduce((a,b)=>a+b,0)).toBe(655.6);
    }
  });
  it('rejeita envio quando qualquer parcela mudou após a aprovação',async()=>{
    const approved=groupSendEvents([event(1,rules[0],10),event(2,rules[1],19.8)]);
    const current=groupSendEvents([event(1,rules[0],10),{...event(2,rules[1],20),revisao:3}]);
    const db={execucao_queue:{findFirst:jest.fn().mockResolvedValue({execucao_id:1,revisao_payload:JSON.stringify({usuarioId:1,eventos:approved})})},execucao_funcionario:{findMany:jest.fn().mockResolvedValue([])}};
    const service=new OperacaoService(db as never,{} as never);
    jest.spyOn(service as never,'candidates' as never).mockResolvedValue([{eventos:current}] as never);
    await expect(service.approvedSendGroups(1)).rejects.toThrow('mudaram');
  });
});
