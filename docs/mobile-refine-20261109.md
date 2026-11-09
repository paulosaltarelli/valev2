# Refinamento mobile — 2026-11-09

CSS exclusivo abaixo de 700px: menu bloqueia rolagem do fundo e oculta launcher IA enquanto aberto; overscroll contido. Trocar relatório ganhou chevron explícito. Totais financeiros em duas colunas; indicadores comuns com grade consistente. Campos usam 16px no mobile e ajuda alinhada ao título.

Validado em produção no navegador: 390x844 e 360x800; menus Análise e Regras e cadastros, KM, Filiais, Competências e cinco relatórios. Filtros do extrato expandem e recolhem; troca de relatório funciona. Fundo do menu com overflow hidden e launcher hidden confirmados. Na variação, documento de 345px em viewport 360px (sem transbordamento horizontal da página). Desktop 1366x900 conserva apresentação. Captura mobile-refine-financeiro.png no diretório de visualizações.

Build TypeScript/Vite aprovado (aviso preexistente de tamanho do bundle). Publicado /assets/index-CAgeP9Ok.js. Backup /opt/valeexpresso/releases/mobile-refine-20261109/backup, imagem anterior valeexpresso-web:before-mobile-refine-20261109. Saúde de 11 rotas, asset e API verificada. API não recriada.

Pacote construído sobre produção atual, com guarda de hashes e lock. Nenhuma mudança em componentes, APIs, exportação, processamento ou lógica da IA do outro agente. Validação de layout em viewport simulado, não dispositivo físico.
