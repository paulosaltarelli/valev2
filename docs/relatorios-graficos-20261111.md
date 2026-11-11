# Relatórios gráficos — 11/11/2026

## Escopo publicado
- Fechamento: resumo clicável por situação, barras de cálculo e envio por filial e links com filtros válidos da tela única.
- Variação: indicadores clicáveis de resultados alterados, iguais e sem comparação; setas e cores azul/roxo para direção, sem sinalizar sucesso financeiro.
- Valores por funcionário: filtros visuais de cálculo completo, pendências e erros; erro expansível e atalho para o funcionário no processamento. Retorno preserva competência, filial, execução, busca e recorte.
- Falhas: filtros gráficos por etapa e link direto para funcionários quando há uma única filial afetada.
- Estilos isolados com prefixo vrg para evitar conflito com a biblioteca Remix Icon.
- Verde reservado aos indicadores de envio confirmado ao RM. Dados e exportações continuam usando as fontes existentes.

## Publicação
- Backend, cálculos, filas, banco e funcionalidades do agente de IA não alterados.
- Fontes atuais de produção como base, overlay restrito, guardas SHA-256 e lock de deploy.
- Backup inicial: /opt/valeexpresso/releases/relatorios-graficos2-20261111/backup.
- Backup de ajuste de estilos: /opt/valeexpresso/releases/relatorios-estilo1-20261111/backup.
- Bundle final: index-D2J8FGii.js.
- Para voltar integralmente ao visual anterior, usar a imagem web e o manifesto do backup inicial; o backup de estilos reverte apenas o complemento.

## Validação realizada
- TypeScript e Vite aprovados; health check e bundle publicados conferidos.
- Fechamento: clique em Com erro filtrou uma filial; atalho abriu filtro pendencias e retorno manteve foco=erro.
- Falhas: etapa sem ocorrências apresentou estado vazio; Cálculo retornou a causa existente. Mobile de 390 px sem alargar a página.
- Variação: matriz apresentou 102 resultados = 31 alterados + 65 iguais + 6 sem comparação; filtro Com variação exibiu 31 linhas. Setas de aumento/redução conferidas. Mobile sem alargar a página.
- Nenhum processamento, recálculo ou envio ao RM disparado para QA.

## Achado preexistente de dados
O Fechamento usa closingCounts sobre todos os resultados persistidos, enquanto Processamentos aplica seu critério operacional atual. Em Bicas, o Fechamento retornou zero funcionários completos e o detalhe operacional mostrou 104 de 107. A origem deve ser investigada na consulta do relatório (resultados ativos/históricos e estados), sem mudar o motor de cálculo. Não foi mascarada nem recalculada nesta rodada visual.
