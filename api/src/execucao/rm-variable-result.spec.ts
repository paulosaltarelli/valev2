import { isRmVariableFailureFinal, readRmVariable } from './rm-variable-result';

describe('isRmVariableFailureFinal', () => {
  it('encerra a tentativa se a consulta respondeu com um resultado inválido', () => {
    expect(isRmVariableFailureFinal({ status: true })).toBe(true);
  });

  it.each([400, 401, 403, 404, 405, 410, 422])('encerra erros HTTP %i de requisição ou acesso', (status) => {
    expect(isRmVariableFailureFinal({ status: false, http: { status } })).toBe(true);
  });

  it.each([undefined, 408, 429, 500, 503])('mantém a repetição para falhas transitórias HTTP %s', (status) => {
    expect(isRmVariableFailureFinal({ status: false, http: { status } })).toBe(false);
  });
});

describe('readRmVariable', () => {
  it('interpreta ausência de ocorrências como zero nas consultas conhecidas', () => {
    expect(readRmVariable('PVE.AFASTAMENTOS', [{ RESULTADO: null }])).toBe(0);
    expect(readRmVariable('PVE.ATESTADO', [{}])).toBe(0);
    expect(readRmVariable('PVE.FALTAINJUST', [])).toBe(0);
  });

  it('preserva zero explícito e sinaliza ausência em parâmetros de cálculo', () => {
    expect(readRmVariable('PVE.KM_CALCULO', [{ RESULTADO: 0 }])).toBe(0);
    expect(readRmVariable('PVE.KM_CALCULO', [{}])).toBeNaN();
    expect(readRmVariable('PVE.REGRA_PGTO', [])).toBeNaN();
    expect(readRmVariable('PVE.ATESTADO', { data: [] })).toBeNaN();
  });

  it.each(['PVE.D.TRAB.REAL', 'PVE.VR_FIXO', 'PVE.KM_CALCULO'])(
    'converte RESULTADO nulo em zero para %s',
    (query) => expect(readRmVariable(query, [{ RESULTADO: null }])).toBe(0),
  );
});
