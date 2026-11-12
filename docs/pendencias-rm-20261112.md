# Pendências e seleção de filiais — 12/11/2026

Publicação frontend: `pendencias-rm-20261112`; bundle `index-D7MZ36ib.js`.
Backup no host: `/opt/valeexpresso/releases/pendencias-rm-20261112/backup` (imagem web, fontes e manifesto).

- Selecionar todas as filiais marca as execuções atuais exibidas, com contagem e envio conjunto pelo contrato existente de elegibilidade.
- Processar pendências inclui envio ao RM na competência e na filial. A consulta exclui confirmações existentes, cálculos incompletos, atividades em fila e confirmações ambíguas.
- Cartão Erros filtra as filiais e direciona aos funcionários com erro, incluindo variáveis, fórmulas e RM.
- Nenhum endpoint ou cálculo foi alterado. Publicação recriou somente o serviço web.

Validação: testes do contrato de seleção/pedidos, TypeScript e build Vite aprovados. Navegador autenticado: 15 de 15 filiais selecionadas, contagem de elegíveis e exclusões; filtro de erros com links `filtro=erros`; modal responsivo com três ações. Desktop 1440x1000 e mobile 390x844. Nenhum envio ou recálculo disparado durante QA.

A fila preexistente permanece em acompanhamento separado. Não confundir esta publicação com conclusão dos envios. Erros de regra de cálculo preservados.
