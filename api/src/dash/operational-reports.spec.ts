import { closingCounts, variationRows, type ReportPerson, type ReportResult } from './operational-reports';

const formula = { formula_id:1,nome:'Valor futuro',versao:1,tipo:'V',expressao:':A * 2',codEvento:'10',polaridade:'+' };
const result = (value: string | null, overrides: Partial<ReportResult> = {}): ReportResult => ({
  formula,formula_snapshot:JSON.stringify(formula),status:value===null?'PREVIA':'PROCESSADO',valor_calculado:value,
  revisao:2,enviado_revisao:null,_count:{memoria_calculo:0},...overrides,
});
const person = (r: ReportResult[], overrides: Partial<ReportPerson> = {}): ReportPerson => ({
  funcionario_id_rm:'001',codcoligada:1,nome_funcionario:'Pessoa',status:'RESULTADOS_PROCESSADOS',execucao_funcionario:r,...overrides,
});
describe('operational reports',()=>{
  it('partitions complete, partial and unstarted employees while preserving overlapping errors',()=>{
    const counts=closingCounts([
      person([result('0')]),
      person([result(null,{_count:{memoria_calculo:2}})],{status:'ERRO_VARIAVEIS'}),
      person([],{status:'PREVIA'}),
      person([result('8',{status:'ENVIADO_RM',enviado_revisao:2})],{status:'ENVIADO_RM'}),
    ]);
    expect(counts).toEqual({total:4,completos:2,parciais:1,semCalculo:1,comErro:1,aguardandoEnvio:1,enviados:1});
  });
  it('does not count an old RM revision as sent',()=>{
    expect(closingCounts([person([result('5',{status:'ENVIADO_RM',enviado_revisao:1})])]).enviados).toBe(0);
  });
  it('calculates decimal differences for comparable snapshots',()=>{
    const row=variationRows([person([result('120.15')])],[person([result('100.10')])],true,true)[0];
    expect(row.diferenca).toBe('20.05');expect(row.percentual).toBe('20.03');
  });
  it('keeps a zero base numeric without inventing a percentage',()=>{
    const row=variationRows([person([result('12')])],[person([result('0')])],true,true)[0];
    expect(row.anterior).toBe('0');expect(row.diferenca).toBe('12.00');expect(row.percentual).toBeNull();
    expect(row.situacao).toBe('Sem base percentual');
  });
  it('never treats absent calculation or errors as zero',()=>{
    const row=variationRows([person([result(null,{status:'ERRO'})])],[person([result('10')])],true,true)[0];
    expect(row.atual).toBeNull();expect(row.diferenca).toBeNull();expect(row.situacao).toBe('Erro de cálculo');
  });
  it('does not compare changed formulas or missing snapshots',()=>{
    const previous=[person([result('10')])];
    expect(variationRows([person([result('20',{formula_snapshot:JSON.stringify({...formula,versao:2})})])],previous,true,true)[0].situacao).toBe('Fórmula alterada');
    expect(variationRows([person([result('20',{formula_snapshot:null})])],previous,true,true)[0].diferenca).toBeNull();
  });
  it('distinguishes missing execution from a person absent in an existing execution',()=>{
    expect(variationRows([person([result('10')])],[],true,false)[0].situacao).toBe('Sem execução anterior');
    expect(variationRows([person([result('10')])],[],true,true)[0].situacao).toBe('Só na atual');
  });
  it('does not match equal employee numbers in different companies',()=>{
    const rows=variationRows([person([result('10')])],[person([result('10')],{codcoligada:2})],true,true);
    expect(rows).toHaveLength(2);expect(rows.every(r=>r.diferenca===null)).toBe(true);
  });
  it('flags ambiguous formula matches instead of adding incompatible values',()=>{
    const row=variationRows([person([result('10'),result('20',{formula:{...formula,formula_id:2}})])],[person([result('5')])],true,true)[0];
    expect(row.situacao).toBe('Fórmula ambígua');expect(row.atual).toBeNull();
  });
  it('handles negative bases and empty executions',()=>{
    const row=variationRows([person([result('-80')])],[person([result('-100')])],true,true)[0];
    expect(row.percentual).toBe('20.00');expect(variationRows([],[],true,true)).toEqual([]);
  });
  it('keeps configured formulas visible when processing stopped before creating a result',()=>{
    const rows=variationRows([person([],{status:'ERRO_VARIAVEIS'})],[person([result('10')])],true,true,[formula]);
    expect(rows).toHaveLength(1);expect(rows[0].formula).toBe('Valor futuro');
    expect(rows[0].atual).toBeNull();expect(rows[0].situacao).toBe('Erro de cálculo');
  });
  it('flags duplicated employee identities instead of choosing one value silently',()=>{
    const row=variationRows([person([result('10')]),person([result('20')])],[person([result('5')])],true,true)[0];
    expect(row.situacao).toBe('Matrícula duplicada');expect(row.atual).toBeNull();expect(row.diferenca).toBeNull();
  });
});
