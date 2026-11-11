# Visão geral por competência — 2026-11-11

Painel operacional separado por competência ativa. Indicadores clicáveis de variáveis, fórmulas e envios; percentual menor que 1% explícito para progresso não nulo. Verde reservado a envio confirmado, azul a cálculos e preparação de envio. Finalização da competência exige envio total, ausência de erro, fila, criação e filiais sem execução.

Alertas: erros com acesso ao modal existente de funcionários e mensagens; falhas de criação; filas interrompidas; pendências elegíveis de variáveis e fórmulas; funcionários elegíveis ao envio, inclusive filiais parcialmente prontas; filiais sem execução. Alertas zerados são omitidos. Contagens de elegibilidade vêm das consultas existentes do servidor, com atualização a cada 60 segundos; resumo e fila a cada 20 segundos. Falha na consulta aparece explicitamente, não como zero.

Detalhes sob demanda em modal, preservando competência, filial e etapa nos links. Nova execução recebe filial pré-selecionada e competência via URL, apenas abre o formulário; fila abre o modal existente. Nenhuma ação de criação, cálculo ou envio é executada pelos atalhos de navegação. Filiais do envio são candidatas à conferência; servidor revalida elegibilidade na tela de envio. Última atividade da fila separada da atualização da consulta.

Somente frontend, mantendo API, cálculos e funcionalidades da IA. Publicação com guardas de hash e lock, sobre fonte atual de produção. Backup previsto: /opt/valeexpresso/releases/visao-operador1-20261111/backup.

Validações intermediárias: alertas de erro abrem a lista real de funcionários; atalho de fórmulas de 09/2026 abre a execução com filtro formulas_pendentes e competência correta; envio confirmado abre Camaçari com filtro enviados; atalho Sem execução abre Nova execução em 10/2026 com Admitidos pré-selecionada. Cancelado sem criar. Indicadores exibem 99% e 2% de fórmulas separadamente, além de <1% para 4/965 envios. Escopo elegível consulta o servidor e inclui filiais parcialmente prontas. Ajustes finais de texto/fila e retorno ao dashboard possuem backups adicionais em visao-operador2-20261111 e visao-retorno1-20261111.

Validação final: builds TypeScript/Vite e saúde HTTP aprovados. Bundle final index-64G1AM76.js. Abertura direta do modal Fila e falhas verificada; retorno explícito Voltar à Visão geral verificado. Versões publicadas preservaram novas funcionalidades de relatório da IA presentes na fonte de produção. Nenhum cálculo, envio, criação ou alteração de cadastro disparado durante QA.
