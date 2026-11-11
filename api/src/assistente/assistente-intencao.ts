import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssistenteDto, Intent, intents } from './assistente.dto';

export function intencaoLocal(texto: string): Intent {
  const pergunta = texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (/como (funciona|usar)|o que (e|significa)|^ajuda/.test(pergunta))
    return 'ajuda';
  if (/compar|anterior|mudou|diferenc/.test(pergunta)) return 'comparacao';
  if (/financeir|saldo|desconto/.test(pergunta)) return 'financeiro';
  if (/\bkm\b|quilometr/.test(pergunta)) return 'km';
  if (/variav/.test(pergunta)) return 'variaveis';
  if (/por que|erro|falh|nao (teve|calculou)/.test(pergunta)) return 'erros';
  if (/valor|resultado|ajust/.test(pergunta)) return 'valores';
  if (/formula|vigencia/.test(pergunta)) return 'formulas';
  if (
    /penden|processamento|andamento|fila|status|dashboard|grafico/.test(
      pergunta,
    )
  )
    return 'pendencias';
  return 'esclarecer';
}

export async function selecionarConsulta(
  input: AssistenteDto,
  credencial?: { modelo: string; chave: string },
  exigirRespostaDoProvedor = false,
): Promise<Intent> {
  const provedor = input.provedor ?? 'local';
  if (provedor === 'gpt')
    throw new BadRequestException(
      'O login pessoal do ChatGPT aguarda liberação.',
    );
  if (provedor !== 'local' && !credencial)
    throw new BadRequestException(
      provedor === 'claude'
        ? 'Claude está desativado no Vale.'
        : 'GPT institucional está desativado no Vale.',
    );
  if (input.consulta) return input.consulta;
  const local = intencaoLocal(input.pergunta);
  if (provedor === 'local' || !credencial) return local;
  const instructions =
    'Classifique a pergunta sobre o Vale Expresso. Responda com exatamente uma opção: ' +
    intents.join(', ') +
    '. Use esclarecer quando faltar contexto ou a pergunta pedir alterações ou dados fora do catálogo.';
  try {
    const answer = (
      await consultarModelo(
        provedor,
        credencial,
        instructions,
        input.pergunta,
        32,
      )
    ).trim();
    if (intents.includes(answer as Intent)) return answer as Intent;
  } catch (error) {
    if (error instanceof ForbiddenException) throw error;
    if (!exigirRespostaDoProvedor && local !== 'esclarecer') return local;
    throw new ServiceUnavailableException(
      'O provedor está indisponível. Selecione uma consulta sugerida.',
    );
  }
  if (exigirRespostaDoProvedor)
    throw new ServiceUnavailableException(
      'O provedor não retornou uma classificação válida.',
    );
  return local;
}

export async function consultarModelo(
  provedor: 'claude' | 'gpt-institucional',
  credencial: { modelo: string; chave: string },
  instructions: string,
  pergunta: string,
  limite: number,
): Promise<string> {
  const { chave, modelo } = credencial;
  const gpt = provedor === 'gpt-institucional';
  try {
    const response = await fetch(
      gpt
        ? 'https://api.openai.com/v1/responses'
        : 'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(limite > 32 ? 25000 : 8000),
        headers: gpt
          ? {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + chave,
            }
          : {
              'Content-Type': 'application/json',
              'x-api-key': chave,
              'anthropic-version': '2023-06-01',
            },
        body: JSON.stringify(
          gpt
            ? {
                model: modelo,
                instructions,
                input: pergunta,
                store: false,
                max_output_tokens: limite,
              }
            : {
                model: modelo,
                system: instructions,
                messages: [{ role: 'user', content: pergunta }],
                thinking: { type: 'disabled' },
                max_tokens: limite,
              },
        ),
      },
    );
    if (response.status === 401 || response.status === 403) {
      throw new ForbiddenException(
        'O provedor recusou a chave. Confira o acesso à API e ao modelo.',
      );
    }
    if (response.status === 429) {
      const erro = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      const semCreditos = [
        'credit_balance_exhausted',
        'insufficient_quota',
      ].includes(erro?.error?.code ?? '');
      throw new ServiceUnavailableException(
        semCreditos
          ? 'O saldo de créditos da API institucional está esgotado. O administrador precisa verificar o faturamento do provedor.'
          : 'O provedor atingiu o limite temporário de uso. Aguarde e tente novamente.',
      );
    }
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
    if (!answer) throw new Error('Resposta vazia');
    return answer;
  } catch (error) {
    if (
      error instanceof ForbiddenException ||
      error instanceof ServiceUnavailableException
    )
      throw error;
    throw new ServiceUnavailableException(
      'Não foi possível obter uma resposta do provedor. Tente novamente.',
    );
  }
}
