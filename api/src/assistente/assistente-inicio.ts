import type { ResultadoAssistente } from './assistente-tipos';

export type OrientacaoInicial = {
  estado: 'pronto' | 'aguardando_fila' | 'indisponivel';
  texto?: string;
  orientacao?: ResultadoAssistente['orientacao'];
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
          orientacao: r.orientacao,
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

export const perguntaInicial = 'Prepare uma orientação inicial extremamente direta para a competência selecionada, usando exclusivamente as evidências consultadas. Preencha orientacao com no máximo 6 linhas: filial, erro, possivelCausa, investigar. Use frases de até 12 palavras por célula, no máximo 100 palavras no conjunto. Uma linha por filial com erro. Agrupe filiais sem execução em uma única linha, por exemplo “15 filiais sem execução”; não enumere seus nomes nem repita explicações. Não crie grupos genéricos de pendências sem erro nem repita indicadores de cálculo ou envio que a tela já mostra. Se não houver erros nem filiais sem execução, use uma única linha com a pendência principal confirmada. Em possivelCausa, escreva “A confirmar” quando faltar evidência, ou “Não se aplica” para processo não iniciado. Sugira somente a verificação pertinente à etapa da falha, sem presumir exclusão de vínculo ou outra causa não confirmada. Não confunda execução aberta com tarefas em execução: as filas foram verificadas vazias. Evite nomes de funcionários, códigos internos, nomes técnicos de variáveis, fórmulas, números de execução, caminhos de código e explicações genéricas. Prefira “Falha na coleta de dados” a códigos como ERRO_VARIAVEIS. Não peça filtros, não ofereça arquivos, não inicie nem altere dados. O campo texto deve ser apenas uma frase curta de apresentação, como “Prioridades identificadas nesta competência.”; não escreva parágrafos nem uma tabela Markdown. Para ações de ferramenta, orientacao deve ficar vazio. A tela apresentará as linhas em tabela com competência, fonte e horário.';