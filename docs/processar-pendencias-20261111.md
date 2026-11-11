# Processar pendências — 2026-11-11

O atalho agora inclui erros e etapas não executadas, com opções Processar variáveis e Calcular fórmulas. A quantidade cobre a filial inteira, independentemente da página ou busca. O servidor exclui etapas já agendadas/em andamento e revalida o estado no momento do disparo.

Variáveis: início (PREVIA/sem status) e falhas de variáveis. Fórmulas: somente pessoas com etapa de variáveis pronta, incluindo resultados faltantes, inválidos, com erro ou fórmulas ativas ainda sem registro. Concluídos e enviados são preservados, inclusive zeros.

O novo pedido somentePendencias reutiliza a proteção da fila contra reinicialização dos resultados válidos. Na coleta de variáveis, as memórias existentes são mantidas e somente códigos ausentes são inseridos. Nenhuma migração. O fluxo anterior somenteErros permanece compatível para clientes antigos. Os erros clicáveis da tabela foram mantidos.

Publicação inicial: pendencias1-20261111; complemento de elegibilidade: pendencias2-20261111. Backup de fontes e imagens em /opt/valeexpresso/releases/pendencias1-20261111/backup e /opt/valeexpresso/releases/pendencias2-20261111/backup. Overlay sobre a fonte corrente, protegido por hashes, lock e ausência de tarefas em processamento. Sem alterações no comportamento da IA.

Validação: testes isolados de retentativa/pendências e regras de transporte; compilação API e frontend. Cobertura de não processados, bloqueio por variáveis não prontas, fórmulas ausentes, contagens e enfileiramento, manutenção de valores/revisões e memória já preenchida. Nenhum processamento ou envio ao RM real disparado para validação.

O seletor considera apenas fórmulas ativas e as regras atuais; registros de fórmulas desativadas permanecem históricos e não geram disparos vazios. Teste específico cobre resultados antigos com erro de fórmula inativa. Bundle frontend index-BsrNZXcU.js.

Validação final: 16 testes aprovados. Desktop 1440×1000 e mobile 390×844, incluindo opções desabilitadas quando não há pendências. Após a publicação complementar, consulta somente leitura da API retornou 3 pendências de fórmulas na execução 3459, zero na 3461 e 3 na 3464; nenhuma pendência de variáveis nesses três recortes. A sessão visual expirou após o último restart; o frontend permaneceu no mesmo bundle já validado.
