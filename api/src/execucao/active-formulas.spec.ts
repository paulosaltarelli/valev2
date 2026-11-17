import { OperacaoService } from './operacao.service';
function fixture(missing=false,multiple=false) {
 const result=(id:number,formula_id:number,status='PROCESSADO')=>({
   execucao_funcionario_id:id,formula_id,codigo_regra_rm:multiple?'A':'',status,revisao:2,conferido_revisao:2,enviado_revisao:null,
   valor_final:status==='PROCESSADO'?10:null,valor_calculado:status==='PROCESSADO'?10:null,metadados_rm_id:null,formula_snapshot:null,
   formula:{formula_id,nome:'Teste',tipo:'V',codEvento:'R066'},
 });
 const base={
  execucao_id:1,execucao_funcionario_base_id:1,status:'RESULTADOS_PROCESSADOS',nome_funcionario:'Teste',funcionario_id_rm:'TEST01',codcoligada:1,codfilial:1,
  regras_rm:multiple?JSON.stringify(['A','B']):null,
  execucao:{controle_fila:null,filial:{nome:'Teste',formula:missing?[{formula_id:1},{formula_id:3}]:[{formula_id:1}]},periodo:{competencia:'10/2026',data_inicio:new Date('2026-10-01Z'),data_fim:new Date('2026-10-31Z')}},
  execucao_funcionario:[result(1,1),result(2,2,'PREVIA')],execucao_queue:[],
 };
 const db={
  execucao_funcionario_base:{findMany:jest.fn().mockResolvedValue([base])},
  resultado_historico:{findMany:jest.fn().mockResolvedValue([])},
  execucao_queue:{findMany:jest.fn().mockResolvedValue([])},
 };
 return {service:new OperacaoService(db as never,{} as never),db,base};
}
describe('Escopo operacional das fórmulas ativas',()=>{
 it('permite enviar quando a única pendência pertence a fórmula desativada e não inclui o evento desativado',async()=>{
  const {service}=fixture();
  const scope=await service.sendScope({etapa:'ENVIAR_RM',execucaoIds:[1]});
  expect(scope).toEqual({eligible:1,excluded:{}});
  const items=await (service as unknown as {candidates(db:unknown,p:unknown):Promise<Array<{eventos:unknown[]}>>}).candidates((service as unknown as {prisma:unknown}).prisma,{etapa:'ENVIAR_RM',execucaoIds:[1]});
  expect(items[0].eventos).toHaveLength(1);
 });
 it('não considera cálculo completo quando falta uma fórmula ativa',async()=>{
  const {service}=fixture(true);
  const scope=await service.sendScope({etapa:'ENVIAR_RM',execucaoIds:[1]});
  expect(scope.eligible).toBe(0);expect(scope.excluded).toHaveProperty('Cálculo incompleto');
 });
 it('exige todas as regras do funcionário para cada fórmula ativa',async()=>{
  const {service}=fixture(false,true);
  const scope=await service.sendScope({etapa:'ENVIAR_RM',execucaoIds:[1]});
  expect(scope.eligible).toBe(0);
 });
});
