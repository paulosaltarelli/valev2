import { OperacaoService } from './operacao.service';

describe('Pendências de todas as filiais da competência', () => {
  it('conta a execução atual de cada filial e reconsulta o escopo ao executar', async () => {
    const findMany = jest.fn().mockResolvedValueOnce([{execucao_id: 20, filial_id: 2}, {execucao_id: 11, filial_id: 1}])
      .mockResolvedValueOnce([{execucao_id: 21, filial_id: 2}, {execucao_id: 11, filial_id: 1}]);
    const service = new OperacaoService({execucao: {findMany}} as never, {} as never);
    const candidates = jest.spyOn(service as any, 'candidates').mockImplementation(async (_tx, p: any) => {
      expect(p.execucaoIds).toEqual([11, 20]);
      expect(p.somentePendencias).toBe(true);
      return p.etapa === 'VARIAVEIS' ? [{execucaoId: 11, reason: ''}, {execucaoId: 20, reason: ''}, {execucaoId: 20, reason: 'Etapa já agendada'}]
        : [{execucaoId: 20, reason: ''}];
    });
    expect(await service.periodPendingScope(13)).toEqual({VARIAVEIS: {elegiveis: 2, bloqueados: 1, filiais: 2}, VALORES: {elegiveis: 1, bloqueados: 0, filiais: 1}});
    expect(findMany).toHaveBeenCalledWith({where: {periodo_id: 13}, orderBy: {execucao_id: 'desc'}, distinct: ['filial_id'], select: {execucao_id: true, filial_id: true}});
    const execute = jest.spyOn(service, 'execute').mockResolvedValue({status: true, message: 'ok'});
    await service.executePeriodPending(13, 'VALORES', 7, 'session');
    expect(execute).toHaveBeenCalledWith({etapa: 'VALORES', execucaoIds: [21, 11], somentePendencias: true}, 7, 'session');
    expect(candidates).toHaveBeenCalledTimes(2);
  });

  it('não cria execuções nem dispara uma competência sem processamentos', async () => {
    const service = new OperacaoService({execucao: {findMany: jest.fn().mockResolvedValue([])}} as never, {} as never);
    expect(await service.periodPendingScope(99)).toEqual({VARIAVEIS: {elegiveis: 0, bloqueados: 0, filiais: 0}, VALORES: {elegiveis: 0, bloqueados: 0, filiais: 0}});
    await expect(service.executePeriodPending(99, 'VARIAVEIS', 1, 'session')).rejects.toThrow('Nenhuma execução');
    await expect(service.executePeriodPending(99, 'ENVIAR_RM', 1, 'session')).rejects.toThrow('variáveis ou fórmulas');
    await expect(service.periodPendingScope(-1)).rejects.toThrow();
  });
});
