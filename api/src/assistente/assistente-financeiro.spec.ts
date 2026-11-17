import { AssistenteConsultas } from './assistente-consultas';
import { OperationalReportsService } from '../dash/operational-reports.service';
const result = (overrides = {}) => ({execucao_id:10,funcionario_id_rm:'001',status:'PROCESSADO',valor_calculado:'0.00',valor_final:'0.00',ajuste_manual:false,revisao:2,enviado_revisao:null,formula_snapshot:null,formula:{nome:'Benefício',versao:3,tipo:'V',polaridade:'+'},execucao_funcionario_base:{nome_funcionario:'Pessoa fictícia',status:'PROCESSADO'},...overrides});
const setup = (results:any[]=[]) => {
 const prisma={periodo:{findUnique:jest.fn().mockResolvedValue({competencia:'10/2026'})},filial:{findMany:jest.fn().mockResolvedValue([{filial_id:1,nome:'A'},{filial_id:2,nome:'B'}])}};
 const reports={financialStages:jest.fn().mockResolvedValue({runs:[{execucao_id:10,filial_id:1}],duplicated:[],results,partial:false})};
 return {prisma,service:new AssistenteConsultas(prisma as any,{} as any,{} as any,reports as any),reports};
};
it('inclui calculado sem envio, distingue zero, ajuste, revisão anterior e envio atual',async()=>{
 const {service,reports}=setup([result(),result({valor_calculado:'100',valor_final:'120',ajuste_manual:true}),result({valor_calculado:null,valor_final:null,status:'ERRO'}),result({status:'ENVIADO_RM',enviado_revisao:1,valor_final:'50'}),result({status:'ENVIADO_RM',enviado_revisao:2,valor_final:'60'})]);
 const r=await service.consultar('financeiro',{pergunta:'dashboard',periodoId:13},'operator');
 expect(reports.financialStages).toHaveBeenCalledWith(13,[1,2],undefined);
 const rows=r.tabela!.linhas;
 expect(rows[0].slice(7,11)).toEqual([0,null,0,null]);
 expect(rows[1].slice(7,11)).toEqual([100,120,120,null]);
 expect(rows[2].slice(7,11)).toEqual([null,null,null,null]);
 expect(rows[3][10]).toBeNull();expect(rows[4][10]).toBe(60);
 expect(rows[5][11]).toBe('Sem execução');
 expect(rows.every(r=>r.length===18)).toBe(true);
});
it('preserva matrícula e escopo da filial, e marca truncamento',async()=>{
 const {service,reports,prisma}=setup([]);prisma.filial.findMany.mockResolvedValueOnce([{filial_id:1,nome:'A'}]);reports.financialStages.mockResolvedValueOnce({runs:[],duplicated:[1],results:[],partial:true});
 const r=await service.consultar('financeiro',{pergunta:'dashboard',periodoId:13,filialId:1,matricula:'001'},'operator');
 expect(reports.financialStages).toHaveBeenCalledWith(13,[1],'001');
 expect(r.tabela!.parcial).toBe(true);expect(r.tabela!.linhas[0][11]).toContain('duplicadas');
});
it('leitor exclui históricos e duplicidades sem escolher execução silenciosamente',async()=>{
 const prisma={execucao:{findMany:jest.fn().mockResolvedValue([{execucao_id:10,filial_id:1},{execucao_id:11,filial_id:1},{execucao_id:20,filial_id:2}])},execucao_funcionario:{findMany:jest.fn().mockResolvedValue([])}};
 const r=await new OperationalReportsService(prisma as any).financialStages(13,[1,2],'001');
 expect(r.duplicated).toEqual([1]);expect(prisma.execucao.findMany.mock.calls[0][0].where.historica_de_execucao_id).toBeNull();
 expect(prisma.execucao_funcionario.findMany.mock.calls[0][0].where).toEqual({execucao_id:{in:[20]},funcionario_id_rm:'001'});
});
