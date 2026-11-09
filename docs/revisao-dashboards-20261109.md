# Revisão de UX e dashboards — 09/11/2026

## Escopo e evidência
Revisão heurística pelo navegador autenticado e pelo código. Telas revisitadas: Visão geral (resumo operacional e indicadores), Processamentos, Gestão de KM, Fechamento por filial, Variação entre competências, Relatórios financeiros, Falhas por causa e Extrato de processamento. Conferência desktop 1366×900; teste do menu em 390×844. Não é teste de usabilidade com usuários nem auditoria dos cálculos. Observações são do estado encontrado, sem disparar processamento ou alterar dados. Não afirmar que valores zero representam defeito do cálculo apenas pela apresentação.

Referência mantida: tipografia, superfícies, bordas, cores semânticas e hierarquia de Processamentos. Técnicas: hierarquia visual, divulgação progressiva, consistência, reconhecimento, prevenção de erros e visibilidade do estado.

## Publicado nesta entrega
Regras e cadastros usa o mesmo componente expansível de Análise. Ambos podem abrir independentemente. A área atual abre ao navegar diretamente; pode ser recolhida manualmente. Filiais e regras e Competências permanecem disponíveis aos administradores. Processamentos mantém o nome. Menu móvel fecha ao escolher destino. aria-expanded, aria-controls e botão nativo suportam teclado.

Build TypeScript/Vite aprovado. Verificações das 11 rotas e API passaram; contêiner da API permaneceu igual. Backup: /opt/valeexpresso/releases/registration-20261109/backup (source-before.tar.gz, web-before.tar, manifest.json). Imagem anterior: valeexpresso-web:before-registration-20261109. Para reverter, restaurar fonte do tar e imagem anterior como valeexpresso-web:latest, recriando apenas web pelo compose.vps.yml; avaliar publicações posteriores antes.

## Recomendações priorizadas (ainda não implementadas)

| Prioridade | Tela / evidência | Melhoria proposta | Critério de aceite |
|---|---|---|---|
| Alta | Visão geral: lista de pendências ocupa várias dobras antes de indicadores e fila | Mostrar cinco filiais prioritárias e botão Ver todas; ordenar por impacto, com total de filiais e pessoas explicitado | Resumo, próxima ação e estado da fila visíveis antes da lista completa; expansão sem rolagem vertical interna |
| Alta | Visão geral: painel ativo global acima de filtros que só afetam indicadores inferiores | Separar claramente Situação das competências ativas e Indicadores do recorte selecionado; identificar competência e filial junto ao título de cada bloco | Trocar filtro não induz a acreditar que alterou o resumo global |
| Alta | Visão geral: Erros do período soma funcionários e itens de fila; Falhas a resolver conta filiais | Mostrar pessoas afetadas, filiais afetadas e ocorrências separadamente; deduplicar apenas com definição validada | Nenhum total mistura unidades ou sugere soma de conjuntos sobrepostos |
| Alta | Financeiro: gráficos de 360px vazios e 12 meses com zero sem envios | Exibir estado Sem envios ao RM neste período e atalho para resultados calculados; mostrar gráficos quando houver dados pertinentes | Distinguir zero válido, ausência de envio e falha de consulta; não esconder zero válido nem alterar exportação |
| Média | Análise: lateral e abas repetem destinos, com nomes diferentes | Unificar nomes (Valores por funcionário e Evolução financeira) e avaliar retirar abas no desktop, mantendo um seletor compacto no celular | Uma nomenclatura por relatório; navegação acessível com lateral fechada |
| Média | Processamentos: contexto, texto explicativo, resumo e indicadores ocupam quase toda primeira tela | Resumo compacto com situação da fila e progresso; explicação do denominador em ajuda expansível | Primeiras linhas de filiais visíveis em 1366×900; progresso parcial e pendências continuam explícitos |
| Média | Fechamento: nove colunas com contagens que se sobrepõem | Agrupar cabeçalhos em Cálculo e Envio; destacar Situação e Próxima ação; oferecer colunas secundárias opcionais | Não somar erro e parcial como categorias exclusivas; manter todos os dados no Excel |
| Média | Variação: duas faixas de filtros, muitas filiais inativas e seleção inicial sem execução | Priorizar filiais com execução nos períodos, permitir incluir inativas; recolher filtros secundários | Histórico continua consultável; ausência não vira zero; mostrar motivo quando não há comparação |
| Média | Extrato: erros repetidos tornam linhas altas; execução única ainda ocupa um seletor largo | Resumo curto por célula com detalhes acessíveis por clique/teclado; execução atual como texto quando única | Uma linha por funcionário, todas as fórmulas mantidas, erros preservados inclusive na exportação |
| Média | Falhas por causa: código técnico aparece como causa principal | Descrição em linguagem operacional e código secundário; ordem por pessoas afetadas; indicar atualização | Não inventar causa raiz; distinguir mensagem observada de hipótese e oferecer acesso às filiais |
| Média | KM: botão de cálculo, busca e paginação aparecem mesmo antes da consulta | Estado inicial com ação Buscar funcionários; seleção e ações em lote só após carga; contador selecionados | Escopo de Selecionar todos explícito; sem disparar cálculo ao selecionar |
| Baixa | Tabelas: termos acessíveis de ordenação/seleção ainda em inglês | Localizar rótulos de DataTables e uniformizar paginação | Leitor de tela anuncia ações em português; foco visível e teclado preservados |
| Baixa | Visão geral: gráficos de status, filiais, financeiro e GEO disputam atenção | Manter operação e pendências como conteúdo inicial; indicadores financeiros e técnicos em seções expansíveis | Informações continuam disponíveis; sem excesso de cards ou segunda rolagem vertical |

## Sequência recomendada
1. Ajustar a Visão geral: síntese, prioridades, escopo e unidades das contagens.
2. Tratar estados sem dados no Financeiro e padronizar nomes da Análise.
3. Compactar filtros e tabelas de Fechamento, Variação e Extrato.
4. Refinar KM, acessibilidade e estados móveis.

## Validação para a próxima rodada
Comparar tarefas reais: identificar filial com pendência, abrir causa do erro, consultar valor por funcionário e exportar recorte. Medir cliques, tempo até a próxima ação e erros de interpretação antes/depois. Conferir cenários sem dados, dados parciais, erro, execução em andamento e concluída; claro/escuro, teclado e celular. Critério visual: uma rolagem vertical principal; tabelas largas podem ter rolagem horizontal localizada sem cortar ações.

Não há necessidade de criar outro dashboard neste momento: primeiro reduzir redundância e tornar os atuais mais acionáveis. Um futuro relatório de pendências por causa com impacto em pessoas pode aproveitar Falhas por causa, evitando novo menu.
