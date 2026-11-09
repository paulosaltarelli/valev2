# Dashboards e telas mais limpos — 09/11/2026

## Diretrizes confirmadas
- Processamentos é a referência do design system.
- Visão geral orienta decisões por alertas claros e ações; não deve listar filiais, execuções ou funcionários. Detalhamento permanece nas telas operacionais e relatórios.
- Este agente responde por design e usabilidade de todo o sistema, inclusive a interface da IA. O outro agente responde pelas funcionalidades da IA; preservar sua integração ao publicar.

## Implementação
- Visão geral: progresso das competências ativas e alertas de falhas, criação, envios, ausência de execução e andamento da fila. Links levam às telas responsáveis; sem listas operacionais. Gráficos/financeiro complementares recolhidos. Escopo dos filtros inferiores explícito. Total que misturava pessoas e itens de fila substituído pela composição por origem.
- Financeiro: sem gráficos vazios quando não há funcionários enviados; mensagem explica o recorte e oferece acesso aos valores calculados. Zeros e tabela histórica permanecem disponíveis. Mesmo tratamento no painel financeiro da home.
- Análise: nomes unificados em menu, título e abas. Abas duplicadas retiradas no desktop amplo, mantidas em telas menores.
- Fechamento: cinco colunas principais, situação antecipada, opção Exibir todas as contagens. Exportação continua completa.
- Variação: prioriza filiais com execução na competência atual, filtra inativas por padrão com opção de incluir, filtros de resultado recolhíveis e visíveis quando ativos. Histórico e ausência de cálculo preservados.
- Valores por funcionário: execução única como informação, erros resumidos com expansão por clique/teclado; todas as fórmulas e mensagens integrais permanecem acessíveis e no Excel.
- Falhas: descrição operacional junto ao código original, ordenação por impacto, aviso sobre pessoas em mais de uma causa.
- KM: estado inicial sem controles vazios; seleção conta itens e informa que cabeçalho seleciona a página. Corrigido rótulo que dizia Todas as filiais quando a operação exige uma filial.
- Processamentos: ajuda do cálculo recolhível; contadores e resultados parciais preservados.
- Tabelas: rótulos acessíveis de ordenação e paginação em português; seleção de KM por página.

## Publicação e reversão
Frontend compilado a partir da fonte de produção, com comparação de hashes antes da sobreposição. AdminLayout recebeu somente a mudança dos títulos, preservando AssistenteVale. API e banco não alterados.
Backup anterior à rodada: /opt/valeexpresso/releases/dashclean-20261109/backup.
Backup incremental da home sem listas: /opt/valeexpresso/releases/dashalerts-20261109/backup.
Cada backup contém source-before.tar.gz, web-before.tar e manifest.json. Tags anteriores: valeexpresso-web:before-dashclean-20261109 e valeexpresso-web:before-dashalerts-20261109.
Reversão da rodada inteira: verificar publicações posteriores; restaurar fontes e imagem do primeiro backup e recriar somente web com compose.vps.yml. Não restaurar banco nem reiniciar API.

## Verificação
TypeScript e Vite; hash do bundle servido nas 11 rotas; saúde da API e preservação do contêiner. Navegação autenticada: filtros de inativas, colunas opcionais, erros expansíveis, execução única, estado sem envios, KM vazio, tema escuro e celular. Sem disparar cálculos/envios reais. Dados com envio positivo e múltiplas execuções permanecem sujeitos às mesmas renderizações anteriores; não foram fabricados registros em produção para validá-los.
