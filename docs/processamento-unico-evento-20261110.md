# Tela única de processamento e evento RM — 2026-11-10

## Comportamento
- Detalhes e labels exibem evento da formulaUtilizada registrada no cálculo. Cadastro atual não substitui evento histórico ausente. Legado de conferência é identificado como indisponível.
- Endpoint da lista recebe projeção de nome, evento, tipo e versão do snapshot; não expõe expressão completa nem altera banco/cálculos.
- Cinco abas substituídas por uma tela; fila/histórico de falhas e envio RM ficam em seções recolhíveis. URLs antigas com aba continuam abrindo a seção correspondente.
- Ações da filial acima da busca sempre omitem baseIds. Ações em cada linha passam exclusivamente o ID daquela pessoa, sem seleção. Recálculo de concluídos continua explícito. Seleção múltipla permanece apenas como opção de envio RM.
- Mobile apresenta dados e ações empilhados; botões individuais com 44px de altura. Avatar e lógica da IA preservados.

## Validação
Build API Nest e frontend TypeScript/Vite aprovados. Aviso preexistente de bundle grande.
node ops/check-processing-presentation.cjs: aprovado. Testa snapshot diferente do cadastro atual, zeros à esquerda, legado ausente/inválido, escopo filial/pessoa, recálculo e remoção das abas.
Navegador autenticado: evento da fórmula v9 visível na label e no modal; referência parametrizada preservada como gravada, sem inventar código resolvido. Desktop 1440x1000 e mobile 390x844; página útil de 375px sem transbordamento, ações de 159,6x44px. Busca, abertura de resultado e seções recolhíveis conferidas. Não foram disparados cálculos nem envios reais para testar.

## Publicação e retorno
Base criada da produção atual com alterações limitadas, hashes e lock de publicação.
- event-rm-20261110: API e web, backup /opt/valeexpresso/releases/event-rm-20261110/backup (imagens e fontes anteriores). Sem migração de banco.
- oneview-20261110: web, backup /opt/valeexpresso/releases/oneview-20261110/backup.
- oneview-mobile-20261110: acabamento web, backup /opt/valeexpresso/releases/oneview-mobile-20261110/backup.
Bundle final /assets/index-CFj-ekVK.js. Health checks de páginas, bundle e API aprovados. As duas últimas publicações mantiveram o container da API.
Para retorno, conferir mudanças posteriores antes de restaurar fontes e imagens dos backups. O primeiro backup antecede toda esta rodada; os demais permitem retorno incremental.
