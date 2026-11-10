# Modais e indicadores — 10/11/2026

Publicação final: `modal-clean2-20261110`, bundle `/assets/index-BdC1tyUu.js`.
Backup anterior à rodada: `/opt/valeexpresso/releases/modal-clean-20261110/backup`.
Backup anterior à correção mobile: `/opt/valeexpresso/releases/modal-clean2-20261110/backup`.

## Alterações
- Modais de Filiais, Competências, Usuários, Fórmulas e Variáveis com largura, campos, espaçamentos e ações padronizados; rodapé preservado enquanto o corpo rola.
- Expressão da fórmula em textarea; rótulos de vigência menores e associação correta do campo de fim de vigência.
- Tabelas de cadastro mantêm ações em colunas com rolagem horizontal: o expansor responsivo exibia objetos DOM como texto e impedia edição mobile.
- Tabela de Processamentos com quatro indicadores independentes: variáveis, fórmulas, funcionários com valores calculados e funcionários enviados ao RM. Percentual, contagem e barra; azul pendente, verde concluído. Sem denominador, mostra travessão.
- Status da filial com badge destacado e ícone: azul em espera/andamento, verde calculado ou enviado, vermelho com erro. Erros têm prioridade. Cálculo completo não representa envio ao RM.
- O resumo só fornece erros agregados; o vermelho é aplicado ao status geral, sem inventar erros por etapa.

## Preservação e validação
Somente frontend; handlers e campos funcionais preservados, incluindo os campos de lotes RM adicionados por outro agente em produção. Overlay criado sobre snapshot atual, com hashes, trava de publicação e guarda contra alteração concorrente. API não recriada.

TypeScript/Vite aprovado nas duas publicações. Verificação existente `ops/check-processing-presentation.cjs` aprovada. Tentativa de renderização SSR local dos percentuais não executada por ausência de dependências locais; não conta como teste aprovado.

Navegador autenticado: modais de edição dos cinco cadastros abertos e cancelados no desktop e mobile 390×844; criação de competência e fórmula também inspecionada. Nenhuma gravação de cadastro, processamento ou envio RM durante QA. Capturas locais em `auditoria/modal-clean-20261110`.

Limite: Processamentos sem execuções nas competências consultadas durante QA. Indicadores compilados/publicados, mas ainda requerem inspeção visual com dados reais quando houver execuções. Não foram criadas execuções para contornar essa ausência.

Reversão: conferir alterações posteriores e restaurar somente fonte e imagem web do backup apropriado sob a trava de publicação. Não restaurar banco nem API.
