# Menu simplificado

A lateral reúne Visão geral, Processamentos, Gestão de KM, Análise e Cadastros. Análise abre Fechamento por filial e mantém os cinco relatórios nas abas internas existentes. Cadastros abre Filiais e regras e oferece abas para Filiais, Competências e Usuários, inclusive nas páginas de variáveis e fórmulas.

O destaque da lateral considera todas as rotas da área, inclusive detalhes de processamento. Os links internos mantêm suas URLs anteriores. Cadastros e suas rotas continuam restritos ao perfil administrador; nenhuma permissão foi ampliada. O menu móvel fecha ao escolher um destino.

Publicação somente do frontend, sobre cópia da fonte atual de produção, preservando alterações paralelas. Backup anterior: `/opt/valeexpresso/releases/menu-20261108/backup/`, contendo `source-before.tar.gz`, `web-before.tar` e `manifest.json`. Imagem anterior: `valeexpresso-web:before-menu-20261108`.

Para reverter, conferir primeiro publicações posteriores, restaurar as fontes do backup e a imagem anterior como `valeexpresso-web:latest`, recriando apenas o serviço `web`. Não restaurar banco ou reiniciar API por causa desta mudança.

## Ajuste posterior: Análise expansível
A pedido do usuário, voltam os grupos Operação, Regras e cadastros e Administração, com seus acessos diretos. Processamentos mantém esse nome. Análise é um botão expansível com os cinco relatórios, inicia aberto em rotas de análise e permite recolher manualmente. As abas adicionais de Cadastros foram removidas. Permissões administrativas mantidas.

Release: /opt/valeexpresso/releases/accordion-20261108. Backup em backup/source-before.tar.gz e backup/web-before.tar; imagem anterior valeexpresso-web:before-accordion-20261108. Restauração: recuperar os arquivos do tar no diretório app, retag da imagem anterior para valeexpresso-web:latest e recriar somente web via compose.vps.yml, sem reiniciar API.
