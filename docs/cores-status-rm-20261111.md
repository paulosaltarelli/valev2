# Cores de conclusão no processamento — 2026-11-11

Azul identifica cálculos concluídos e Pronto para envio. Verde fica reservado ao envio confirmado ao RM. Barras de variáveis, fórmulas e funcionários permanecem azuis em 100%; apenas a barra RM completa fica verde. A mesma distinção se aplica aos cards e ao status dos funcionários nos detalhes. Erros permanecem vermelhos.

Alteração exclusivamente de apresentação em quatro componentes. Sem mudanças na API, cálculos, filas ou integração RM. Publicação somente do frontend sobre fonte atual de produção, com guardas de hash e lock. Backup da imagem e fontes em /opt/valeexpresso/releases/status-rm1-20261111/backup.

Validação: build TypeScript/Vite aprovado, saúde HTTP e bundle index-BgnURBAk.js confirmados. Navegador autenticado em desktop 1440x1000 e mobile 390x844: barras de cálculo e Pronto para envio em azul (rgb 22,79,157); somente barra RM completa e Enviado ao RM em verde (rgb 23,100,65). Evidências desktop.png e mobile.png em auditoria/status-rm-20261111. Nenhum processamento ou envio real disparado.
