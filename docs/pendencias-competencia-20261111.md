# Pendências de toda a competência — 2026-11-11

A tela principal de Processamentos oferece o mesmo modal Processar pendências usado na filial, com opções Variáveis e Fórmulas e quantidades de funcionários e filiais elegíveis. O escopo é explicitamente todas as filiais da competência selecionada; filtros da tabela e seleção de linhas não restringem o comando.

A API escolhe a execução mais recente de cada filial na competência (mesma ordenação da operação atual). Contagem e disparo consultam esse escopo no servidor; o disparo reconsulta as execuções, sem confiar em uma lista antiga enviada pelo navegador. O fluxo existente revalida as pendências e a fila sob lock antes de agendar, preservando valores, revisões e memórias concluídas. Não cria execuções e não envia ao RM.

GET e POST /operacao/competencia/:periodo/pendencias são autenticados. O POST aceita somente a etapa Variáveis ou Valores. Os contadores de filiais contam somente execuções com funcionários elegíveis.

Publicação pendencias-geral1-20261111, com backup de fontes e imagens em /opt/valeexpresso/releases/pendencias-geral1-20261111/backup. Patch aplicado sobre a fonte atual de produção, com verificações de hashes e lock, preservando mudanças concorrentes dos outros agentes. Nenhuma migração.

Validação concluída: compilação API e web, três suítes de testes aprovadas (escopo da competência, preservação de resultados e regras de transporte), saúde HTTP e bundle index-D4yRRB6I.js. Consulta somente leitura em produção e modal concordam: competência 10/2026, zero pendências elegíveis de variáveis e seis funcionários com fórmulas pendentes em duas filiais. O filtro de filial não restringe o comando global. Validado no navegador autenticado em 1440x1000 e 390x844, com botões zerados desabilitados e modal adaptado. Nenhum processamento ou envio ao RM disparado na validação. Evidências locais em auditoria/pendencias-geral-20261111/desktop.png e mobile.png.
