# Eventos preservados na revisão do cálculo

Publicado em 10/11/2026: event-snapshot2-20261110.
Backup: /opt/valeexpresso/releases/event-snapshot2-20261110/backup (fontes e imagens API/web).

O cálculo captura o código textual da variável de evento e grava evento_calculo em formula_snapshot e no histórico CALCULO, com referência, origem e data. A leitura não consulta RM. O envio usa o código salvo. Recálculo cria nova revisão, preservando o histórico anterior. Falha na captura impede registrar o cálculo como concluído. Sem migração de banco.

Agrupamento por EVENTOPAG/EVENTODES/EVENTOREE preservado. Legados sem registro exibem "Evento não registrado neste cálculo"; não há preenchimento retroativo com cadastro atual. Precisam de recálculo explícito para registrar evento.

Validação: builds API/web; testes isolados na imagem publicada sem rede para persistência, revisão, cache por lote, leitura sem RM, envio com código salvo e tratamento de falha; regressão de apresentação passou. Navegador autenticado confirmou agrupamentos e aviso de legado. Nenhum processamento real ou envio RM disparado para teste.

Deploy preparado sobre fonte atual de produção, preservando mudanças concorrentes de batching e locks. Guardas de hash, lock de publicação e rollback habilitados.
