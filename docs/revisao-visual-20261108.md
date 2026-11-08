# Revisão visual de 08/11/2026

Referência: Processamentos. Ajustes compartilhados de densidade, filtros, tabelas, foco e paginação; resumo operacional com menos caixas; indicadores secundários recolhidos; nomes alinhados à esquerda; status textuais; atalhos de variáveis e fórmulas por filial. Formulários adaptados para celular e lista de variáveis do editor de fórmulas recolhida por padrão. Expressões longas têm prévia limitada e consulta completa. Ordenação usa os valores originais das datas e nomes.

Validação: TypeScript e Vite no build Docker; navegação autenticada por Visão geral, Processamentos/detalhes/variáveis, KM, Filiais/Variáveis/Fórmulas, Competências, Usuários e os cinco relatórios. Conferência em 1366×900 e 390×844, tema claro/escuro, busca de filial, atalhos e datas. A janela de variáveis apresentou apenas um contêiner de rolagem vertical. Nenhum processamento disparado durante a revisão.

Publicação somente do frontend, copiando a fonte de produção e sobrepondo os arquivos desta revisão. Assistente Vale IA preservado. Contêiner da API permaneceu inalterado.

Backup anterior à revisão na Hostinger:
`/opt/valeexpresso/releases/clean-20261108/backup/`

Contém `source-before.tar.gz`, `web-before.tar` e `manifest.json`; imagem `valeexpresso-web:before-clean-20261108`. Backups incrementais das correções: `clean-fix-20261108`, `clean-formulas-20261108` e `clean-pagination-20261108`, também em `/opt/valeexpresso/releases/`.

Para reverter esta revisão inteira, um operador deve restaurar o arquivo de fontes do primeiro backup, carregar/retaggear sua imagem como `valeexpresso-web:latest` e recriar somente `web` com `docker compose -f /opt/valeexpresso/app/deploy/compose.vps.yml up -d --no-deps --no-build web`. Antes, verificar se houve outras publicações: restaurar a imagem antiga também reverte alterações de frontend posteriores. Não restaurar banco nem reiniciar API para esta reversão.
