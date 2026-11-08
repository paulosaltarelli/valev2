import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssistenteDto, Intent, intents } from './assistente.dto';

export function provedores() {
  return [
    'local',
    ...(process.env.OPENAI_API_KEY ? ['gpt'] : []),
    ...(process.env.ANTHROPIC_API_KEY ? ['claude'] : []),
  ];
}

export function intencaoLocal(texto: string): Intent {
  const pergunta = texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (/como (funciona|usar)|o que (e|significa)|^ajuda/.test(pergunta))
    return 'ajuda';
  if (/compar|anterior|mudou|diferenc/.test(pergunta)) return 'comparacao';
  if (/financeir|saldo|desconto/.test(pergunta))
    return 'financeiro';
  if (/\bkm\b|quilometr/.test(pergunta)) return 'km';
  if (/variav/.test(pergunta)) return 'variaveis';
  if (/por que|erro|falh|nao (teve|calculou)/.test(pergunta)) return 'erros';
  if (/valor|resultado|ajust/.test(pergunta)) return 'valores';
  if (/formula|vigencia/.test(pergunta)) return 'formulas';
  if (/penden|processamento|andamento|fila|status|dashboard|grafico/.test(pergunta))
    return 'pendencias';
  return 'esclarecer';
}

export async function selecionarConsulta(
  input: AssistenteDto,
): Promise<Intent> {
  const provedor = input.provedor ?? 'local';
  if (!provedores().includes(provedor)) {
    throw new BadRequestException('Provedor indisponível no Vale.');
  }
  if (input.consulta) return input.consulta;
  const local = intencaoLocal(input.pergunta);
  if (provedor === 'local') return local;
  const instructions =
    'Classifique a pergunta sobre o Vale Expresso. Responda com exatamente uma opção: ' +
    intents.join(', ') +
    '. Use esclarecer quando faltar contexto ou a pergunta pedir alterações ou dados fora do catálogo.';
  const gpt = provedor === 'gpt';
  try {
    // Apenas o texto do usuário é enviado. Consultas, histórico e dados ficam no Vale.
    const response = await fetch(
      gpt
        ? 'https://api.openai.com/v1/responses'
        : 'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: gpt
          ? {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
            }
          : {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
        body: JSON.stringify(
          gpt
            ? {
                model:
                  process.env.VALE_OPENAI_MODEL || 'gpt-5.4-mini-2026-03-17',
                instructions,
                input: input.pergunta,
                store: false,
                max_output_tokens: 32,
              }
            : {
                model: process.env.VALE_CLAUDE_MODEL || 'claude-haiku-5-5',
                system: instructions,
                messages: [{ role: 'user', content: input.pergunta }],
                thinking: { type: 'disabled' },
                max_tokens: 32,
              },
        ),
      },
    );
    if (!response.ok) throw new Error('Resposta inválida do provedor');
    type TextPart = { type: string; text?: string };
    const body = (await response.json()) as {
      output?: { type: string; content?: TextPart[] }[];
      content?: TextPart[];
    };
    const parts = gpt
      ? body.output
          ?.filter((part) => part.type === 'message')
          .flatMap((part) => part.content ?? [])
      : body.content;
    const answer = parts
      ?.filter((part) => part.type === (gpt ? 'output_text' : 'text'))
      .map((part) => part.text)
      .join('')
      .trim();
    if (intents.includes(answer as Intent)) return answer as Intent;
  } catch {
    if (local !== 'esclarecer') return local;
    throw new ServiceUnavailableException(
      'O provedor está indisponível. Selecione uma consulta sugerida.',
    );
  }
  return local;
}
