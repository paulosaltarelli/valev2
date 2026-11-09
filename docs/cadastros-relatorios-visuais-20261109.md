# Cadastros e relatórios visuais — 09/11/2026

## Escopo
- Resumos compactos com ícones e totais em filiais, competências, usuários, fórmulas e variáveis.
- Status ativos com cor e marcador; os rótulos permanecem legíveis sem depender da cor.
- Nome da filial sempre visível nas telas de fórmulas e variáveis.
- Fechamento destaca número de filiais com erro e aguardando envio, respeitando os filtros. Essas contagens podem se sobrepor.
- Valores por funcionário usa resumo compacto e legenda expansível.
- Falhas por causa compara magnitude com a maior causa do recorte. Barras não representam percentual de conclusão nem devem ser somadas.
- Nenhuma alteração em API, processamento, exportação ou funcionalidades da IA.

## Publicação
Candidata reconstruída sobre a produção após detectar publicação concorrente. Guardas de hash, bloqueio exclusivo e backup antes de trocar apenas o frontend.

## Validação
Build TypeScript/Vite aprovado, com aviso existente de tamanho de bundle. Publicado asset /assets/index-BhKySXII.js. Health check de 11 rotas, asset e API aprovado; contêiner da API não foi recriado.

Navegador: filiais, competências, usuários, fórmulas, variáveis, fechamento, falhas e valores por funcionário carregados. Contexto da filial visível; fechamento filtrado por JUNDIAI reduziu resumo para uma filial. Validado em 1366x900, 390x844 e tema escuro. No móvel, largura do documento igual à área útil (375px). Sem executar cadastros, cálculos ou envios para validar esta rodada.

Backup: /opt/valeexpresso/releases/visualclean2-20261109/backup (source-before.tar.gz, web-before.tar, manifest.json). Imagem anterior: valeexpresso-web:before-visualclean2-20261109. Para reverter, usar imagem anterior e restaurar somente os arquivos do manifesto, removendo o novo VisualSummary.tsx; verificar antes eventuais alterações posteriores de outros agentes.

A produção foi preservada como base; apenas arquivos visuais do manifesto foram sobrepostos. Nenhuma mudança em componentes funcionais da IA.
