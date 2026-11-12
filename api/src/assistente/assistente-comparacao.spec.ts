import { AssistenteComparacao, competenciaAnterior, pedidoComparacaoHistorica, resumirVariacao } from './assistente-comparacao';
import { variationRows, VariationLimitError, type ReportFormula, type ReportPerson } from '../dash/operational-reports';
import type { PrismaService } from '../prisma/prisma.service';
import type { OperationalReportsService } from '../dash/operational-reports.service';
import { AssistenteAvancado } from './assistente-avancado';
import type { AssistenteConsultas } from './assistente-consultas';
import type { AssistenteConhecimento } from './assistente-conhecimento';
import type { AssistenteSql } from './assistente-sql';
import type { AssistenteInvestigacao } from './assistente-investigacao';

const formula=(id:number,nome:string,tipo='V',polaridade='+',versao=1):ReportFormula=>({formula_id:id,nome,tipo,polaridade,versao,expressao:'1',codEvento:String(id)});
const result=(f:ReportFormula,valor:string,snapshot:string|null=JSON.stringify(f))=>({formula:f,formula_snapshot:snapshot,status:'PROCESSADO',valor_calculado:{toString:()=>valor},revisao:1,enviado_revisao:null,_count:{memoria_calculo:1}});
const person=(id:string,results:ReturnType<typeof result>[]):ReportPerson=>({funcionario_id_rm:id,codcoligada:1,nome_funcionario:'Pessoa de teste',status:'RESULTADOS_PROCESSADOS',execucao_funcionario:results});
const pago=formula(1,'Pago'),desconto=formula(2,'Desconto','V','-'),dias=formula(4,'Dias','D');
const current=[person('001',[result(pago,'100.25'),result(desconto,'10'),result(formula(3,'Bonus','V','+',2),'20'),result(dias,'23')]),person('002',[result(pago,'999')])];
const previous=[person('001',[result(pago,'0'),result(desconto,'10'),result(formula(3,'Bonus'),'10'),result(dias,'22')]),person('003',[result(pago,'50')])];
const rows=()=>variationRows(current,previous,true,true);

function fixture(){
 const options={periodos:[{periodo_id:12,competencia:'09/2026',ativo:true,data_inicio:new Date('2026-09-01')},{periodo_id:11,competencia:'08/2026',ativo:false,data_inicio:new Date('2026-08-01')}],filiais:[{filial_id:1,nome:'Alfa',ativa:true},{filial_id:2,nome:'Beta',ativa:true}]};
 const prisma={execucao:{findMany:jest.fn().mockResolvedValue([{execucao_id:10,filial_id:1,periodo_id:12},{execucao_id:20,filial_id:1,periodo_id:11},{execucao_id:30,filial_id:2,periodo_id:12}])},execucao_funcionario:{groupBy:jest.fn().mockResolvedValue([])},execucao_queue:{groupBy:jest.fn().mockResolvedValue([])},execucao_funcionario_base:{findMany:jest.fn().mockResolvedValue([{execucao_id:10,codcoligada:1,funcionario_id_rm:'001'},{execucao_id:10,codcoligada:1,funcionario_id_rm:'002'},{execucao_id:20,codcoligada:1,funcionario_id_rm:'001'},{execucao_id:20,codcoligada:1,funcionario_id_rm:'003'}])}};
 const reports={options:jest.fn().mockResolvedValue(options),variation:jest.fn().mockResolvedValue({execucaoAtual:10,execucaoAnterior:20,rows:rows()})};
 return {options,prisma,reports,service:new AssistenteComparacao(prisma as unknown as PrismaService,reports as unknown as OperationalReportsService)};
}

it('reutiliza snapshots, controla população e não soma dias nem regras alteradas a reais',()=>{
 const s=resumirVariacao(rows());
 expect(s.pago).toEqual(['0','100.25','100.25']);expect(s.desconto).toEqual(['10','10','0']);expect(s.comparaveis).toBe(3);expect(s.comVariacao).toBe(2);expect(s.regrasAlteradas).toBe(1);expect(s.versoesAlteradas).toBe(1);
});
it('não usa o cadastro atual como classificação monetária histórica',()=>{
 const parcial=JSON.stringify({nome:pago.nome,expressao:pago.expressao,versao:1});
 const rs=variationRows([person('001',[result(pago,'20',parcial)])],[person('001',[result(pago,'10')])],true,true);
 expect(resumirVariacao(rs).pago).toEqual([null,null,null]);expect(resumirVariacao(rs).classificacaoAusente).toBe(1);
 const legacy=JSON.stringify({...pago,snapshot_origem:'CONFERENCIA_LEGADO'});
 expect(resumirVariacao(variationRows([person('001',[result(pago,'20',legacy)])],[person('001',[result(pago,'10')])],true,true)).historicoAusente).toBe(1);
});
it('gera tabela por filial sem filtros, preserva zero e declara ausência de execução anterior',async()=>{
 const f=fixture(),r=await f.service.responder({pergunta:'Compare a competência ativa com a anterior por filial'},'operator');
 expect(r.competencia).toBe('09/2026 × 08/2026');expect(f.reports.variation).toHaveBeenCalledWith(12,11,1,10000);
 const a=r.tabela!.linhas[0],b=r.tabela!.linhas[1];expect(a.length).toBe(r.tabela!.colunas.length);
 expect(a.slice(1,7)).toEqual(['0','100.25','100.25','10','10','0']);expect(a.slice(7,12)).toEqual([2,2,1,1,1]);
 expect(b.slice(1,7)).toEqual([null,null,null,null,null,null]);expect(b[23]).toBe('Sem execução anterior');expect(r.texto).not.toMatch(/selecione|informe/i);
});
it('não escolhe silenciosamente entre execuções duplicadas',async()=>{
 const f=fixture();f.prisma.execucao.findMany.mockResolvedValue([{execucao_id:10,filial_id:1,periodo_id:12},{execucao_id:11,filial_id:1,periodo_id:12},{execucao_id:20,filial_id:1,periodo_id:11}]);
 const r=await f.service.responder({pergunta:'comparar competências com anterior'},'admin');expect(r.tabela!.linhas[0][23]).toBe('Execuções duplicadas');expect(f.reports.variation).not.toHaveBeenCalled();
});
it('limites e lotes em voo impedem consolidar valores parciais como completos',async()=>{
 const f=fixture();f.reports.variation.mockRejectedValue(new VariationLimitError());
 const r=await f.service.responder({pergunta:'comparar competência anterior'},'admin');expect(r.tabela!.parcial).toBe(true);expect(r.tabela!.linhas[0][23]).toBe('Limite de comparação');
 const g=fixture();g.prisma.execucao_queue.groupBy.mockResolvedValue([{execucao_id:10,_count:1}] as never);
 const s=await g.service.responder({pergunta:'comparar competência anterior'},'admin');expect(s.tabela!.linhas[0][23]).toBe('Em processamento');expect(g.reports.variation).not.toHaveBeenCalled();
 expect(()=>variationRows(current,previous,true,true,[],1)).toThrow(VariationLimitError);
});
it('rejeita usuário sem perfil e não amplia a seleção de períodos',async()=>{
 const f=fixture();await expect(f.service.responder({pergunta:'comparar'},'guest')).rejects.toThrow();expect(f.reports.options).not.toHaveBeenCalled();
 await expect(f.service.responder({pergunta:'comparar',periodoId:11},'operator')).rejects.toThrow('ativa');
 expect(competenciaAnterior('01/2026')).toBe('12/2025');expect(pedidoComparacaoHistorica('Gere um dashboard da competência ativa com a anterior')).toBe(false);expect(pedidoComparacaoHistorica('Gere um dashboard comparando a competência ativa com a anterior por filial')).toBe(true);
});
it('roteia a comparação ao serviço histórico antes de consultar o modelo ou o SQL',async()=>{
 const f=fixture(),comparison={responder:jest.fn().mockResolvedValue({texto:'Histórico real'})};
 const fetch=jest.spyOn(global,'fetch').mockRejectedValue(new Error('Não deve chamar o modelo'));
 try{
 const service=new AssistenteAvancado({} as AssistenteConsultas,f.reports as unknown as OperationalReportsService,{} as AssistenteConhecimento,{} as AssistenteSql,{} as AssistenteInvestigacao,comparison as unknown as AssistenteComparacao);
 const r=await service.responder({pergunta:'Gere dashboard comparando a competência ativa com a anterior por filial',filialId:9},'operator','gpt-institucional',{modelo:'teste',chave:'teste'},null,[]);
 expect(r.texto).toBe('Histórico real');expect(comparison.responder).toHaveBeenCalledWith(expect.objectContaining({filialId:undefined}),'operator');expect(fetch).not.toHaveBeenCalled();
 }finally{fetch.mockRestore();}
});
