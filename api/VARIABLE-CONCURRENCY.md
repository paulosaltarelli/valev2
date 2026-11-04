# Concorrência no processamento de variáveis

`VARIABLE_CONCURRENCY=4` permite até quatro funcionários simultâneos por processo da API. Valores de 1 a 4 são aceitos; configuração ausente ou inválida usa 4. Defina 1 e recrie a API para voltar ao comportamento sequencial.

Cada funcionário continua consultando suas variáveis em sequência, com seu próprio cache entre fórmulas. O limite é compartilhado entre o batch e o endpoint de processamento integral que usam a mesma instância de ExecucaoService. As fórmulas, parâmetros PVE e interpretação de RESULTADO foram preservados. Os resultados são persistidos depois que todos os funcionários daquele lote terminam; uma falha inesperada também aguarda o encerramento das tarefas antes de retornar.

O limite é por processo: não multiplicar instâncias da API sem coordenação distribuída das filas. Não é um limite global de todas as operações RM: consultas de criação de execução, login, geolocalização e envio possuem caminhos próprios.

Testes específicos:

```bash
npm test -- --runInBand --runTestsByPath src/utils/limited-executor.spec.ts src/execucao/execucao.variables.spec.ts
```

Os testes verificam limite compartilhado, encerramento após erro, equivalência da memória entre 1 e 4 funcionários, zero válido, variável fixa, cache entre fórmulas e isolamento de falhas. Utilizam RM e banco simulados; não medem a capacidade do RM real. O ganho de tempo em produção precisa ser medido durante processamento autorizado.
