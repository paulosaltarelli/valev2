# Operação por competência — 06/11/2026

A lista de processamentos passa a separar Variáveis, Valores e RM. A conferência reúne pessoa, evento, versão, fórmula, memória, ajustes e confirmações. Filtros e retorno ficam na URL; funcionários são carregados em páginas de 25.

Conferir um resultado ou uma seleção registra autoria e versão. Alterar ou recalcular invalida a conferência. A prévia de envio identifica novos eventos, atualizações e exclusões; a confirmação revalida o conjunto e rejeita dados alterados. O worker utiliza o evento aprovado e conserva recibos de versões anteriores.

## Validação

- Builds de API e interface em Docker.
- 24 cenários de integração em SQL Server isolado, incluindo ajuste transacional, versão, concorrência, prévia desatualizada, conferência por seleção, falha e repetição do worker, criação e atualização de evento.
- 17 testes de regressão em quatro suítes: variáveis, executor limitado, controle de chamadas RM e calculadora.
- Migração aplicada duas vezes no banco descartável, confirmando reexecução.
- Inspeção visual com 15 filiais e 966 pessoas fictícias, filtros, seleção por página, revisão de valores, memória, temas claro/escuro e largura de 390 px.

Os testes do worker usam RM simulado. Não há envio financeiro real nos testes. Tempos e ganhos de produtividade dependem de validação com operadores; a inspeção não constitui certificação de acessibilidade.

## Publicação

No servidor, a candidata fica em `/opt/valeexpresso/releases/operacao-20261106-candidate`. O arquivo `source-commit` identifica o commit publicado. As imagens finais são `valeexpresso-api:operacao-candidate` e `valeexpresso-web:operacao-candidate`.

`python3 ops/publish-operacao.py` recusa filas ativas, valida a candidata, guarda e verifica banco, fontes e imagens anteriores, aplica a migração aditiva e troca API/interface. Em falha após parar a API, tenta restaurar automaticamente a aplicação anterior. O manifesto registra hashes e imagens efetivamente publicadas.

Backup da aplicação: `/opt/valeexpresso/releases/operacao-20261106`.

Backup do banco: `/opt/valeexpresso/backups/operacao-20261106-before.bak`, com COPY_ONLY, CHECKSUM e RESTORE VERIFYONLY. Esse arquivo não usa o padrão de retenção dos backups diários.

Após publicar, executar `ops/smoke-operacao.cjs` dentro da API, com `NODE_PATH=/app/node_modules:/app/dist`. Esse script consulta o resumo, uma página e um resultado, sem modificar dados ou chamar RM. Verificar também a URL pública e os arquivos publicados.

## Voltar à versão anterior

Em uma sessão SSH no servidor, com filas concluídas:

```sh
python3 /opt/valeexpresso/releases/operacao-20261106/rollback.py
```

A reversão verifica os hashes, restaura fontes e imagens e preserva o banco e as colunas aditivas. Não restaura automaticamente o backup de banco, pois isso descartaria alterações posteriores à publicação. Uma restauração do banco exige avaliar os dados novos e planejar a interrupção.

O script se recusa a sobrescrever uma versão diferente desta release. Não apagar o manifesto, os backups ou as imagens anteriores enquanto a reversão precisar estar disponível.
