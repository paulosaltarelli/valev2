# Concorrência no processamento de variáveis

`VARIABLE_CONCURRENCY=4` permite até quatro funcionários simultâneos por processo da API. Valores de 1 a 4 são aceitos; configuração ausente ou inválida usa 4. Defina 1 e recrie a API para voltar ao comportamento sequencial.

Cada funcionário continua consultando suas variáveis em sequência, com seu próprio cache entre fórmulas. O limite é compartilhado entre o batch e o endpoint de processamento integral que usam a mesma instância de ExecucaoService. As fórmulas, parâmetros PVE e interpretação de RESULTADO foram preservados. Os resultados são persistidos depois que todos os funcionários daquele lote terminam; uma falha inesperada também aguarda o encerramento das tarefas antes de retornar.

O limite é por processo: não multiplicar instâncias da API sem coordenação distribuída das filas. Não é um limite global de todas as operações RM: consultas de criação de execução, login, geolocalização e envio possuem caminhos próprios.

Testes específicos:

```bash
npm test -- --runInBand --runTestsByPath src/utils/limited-executor.spec.ts src/execucao/execucao.variables.spec.ts
```

Os testes verificam limite compartilhado, encerramento após erro, equivalência da memória entre 1 e 4 funcionários, zero válido, variável fixa, cache entre fórmulas e isolamento de falhas. Utilizam RM e banco simulados; não medem a capacidade do RM real. O ganho de tempo em produção precisa ser medido durante processamento autorizado.

## Leitura do lote e diagnóstico de desempenho

O processamento de variáveis usa uma consulta própria: carrega configuração, período e funcionários selecionados, sem trazer resultados anteriores e memória de toda a execução. As dependências de cada fórmula são extraídas uma vez por lote, preservando a ordem existente.

Uma comparação somente de leitura, em 04/11/2026, na execução 1314 com 165 funcionários retornou 2.708.797 bytes no carregamento integral e 16.915 bytes no contexto de 25 funcionários, redução de 99,38% no JSON retornado. Esse número mede volume, não redução do tempo total ou consumo máximo de RAM; nenhuma consulta ao RM foi executada nessa comparação.

No caminho batch, `[variables.batch]` registra duração do lote, concorrência, funcionários com sucesso/erro, acertos do cache e contagem/tempo acumulado/máximo por sentença. O tempo por sentença inclui autenticação local e comunicação com o RM; não é duração isolada do SQL remoto. As durações acumuladas podem superar o tempo do lote por causa da concorrência. Respostas completas e parâmetros por funcionário não são mais registrados nos logs de sucesso desse caminho. A memória de cálculo e os logs de erro continuam disponíveis.

Os testes também conferem a seleção dos funcionários e o resumo agregado de desempenho, sem payload de funcionário ou sessão.
