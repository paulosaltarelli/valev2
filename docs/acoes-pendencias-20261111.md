# Ações e funcionários com fórmulas pendentes — 2026-11-11

O filtro antigo consultava apenas status de erro e excluía funcionários com resultados ainda não calculados. O filtro agora usa o complemento do critério de conclusão por funcionário; a busca continua combinada com o filtro e a paginação permanece em 25 pessoas. O resumo de fórmulas oferece acesso direto à lista.

Processar variáveis e Calcular valores solicitam recálculo também para etapas já concluídas. Foram removidas opções duplicadas na filial e no modal individual. O envio ao RM e as proteções de fila permanecem no backend. O rótulo da linha considera resultados incompletos e falhas individuais.

Publicação por overlay de três arquivos sobre fonte atual de produção, com comparação de hashes, lock e backup de código e imagens. Nenhuma migração ou alteração de dados. Release principal: actions2-20261111; complemento visual: actions3-20261111. Backups: /opt/valeexpresso/releases/actions2-20261111/backup e /opt/valeexpresso/releases/actions3-20261111/backup.

Validação: build API e TypeScript/Vite; ops/check-processing-presentation.cjs; filtro real da execução 3459 retornou 121 pessoas, página 1 de 5; página 2 e busca combinada retornando uma pessoa verificadas no navegador. Modal individual contém somente os dois botões de etapa. Nenhum processamento ou envio ao RM disparado para teste.

Validação visual final: desktop 1440×1000 e mobile 390×844; sem overflow horizontal global no mobile. Rótulo Fórmulas pendentes confirmado após publicação; modal com dois botões sem duplicatas. Bundle final index-DQ-XrRcH.js.
