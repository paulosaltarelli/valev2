import type { ResultadoAssistente } from './assistente-tipos';

export type OrientacaoInicial = {
  estado: 'pronto' | 'aguardando_fila' | 'indisponivel';
  texto?: string;
  competencia?: string;
  fonte?: string;
  consultadoEm?: string;
  links?: ResultadoAssistente['links'];
};

// Uma leitura por sessão/competência, sem armazenar tabelas ou interferir no chat.
export class AssistenteInicio {
  private readonly cache = new Map<
    string,
    { expira: number; valor: OrientacaoInicial }
  >();
  private readonly pendentes = new Map<string, Promise<OrientacaoInicial>>();

  async consultar(
    chave: string,
    filaAtiva: () => Promise<boolean>,
    gerar: () => Promise<ResultadoAssistente>,
  ): Promise<OrientacaoInicial> {
    if (await filaAtiva()) {
      this.cache.delete(chave);
      return { estado: 'aguardando_fila' };
    }
    const agora = Date.now();
    for (const [key, item] of this.cache)
      if (item.expira <= agora) this.cache.delete(key);
    const existente = this.cache.get(chave);
    if (existente) return existente.valor;
    const pendente = this.pendentes.get(chave);
    if (pendente) return pendente;
    const tarefa = (async (): Promise<OrientacaoInicial> => {
      try {
        const r = await gerar();
        // Uma fila pode ter começado enquanto o modelo respondia. Não mostre a análise nesse caso.
        if (await filaAtiva()) return { estado: 'aguardando_fila' };
        if (
          !r.agente?.ferramentas.some((t) =>
            ['consultar_operacao', 'investigar_grupo', 'executar_sql'].includes(
              t,
            ),
          ) ||
          !r.competencia ||
          r.texto.trim().length < 30
        )
          throw new Error(
            'A orientação precisa de dados operacionais consultados.',
          );
        const valor: OrientacaoInicial = {
          estado: 'pronto',
          texto: r.texto.replace(/\*\*/g, ''),
          competencia: r.competencia,
          fonte: r.agente.ferramentas.some((t) =>
            [
              'investigar_grupo',
              'investigar_funcionario',
              'buscar_codigo',
            ].includes(t),
          )
            ? 'Banco do Vale e regras do sistema'
            : 'Banco do Vale',
          consultadoEm: r.consultadoEm,
          links: r.links,
        };
        this.gravar(chave, valor, 30 * 60_000);
        return valor;
      } catch {
        // Falhas não bloqueiam a página nem geram novas chamadas a cada atualização.
        const valor: OrientacaoInicial = { estado: 'indisponivel' };
        this.gravar(chave, valor, 60_000);
        return valor;
      } finally {
        this.pendentes.delete(chave);
      }
    })();
    this.pendentes.set(chave, tarefa);
    return tarefa;
  }

  private gravar(chave: string, valor: OrientacaoInicial, duracao: number) {
    if (this.cache.size >= 200)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(chave, { valor, expira: Date.now() + duracao });
  }
}

export const perguntaInicial =
  'Faça uma orientação proativa para a tela inicial, na competência selecionada e em todas as filiais ativas autorizadas. Consulte primeiro pendências e erros; se houver erros, use investigar_grupo para examinar evidências do banco, logs e código. Organize o texto por filial: diga quantos funcionários ou registros precisam de atenção, explique o significado dos erros em linguagem simples, indique o que conferir e o próximo passo mais seguro. Priorize corrigir a coleta antes de sugerir cálculo ou envio. Distinga evidência de hipótese e declare o que falta confirmar. Considere cálculos parciais, fórmulas pendentes e filiais sem execução conforme os dados retornados. Não conclua que ausência de cálculo significa zero ou que todo cálculo foi perdido. Se não houver erros, informe as pendências realmente encontradas; só diga que está tudo em ordem quando as consultas sustentarem isso. Responda com até 220 palavras, com nomes de filiais e passos práticos; preserve as identidades pessoais nesta visão inicial; apresente somente as filiais. Não peça filtros, não ofereça nem gere arquivos, não descreva ações como já realizadas e não execute alterações. Escreva para usuários sem conhecimento técnico: traduza os códigos em uma explicação e uma verificação prática. Evite nomes internos de variáveis e fórmulas, siglas de estados, caminhos de arquivos e termos como snapshots. Por exemplo, explique a ausência do vínculo esperado como algo a conferir no cadastro e no retorno da consulta, sem afirmar que foi excluído. Use texto simples com parágrafos curtos. Esta é uma análise automática de leitura, não uma ordem de processamento.';
