import { readRmVariable } from './rm-variable-result';

describe('readRmVariable', () => {
  it('interpreta ausência de ocorrências como zero nas consultas conhecidas', () => {
    expect(readRmVariable('PVE.AFASTAMENTOS', [{ RESULTADO: null }])).toBe(0);
    expect(readRmVariable('PVE.ATESTADO', [{}])).toBe(0);
    expect(readRmVariable('PVE.FALTAINJUST', [])).toBe(0);
  });

  it('preserva zero explícito e sinaliza ausência em parâmetros de cálculo', () => {
    expect(readRmVariable('PVE.KM_CALCULO', [{ RESULTADO: 0 }])).toBe(0);
    expect(readRmVariable('PVE.KM_CALCULO', [{ RESULTADO: null }])).toBeNaN();
    expect(readRmVariable('PVE.REGRA_PGTO', [])).toBeNaN();
    expect(readRmVariable('PVE.ATESTADO', { data: [] })).toBeNaN();
  });
});
