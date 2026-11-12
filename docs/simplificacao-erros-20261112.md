# Simplificação de navegação e erros — 12/11/2026

## Alterações
- Análise reduzida a Valores por funcionário e Evolução financeira. Comparar competências é acessado pela Evolução financeira; a rota anterior permanece funcional.
- Fechamento redireciona para Processamentos preservando filtros e abrindo contagens/exportação. Preservados Excel, filiais sem execução e atalhos aos erros.
- Falhas por causa continua acessível por Processamentos e Visão geral, fora do menu lateral.
- Visão geral mantém acompanhamento por competência e ações; removidos painéis financeiros redundantes.
- Novo cartão Erros no detalhe filtra a própria tabela por falhas de variáveis, fórmulas ou envio ao RM. Contagem por funcionário sem duplicação; clicar novamente limpa o filtro.
- Relatórios usam a população operacional (fórmulas ativas e regras de transporte salvas) para conclusão/envio. Fórmulas históricas continuam no extrato e Excel, identificadas, sem bloquear indevidamente o indicador de conclusão.
- Resultados de múltiplas regras não se sobrescrevem no extrato; agregação decimal preserva zero, ausência e erro.

## Preservação
Base obtida da fonte atual de produção, sem alterar cálculos, elegibilidade de filas, integração RM nem funcionalidades da IA. Snapshot anterior em commit separado; implementação seguinte restrita ao manifesto de 20 arquivos. Publicação usa lock, guardas de hash, comparação de arquivos externos ao overlay, backup das imagens e fontes, health check e rollback automático.

## Verificação antes da publicação
- TypeScript/Vite e build da API aprovados.
- 40 testes em 6 suítes aprovados, incluindo fórmulas desativadas, zero, regras múltiplas, revisões de envio e regressões de pendências/processamento.
- Leitura com classes candidatas, sem bootstrap de workers: 45 execuções e 2.895 funcionários. Contagens de completos/enviados/erros iguais entre operação e relatório; extrato e filtro Erros conferidos.
- A primeira comparação detectou dados mudando durante envios reais. Repetida a leitura estável, contagens bateram. Reinício bloqueado enquanto houver itens PROCESSANDO.
- Backup publicado: /opt/valeexpresso/releases/simplificacao3-20261112/backup.
- Publicação concluída; menu desktop/mobile, cartão Erros (ativar/limpar filtro), redirecionamento legado e exportação Excel verificados.

## Ajustes finais
- Uma lista por competência; versões anteriores em controle secundário quando existentes.
- Modal de contagens acompanha o filtro operacional e atualiza ao abrir, sem recarga a cada atualização do resumo.
- Tabela de contagens com rolagem horizontal própria no celular.
- Frontend complementar: /opt/valeexpresso/releases/simplificacao-final3-20261112/backup. Sem reinício da API.
- As 17 execuções inicialmente pausadas foram retomadas. Na conferência final, 16 estavam novamente pausadas e foram retomadas após nova autorização do usuário; 153 itens em andamento naquele instante.
