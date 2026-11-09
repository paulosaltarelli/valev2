# Revisão mobile — menus e relatórios

- Troca de relatório recolhida por padrão abaixo de 1200px; destinos completos disponíveis ao expandir.
- Filtros dos cinco relatórios recolhidos abaixo de 700px; resumo do período, filial e filtros aplicados permanece visível. Valores por funcionário inclui a execução selecionada.
- Campos continuam montados: recolher não apaga valores, não muda buscas nem executa ações.
- Desktop mantém os filtros abertos e navegação pelo menu lateral.
- Menu lateral mobile com alvos de toque de 44px e uma área de rolagem.
- Tabelas preservadas; identificação fixa na rolagem horizontal e coluna de funcionário mais estreita no extrato.
- CSS usa os tokens de Processamentos, com suporte ao tema escuro.

## Validação e publicação
Build TypeScript/Vite aprovado. Aviso preexistente de bundle acima de 500 kB. Health checks das 11 rotas, asset e API aprovados; API não recriada.

No navegador: cinco relatórios acessados, abertura e fechamento de filtros, busca JUNDIAI preservada ao recolher (uma filial no resumo), troca de relatório e fechamento automático do menu lateral após navegação. Desktop 1366x900 mantém filtros visíveis. Mobile 390x844 e 360x800; no fechamento, largura do documento igual à área útil (345px em viewport de 360px). Navegação recolhida com 45,6px; filtros com cerca de 65px. Tema escuro conferido. Identificação dos status sem quebra de palavras.

Publicado asset /assets/index-DjpS9wTu.js. Backup anterior à rodada: /opt/valeexpresso/releases/mobileclean-20261109/backup. Backup antes do acabamento de CSS: /opt/valeexpresso/releases/mobilepolish-20261109/backup. Ambos contêm imagem anterior, fontes alteradas e manifesto. Para voltar toda a rodada, usar o primeiro backup; conferir alterações posteriores antes de restaurar fontes e remover o novo ReportFilters.tsx.

Nenhuma alteração nas funcionalidades da IA, cálculos, APIs ou exportações. Base montada a partir da produção, com guardas de revisão e bloqueio de deploy. Captura: auditoria/mobile-relatorios-20261109.jpg no workspace.
