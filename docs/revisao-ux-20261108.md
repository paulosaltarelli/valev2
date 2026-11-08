# Revisão de UX/UI — 08/11/2026

Referência visual: Processamentos. Revisão por código; não substitui a inspeção visual das telas renderizadas em desktop e celular.

## Correção prioritária: progresso parcial

O indicador antigo contava funcionários inteiramente concluídos. Uma falha em uma variável removia todo o funcionário dessa contagem, mesmo existindo variáveis salvas. Os indicadores novos contam variáveis únicas por funcionário e resultados por fórmula. Zero é um resultado válido. O percentual soma variáveis e fórmulas calculadas, divididas pelo total previsto; o envio ao RM continua separado. Não é uma estimativa de tempo restante.

As contagens por funcionário e os alertas de erro permanecem disponíveis. Memórias repetidas em fórmulas distintas não duplicam o avanço. A consulta agrega as memórias no banco sem carregar os valores pessoais. O total usa as fórmulas ativas e snapshots disponíveis; alterações posteriores na configuração podem mudar o total previsto de uma execução ainda não calculada. Os resultados aparecem depois de persistidos pelo processamento em lote.

## Ajustes implementados

| Área | Ajuste | Benefício |
|---|---|---|
| Processamentos e detalhes | Variáveis e fórmulas calculadas; unidade explícita; avanço parcial | Evita interpretar uma falha parcial como ausência de processamento |
| Visão geral | Mesmos indicadores das competências ativas | Evita regras diferentes entre home e operação |
| Análise | Navegação direta entre extrato, causas de falha e evolução financeira | Ajuda a escolher o relatório sem reabrir o menu |
| KM | Ações com área clicável maior e padrão azul; títulos legíveis | Melhora reconhecimento e uso por teclado |
| KM | Ausência de KM exibida como ausente, sem conversão automática para zero | Evita informação enganosa |
| Cadastros, variáveis e fórmulas | Botões de ação com dimensões consistentes | Melhora acesso sem aumentar a altura de todas as linhas |
| Tabelas | Busca, paginação e mensagens em português localmente; foco visível | Reduz dependência externa e padroniza interação |
| Telas menores | Filtros ocupam a largura disponível; navegação de relatórios quebra linhas | Evita controles espremidos |

Os componentes de modal continuam com uma única área de rolagem vertical no corpo. A tabela larga do extrato mantém rolagem horizontal para preservar uma linha por funcionário. Não foram adicionadas alturas fixas nem novas áreas de rolagem vertical.

## Próximos relatórios sugeridos

1. **Fechamento por filial e competência**: uma linha por filial, funcionários previstos, completos, parciais, com erro, aguardando envio e enviados ao RM. Atalhos filtrados para resolver cada pendência. Útil em produção, sem depender de múltiplas execuções da mesma competência.
2. **Conciliação com o RM**: por funcionário e evento, valor calculado, valor enviado, confirmação e diferença. Só apresentar valor efetivamente recebido quando houver confirmação consultável; não inferir recebimento apenas porque entrou na fila.
3. **Variação entre competências**: comparação do valor de cada fórmula com o mês anterior, diferença absoluta e percentual. Separar admissões/desligamentos, fórmula alterada, erro e ausência de cálculo. Para base anterior zero, exibir “sem base percentual”.
4. **Pendências de dados**: variáveis ausentes/ inválidas, KM ausente e regras sem configuração; agrupar por filial e causa, com quantidade de pessoas afetadas e acesso direto à correção.

## Verificação visual ainda necessária

Conferir em navegador desktop e celular: navegação de relatórios, foco de teclado, tema escuro, modais de cadastros e tabela larga do extrato. A presente revisão não declara esses cenários visualmente aprovados apenas por compilarem.
