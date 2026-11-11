# Retentativa somente de falhas — 2026-11-11

## Comportamento

- Atalho Tentar novamente erros com contadores de funcionários elegíveis para Variáveis e Valores, cobrindo toda a filial independentemente de busca/página.
- A API revalida a falha atual dentro do lock da execução antes de enfileirar. Pessoas já resolvidas, filas ativas ou pausadas não são disparadas. Pendência sem erro não entra nesta ação.
- Payload somenteErros preservado na fila; o claim não reinicializa resultados concluídos nessa modalidade. O motor de valores ignora fórmulas válidas; o de variáveis preserva suas memórias. Botões normais de recálculo permanecem com o comportamento existente.
- Rótulos de falha na tabela são botões acessíveis que abrem mensagens individuais armazenadas. Nenhuma consulta ao RM para exibir os erros.

## Publicação e reversão

Release retry-errors1-20261111. Bundle index-DJ2oOJho.js. Backup de fontes e imagens de API/web em /opt/valeexpresso/releases/retry-errors1-20261111/backup. Não houve migração nem execução de processamento para teste.

O overlay foi aplicado sobre cópia recente da aplicação em produção. Hashes e snapshot completo de fontes impediram sobrescrita concorrente; publicação aguardou ausência de itens PROCESSANDO. A branch ux/retentativa-erros-20261111 registra primeiro a fonte já publicada por outros agentes (commit de base), seguida apenas desta alteração. A base inclui funcionalidades existentes de IA, filas e regras de transporte; não são mudanças criadas nesta tarefa.

## Validação

Build Nest/Prisma e TypeScript/Vite aprovados. 13 testes isolados sem rede (retentativa e regras de transporte) aprovados: exclusão de concluídos e itens ativos, revalidação após mudança de estado, recusa de envio RM pelo modo somenteErros, preservação de valor/revisão enviado e memória válida.

No navegador, execução 3461: 14 funcionários elegíveis em Variáveis, zero em Valores; erro individual de consulta RM aberto pelo rótulo. Desktop 1440×1000 e mobile 390×844. Nenhum botão de execução ou envio foi acionado.

Execução 3464: 3 falhas elegíveis de Valores em 107 funcionários pendentes; zero de Variáveis. Mensagens de fórmula não numérica e evento RM ausente abertas pelo rótulo, também no mobile.
