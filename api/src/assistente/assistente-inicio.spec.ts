import { AssistenteInicio } from './assistente-inicio';
const resultado = {
  texto: 'Filial A: confira o vínculo antes de tentar novamente.',
  competencia: '10/2026',
  fonte: 'Banco do Vale',
  agente: {
    versao: 'v2' as const,
    ferramentas: ['investigar_grupo'],
    sqlExecutado: false,
  },
  tabela: {
    colunas: ['Funcionário'],
    linhas: [['DADO_PRIVADO']],
    parcial: false,
  },
};

it('não chama o modelo quando existe fila, inclusive pendente', async () => {
  const gerar = jest.fn();
  expect(
    await new AssistenteInicio().consultar('u:s:p', async () => true, gerar),
  ).toEqual({ estado: 'aguardando_fila' });
  expect(gerar).not.toHaveBeenCalled();
});
it('recupera uma saída inválida do modelo após o intervalo, sem armazená-la como orientação', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(100000);
  try {
    const s = new AssistenteInicio();
    const gerar = jest
      .fn()
      .mockResolvedValueOnce({ ...resultado, texto: '.' })
      .mockResolvedValueOnce(resultado);
    expect(await s.consultar('u:s:p', async () => false, gerar)).toEqual({
      estado: 'indisponivel',
    });
    clock.mockReturnValue(159999);
    expect(await s.consultar('u:s:p', async () => false, gerar)).toEqual({
      estado: 'indisponivel',
    });
    expect(gerar).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(160001);
    expect((await s.consultar('u:s:p', async () => false, gerar)).estado).toBe(
      'pronto',
    );
    expect(gerar).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});
it('omite caminhos técnicos da fonte e recusa uma análise vazia', async () => {
  const s = new AssistenteInicio();
  const r = await s.consultar(
    'valida',
    async () => false,
    async () => ({
      ...resultado,
      texto: '**Filial A**: confira o vínculo antes de tentar novamente.',
      fonte: 'Banco · api/src/arquivo.ts:24',
    }),
  );
  expect(r.fonte).toBe('Banco do Vale e regras do sistema');
  expect(r.texto).not.toContain('**');
  expect(
    await s.consultar(
      'vazia',
      async () => false,
      async () => ({ ...resultado, texto: '.' }),
    ),
  ).toEqual({ estado: 'indisponivel' });
});
it('reaproveita por sessão e competência, sem retornar nem guardar tabelas', async () => {
  const s = new AssistenteInicio(),
    gerar = jest.fn().mockResolvedValue(resultado);
  const a = await s.consultar('u:s:p', async () => false, gerar);
  expect(await s.consultar('u:s:p', async () => false, gerar)).toEqual(a);
  expect(gerar).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(a)).not.toContain('DADO_PRIVADO');
  await s.consultar('outro:s:p', async () => false, gerar);
  await s.consultar('u:outra:p', async () => false, gerar);
  await s.consultar('u:s:outra', async () => false, gerar);
  expect(gerar).toHaveBeenCalledTimes(4);
});
it('descarta a análise se começar fila durante a geração', async () => {
  const fila = jest
    .fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  expect(
    await new AssistenteInicio().consultar(
      'u:s:p',
      fila,
      async () => resultado,
    ),
  ).toEqual({ estado: 'aguardando_fila' });
});
it('invalida o cache quando aparece fila e gera novamente ao terminar', async () => {
  const s = new AssistenteInicio(),
    gerar = jest.fn().mockResolvedValue(resultado);
  await s.consultar('u:s:p', async () => false, gerar);
  await s.consultar('u:s:p', async () => true, gerar);
  await s.consultar('u:s:p', async () => false, gerar);
  expect(gerar).toHaveBeenCalledTimes(2);
});
it('deduplica chamadas concorrentes e não inventa análise se não houver consulta real', async () => {
  const s = new AssistenteInicio();
  let liberar!: (r: typeof resultado) => void;
  const gerar = jest.fn(
    () =>
      new Promise<typeof resultado>((resolve) => {
        liberar = resolve;
      }),
  );
  const a = s.consultar('u:s:p', async () => false, gerar),
    b = s.consultar('u:s:p', async () => false, gerar);
  await Promise.resolve();
  liberar(resultado);
  expect(await a).toEqual(await b);
  expect(gerar).toHaveBeenCalledTimes(1);
  const semDados = jest.fn().mockResolvedValue({ texto: 'Tudo certo.' });
  expect(await s.consultar('u:s:sem', async () => false, semDados)).toEqual({
    estado: 'indisponivel',
  });
  await s.consultar('u:s:sem', async () => false, semDados);
  expect(semDados).toHaveBeenCalledTimes(1);
});
