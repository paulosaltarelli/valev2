import { reportCompletion } from './report-completion';
import { closingCounts, type ReportPerson } from './operational-reports';
const result=(id:number,rule='')=>({formula_id:id,codigo_regra_rm:rule,status:'PROCESSADO',valor_final:'0',revisao:2,enviado_revisao:null as number|null});
const base={status:'RESULTADOS_PROCESSADOS',regras_rm:null};
describe('report operational completion',()=>{
 it('keeps zero values complete and ignores inactive historical errors',()=>{
  expect(reportCompletion(base,[1],[result(1),{...result(2),status:'ERRO',valor_final:null}]).complete).toBe(true);
 });
 it('does not accept a missing active formula or an empty configuration',()=>{
  expect(reportCompletion(base,[1,2],[result(1)]).complete).toBe(false);
  expect(reportCompletion(base,[],[result(1)]).complete).toBe(false);
 });
 it('requires every saved transport rule and rejects duplicates',()=>{
  const multiple={...base,regras_rm:'["A","B"]'};
  expect(reportCompletion(multiple,[1],[result(1,'A'),result(1,'B')]).complete).toBe(true);
  expect(reportCompletion(multiple,[1],[result(1,'A'),result(1,'A')]).complete).toBe(false);
  expect(reportCompletion(multiple,[1],[result(1,'A')]).complete).toBe(false);
 });
 it('distinguishes calculation from confirmation of the current RM revision',()=>{
  expect(reportCompletion(base,[1],[result(1)]).sent).toBe(false);
  expect(reportCompletion(base,[1],[{...result(1),status:'ENVIADO_RM',enviado_revisao:1}]).sent).toBe(false);
  expect(reportCompletion(base,[1],[{...result(1),status:'ENVIADO_RM',enviado_revisao:2}]).sent).toBe(true);
 });
 it('counts a person once even with several failed formulas',()=>{
  const p={...base,funcionario_id_rm:'test',codcoligada:1,nome_funcionario:null,status:'ERRO_RESULTADOS',execucao_funcionario:[1,2].map(id=>({...result(id),status:'ERRO',valor_calculado:null,formula_snapshot:null,formula:{formula_id:id},_count:{memoria_calculo:1}}))} as ReportPerson;
  expect(closingCounts([p],[1,2])).toMatchObject({total:1,comErro:1,completos:0,parciais:1});
 });
});
