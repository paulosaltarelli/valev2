# Relatórios operacionais

## Fechamento por filial

Rota `/fechamento`, na área de Análise. Uma linha por filial ativa atualmente ou com execução na competência selecionada. Usa a execução de maior identificador por filial/competência para impedir duplicação de históricos legados.

Completos, parciais e sem cálculo dividem os funcionários registrados na execução. A contagem de erros se sobrepõe a essas categorias. Enviados e aguardando envio dividem os cálculos completos; “aguardando” não é garantia de elegibilidade imediata nem confirmação de recebimento externo. A confirmação de envio usa o status registrado e a revisão enviada atual. Sem execução, as contagens são desconhecidas e aparecem como travessão, não zero.

## Variação entre competências

Rota `/variacao-competencias`. Escolha filial, competência atual e outro período anterior. A seleção inicial usa o período anterior cadastrado mais próximo; os dois períodos aparecem explicitamente. Uma linha por funcionário e fórmula, com valor calculado anterior, atual, diferença, percentual e situação. Não utiliza o valor final ajustado.

Funcionários são relacionados por coligada e matrícula dentro da filial escolhida. Fórmulas são relacionadas por nome normalizado, evento, tipo e polaridade. Snapshots válidos com mesma versão e expressão são necessários para calcular a variação. Correspondências ambíguas e fórmulas alteradas não produzem diferença automática. A presença em apenas uma execução não é classificada como admissão ou desligamento. Não há inferência de vínculo trabalhista.

Ausência de execução, ausência de cálculo e erro não viram zero. Um valor calculado zero permanece numérico. Com base anterior zero, a diferença absoluta pode ser calculada, mas não o percentual. Bases negativas usam seu valor absoluto no denominador. Os cálculos usam Decimal para preservar precisão.

## Interface e exportação

O padrão é o de Processamentos: filtros, tabela, paginação de 25 linhas, explicações expansíveis e links de retorno. Não há áreas internas com rolagem vertical; tabelas largas permitem rolagem horizontal. O Excel inclui todas as linhas do recorte filtrado, não apenas a página visível, e uma aba Contexto com filtros e critérios.

## Acesso e validação

Consultas autenticadas, Cache-Control no-store, IDs validados e nenhuma alteração em dados, filas ou RM. Testes cobrem contagens parciais, zero, revisão enviada, ausência de execução, alterações de fórmula, snapshots indisponíveis, ambiguidade e separação de coligadas. A validação em produção é somente leitura. A inspeção visual completa em navegador segue pendente.
