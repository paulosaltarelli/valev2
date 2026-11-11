# Visão geral gráfica e eventos históricos — 11/11/2026

## Alterações
- Botão Processar pendências em cada competência da Visão geral, reutilizando o fluxo existente de variáveis/fórmulas e preservação de sucessos.
- Indicadores circulares clicáveis, contagens e percentuais; azul para cálculo e verde reservado à conclusão de envio ao RM.
- Evolução financeira e agregação por evento usam evento_calculo.valor do snapshot do cálculo, sem consultar RM ou configuração atual da fórmula. Snapshot legado não comprovado é mostrado como Evento não registrado.
- Descontos mantidos em cinza, inclusive gráfico e tabela.
- Rolagem horizontal da tabela financeira contida no próprio bloco no mobile.
- Simulação dos testes recebeu a coleção de fórmulas exigida pelo contrato atual; nenhuma alteração no motor do outro agente.

## Validação
- Build API e frontend aprovado.
- 4 suítes / 23 testes aprovados: retry-errors, transport-rules, period-pending, operation-progress.
- 7 casos SQL somente leitura: evento salvo, literal histórico, expressão não resolvida, JSON inválido, evento nulo, snapshot legado e zeros à esquerda.
- Consulta real somente leitura e relatório publicado: R066 = 4.828,80; R161 = 61,60; R244 = 0,00. Total 4.890,40 inalterado.
- Navegador: competência 10/2026 com 3 pendências de fórmulas e zero variáveis; 09/2026 com 948 pendências; modal abre a competência correta.
- Nenhum processamento, recálculo ou envio ao RM disparado durante QA.

## Publicação e reversão
- Publicação principal: /opt/valeexpresso/releases/painel-grafico2-20261111/backup (imagens API/web, fontes anteriores e manifesto).
- Bundle principal: index-jqgpR7m8.js.
- Complemento responsivo: /opt/valeexpresso/releases/painel-mobile1-20261111/backup (frontend).
- Candidate montado sobre fontes atuais, com guardas de hash e lock de publicação para preservar alterações concorrentes.
- Para reversão, usar as imagens e manifesto da publicação correspondente, restaurando apenas arquivos registrados. A publicação principal inclui um arquivo novo explicitado no manifesto.
