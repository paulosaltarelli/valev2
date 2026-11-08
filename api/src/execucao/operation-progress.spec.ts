import { operationProgress } from './operation-progress';

describe('operationProgress', () => {
  const formulas = [{ formula_id: 1, expressao: ':A + :B' }, { formula_id: 2, expressao: ':A * 2' }];
  it('preserves partial variables, deduplicating shared formula memories', () => {
    expect(operationProgress(formulas, ['A', 'B'], [], ['A', 'A'])).toEqual({
      variaveisCalculadas: 1, variaveisPrevistas: 2, formulasCalculadas: 0, formulasPrevistas: 2,
    });
  });
  it('counts zero-valued successful formulas but not failed or null results', () => {
    const results = [
      { formula_id: 1, formula_snapshot: null, status: 'PROCESSADO', valor_calculado: 0 },
      { formula_id: 2, formula_snapshot: null, status: 'ERRO', valor_calculado: 10 },
      { formula_id: 3, formula_snapshot: null, status: 'PROCESSADO', valor_calculado: null },
    ];
    expect(operationProgress(formulas, ['A', 'B'], results, ['A', 'B']).formulasCalculadas).toBe(1);
  });
  it('uses snapshots and excludes built-in scope parameters from variable totals', () => {
    const result = { formula_id: 1, formula_snapshot: JSON.stringify({ expressao: ':A + :KM' }),
      status: 'PROCESSADO', valor_calculado: 0 };
    expect(operationProgress([formulas[0]], ['A', 'B'], [result], ['A'])).toEqual({
      variaveisCalculadas: 1, variaveisPrevistas: 1, formulasCalculadas: 1, formulasPrevistas: 1,
    });
  });
  it('keeps an empty execution empty and supports constant formulas', () => {
    expect(operationProgress([], [], [], []).variaveisPrevistas).toBe(0);
    expect(operationProgress([{ formula_id: 1, expressao: '5' }], [], [], []).formulasPrevistas).toBe(1);
  });
  it('tolerates legacy snapshots and retains saved codes after config changes', () => {
    const result = { formula_id: 1, formula_snapshot: '{', status: 'ERRO', valor_calculado: null };
    const progress = operationProgress(formulas, ['A', 'B'], [result], ['OLD']);
    expect(progress.variaveisCalculadas).toBe(1);
    expect(progress.variaveisPrevistas).toBe(3);
  });
});
