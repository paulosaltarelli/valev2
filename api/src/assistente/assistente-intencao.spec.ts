import { consultarModelo } from './assistente-intencao';

it('lê somente a mensagem final estruturada, sem concatenar commentary', async () => {
  const original = global.fetch;
  const json = '{"tipo":"ferramenta"}';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      output: [
        {
          type: 'message',
          phase: 'commentary',
          content: [{ type: 'output_text', text: '{"tipo":"resposta"}' }],
        },
        {
          type: 'message',
          phase: 'final_answer',
          content: [{ type: 'output_text', text: json }],
        },
      ],
    }),
  });
  try {
    const result = await consultarModelo(
      'gpt-institucional',
      { modelo: 'teste', chave: 'teste' },
      'instruções',
      'pergunta',
      1800,
      { nome: 'teste', schema: {} },
    );
    expect(result).toBe(json);
    expect(JSON.parse(result)).toEqual({ tipo: 'ferramenta' });
  } finally {
    global.fetch = original;
  }
});
