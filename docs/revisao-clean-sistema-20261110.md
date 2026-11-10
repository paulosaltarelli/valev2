# Revisão visual compartilhada — 10/11/2026

Publicado em `clean-system2-20261110`, bundle `/assets/index-Cx3a7Tqh.js`.
Backup de código e imagem web: `/opt/valeexpresso/releases/clean-system2-20261110/backup`.

## Escopo
- Visão geral prioriza competências ativas e alertas. Indicadores secundários ficam em seção expansível.
- Contadores dos cadastros passam a uma linha compacta, sem cartões individuais.
- Filtros, totais e tabelas dos relatórios usam menos bordas, preenchimentos e textos.
- Rótulos de Filiais, KM, Variação e Evolução financeira simplificados.
- Mobile mantém filtros recolhíveis, navegação expansível e rolagem horizontal restrita às tabelas densas.
- Nenhuma alteração em APIs, cálculos, envio RM ou funcionalidades da IA.

## Publicação e validação
Aplicação preparada sobre cópia atual da produção, com hashes dos arquivos, guarda contra alterações concorrentes e trava de publicação. Apenas o container web foi recriado; API preservada.

Build TypeScript/Vite e `node ops/check-processing-presentation.cjs` aprovados; `git diff --check` sem erros.

Revisão no navegador autenticado em desktop e viewport mobile de 390×844: Visão geral, Filiais, Competências, Usuários, Fórmulas, Variáveis, KM e cinco relatórios. Verificados abertura dos indicadores, filtros do Fechamento, menu mobile e leitura das tabelas. Nenhum cálculo ou envio ao RM disparado para testar o visual.

Limites: Extrato sem execução elegível no recorte; Variação sem resultados para filial selecionada; Falhas sem ocorrências; Evolução sem envios RM. Esses relatórios foram inspecionados nos estados disponíveis, sem simular dados. KM validado no estado inicial. Evidências visuais locais em `auditoria/clean-system-20261110`, fora do Git para não versionar dados operacionais.

## Retomada
Para reverter, restaurar somente os arquivos e a imagem web do backup acima, sob a mesma trava de publicação. Conferir alterações posteriores antes da restauração e não restaurar API ou banco.
