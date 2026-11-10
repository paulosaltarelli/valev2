# Tabela de resultados e barra compacta

Publicado: 10/11/2026, release table4-20261110, bundle index-D7XRya06.js.

Uma linha por funcionário no desktop, com colunas dinâmicas agrupadas pela variável de evento. Pagamento, Desconto e Reembolso têm ordem estável; outros eventos e múltiplas fórmulas no mesmo grupo continuam visíveis. Valores, dias e evento histórico permanecem vinculados aos detalhes originais. Ajustes manuais continuam indicados. O acesso a todas as variáveis fica na linha; ações individuais ficam no botão de mais opções. No mobile, os mesmos dados se reorganizam sem rolagem horizontal ou uma segunda barra vertical.

Os três painéis operacionais foram substituídos por uma barra com Processar variáveis, Calcular valores e Enviar ao RM. Fila e falhas abre um modal; Mais opções mantém seleção para envio, Gestão de KM e recálculo explícito. A busca não altera o escopo da filial. A seleção altera somente o envio. Nenhuma alteração de regras, API, cálculo, fila ou IA.

Publicação somente web, construída sobre fonte atual de produção, preservando as alterações concorrentes de datas. Guardas de hash e lock de publicação. Backup anterior à tabela em /opt/valeexpresso/releases/table2-20261110/backup; backup anterior à barra compacta em /opt/valeexpresso/releases/table4-20261110/backup. Ambos contêm imagem web e fontes para retorno. API não foi recriada.

Validação: TypeScript e Vite passaram; regressão de snapshot e escopos filial/pessoa passou. Navegador autenticado em 1440×1000 e 390×844: resultados históricos, variáveis, ações individuais, fila e seleção de uma pessoa conferidos. Seleção apresentou Enviar 1 ao RM e foi encerrada sem envio. Largura da página igual à viewport nos testes; contêiner desktop sem barra vertical interna. Nenhum processamento ou envio real disparado nesta rodada visual.

Evidências locais: auditoria/table-20261110/desktop.png e mobile.png no workspace principal.
