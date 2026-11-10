# Valores e agrupamento de eventos — 2026-11-10

## Resultado
- Labels agrupadas por variável de evento, com pagamento, desconto e reembolso separados e código exibido no cabeçalho do grupo.
- Consulta de eventos também disponível no detalhe da fórmula e nas variáveis do funcionário. Tipo/versão permanecem acessíveis; referência de sintaxe não substitui o valor.
- Endpoint autenticado GET /operacao/:id/pessoas/:base/eventos valida vínculo base/execução. Consulta somente leitura, sem gravar memória, recalcular ou enviar eventos.
- Prioriza memória do cálculo, depois consulta atual do RM para a referência parametrizada registrada. Origem explicitada; cadastro atual não substitui evento histórico explicitamente vazio. Valores RM tratados como texto, incluindo códigos alfanuméricos e zeros iniciais.
- Consulta compartilhada por variável dentro do funcionário. Carregamento automático ao filtrar uma pessoa e nos detalhes; para listas maiores há botão por funcionário, evitando consultas em massa ao RM durante a navegação. Atualização manual disponível.
- Falhas/retorno vazio aparecem como erro, sem inventar código ou converter em zero.

## Validação
Build API e frontend aprovados. Teste isolado da API (sem rede/banco reais) verificou prioridade histórica, cache por pessoa, zeros, origem, retorno ausente, evento histórico nulo e vínculo da pessoa. Teste de apresentação e escopos anterior atualizado e aprovado.
Navegador autenticado: três códigos alfanuméricos reais apareceram nos grupos, no detalhe e no modal de variáveis. Desktop 1440x1000 e mobile 390x844; documento com 375px úteis sem transbordamento. Nenhum processamento, ajuste ou envio disparado para teste.

## Publicação
Release event-groups2-20261110; bundle /assets/index-CBM7m58k.js.
Backup de imagens API/web e fontes: /opt/valeexpresso/releases/event-groups2-20261110/backup.
Base montada da produção atual, hash e lock antes de publicar; health checks aprovados. Sem migração de banco, mudanças na fila/calculadora ou funcionalidades da IA.
A primeira candidata não foi publicada: o teste detectou substituição de evento histórico nulo pelo cadastro atual, corrigida antes da versão final.

Limite: consultas atuais não comprovam qual código teria sido resolvido no passado quando a variável não foi armazenada. Essa distinção aparece na interface e os valores históricos não são reescritos.
