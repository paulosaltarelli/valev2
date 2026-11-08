# Assistente do Vale Expresso

O botão flutuante **Vale IA** fica no canto inferior das telas autenticadas. Em Processamentos, a competência e a filial vêm da tela quando selecionadas. O usuário pode conferir o recorte antes de consultar. A resposta mostra a fonte, a hora da leitura, os detalhes, a tabela e os links pertinentes.

| Pergunta | Resultado |
| --- | --- |
| Quais filiais têm pendências? | Resumo da competência com execuções ausentes, abertas ou duplicadas, criação na fila e funcionários sem envio registrado. |
| Quais variáveis foram calculadas? | Memória de cálculo gravada, incluindo dados de funcionários com falha parcial, e falhas reconhecidas nos logs recentes. |
| Por que o valor não foi calculado? | Etapa registrada e evidências de erro reconhecidas para a matrícula informada. O link abre a execução. |
| Mostre os valores por funcionário e fórmula. | Status, calculado, final local, ajuste manual e status do envio. |
| O que mudou em relação à competência anterior? | Entradas e saídas na população, variação dos valores calculados e indicação de mudanças de fórmula, conforme o relatório operacional existente. |
| Gere um dashboard financeiro. | Indicadores de pago, desconto e saldo produzidos pelo serviço de Relatórios no recorte de uma filial e competência. |
| Gere um dashboard de processamentos. | Filiais com e sem pendência e total de criações na fila. |
| Gere um Excel desta consulta. | Arquivo XLSX da última tabela completa, com abas Resultado e Filtros. |

As consultas de KM usam os registros da execução. O cadastro de fórmulas segue o acesso de administrador. As telas atuais de Processamentos e Relatórios permitem consulta aos perfis administrador e operador. O MVP aplica esse mesmo escopo. A versão de cálculo vem da fórmula gravada na execução quando disponível. O relatório sinaliza os dados legados sem histórico verificável. A revisão com envio registrado aparece separada do valor final local.

## Modelos e acesso

O login do Vale identifica o operador. O servidor revalida a sessão e o perfil atual e mantém até oito interações por sessão, em memória, por até 30 minutos de inatividade. Há um limite de oito consultas por minuto por usuário, uma consulta simultânea por usuário e quatro por instância. Os limites reiniciam junto com a instância.

O fluxo desejado para a conta pessoal começa no botão **Entrar com ChatGPT**. O Vale abre a página de autorização da OpenAI e, depois do retorno autorizado, associa a conexão à sessão já autenticada do operador. A competência, a filial e a tela de origem vêm do contexto do Vale. O assistente recebe os dados necessários para a pergunta por consultas de leitura autorizadas pelo perfil do operador.

A ativação desse fluxo hospedado depende do registro OAuth do Vale e da autorização para usar o plano ChatGPT do operador. O cadastro precisa incluir o callback HTTPS de produção e solicitar expressamente o uso do plano. A OpenAI fornece o identificador do cliente, o método de autenticação e as permissões concedidas. [Registro OAuth](https://developers.openai.com/siwc/request-client-id) · [Uso do plano em aplicações hospedadas](https://developers.openai.com/siwc/token-sharing-open-source)

GPT e Claude classificam a pergunta em um catálogo fechado. O Vale executa a consulta parametrizada e monta as tabelas, indicadores, links e arquivos. O histórico, os filtros estruturados, os registros e as credenciais do banco ficam no Vale. O usuário pode selecionar **Consultas do Vale** para interpretação local. Ao escolher um modelo externo, envie apenas a pergunta sem dados pessoais e use o campo de matrícula para identificar funcionários.

| Opção | Integração | US$ por milhão de tokens de entrada e saída | Cenário de mil perguntas |
| --- | --- | --- | --- |
| GPT-5.4 Mini | OpenAI Responses API com chave de projeto | 0,75 / 4,50 | US$ 2,85 |
| Claude Haiku 5.5 | Anthropic Messages API com chave do Console | 0,10 / 0,50 no intervalo até 100 mil tokens de entrada | US$ 0,35 |
| Gemini 3.1 Flash-Lite | Gemini Developer API paga com chamada de função | 0,25 / 1,50 | US$ 0,95 |

Cenário ilustrativo com 2.000 tokens de entrada e 300 de saída por pergunta. A classificação deste MVP usa um contexto curto e limita a saída do provedor a 32 tokens. O consumo varia por modelo e tokenização. Gemini é uma referência de comparação. [OpenAI](https://developers.openai.com/api/docs/models/gpt-5.4-mini) · [Anthropic](https://platform.claude.com/docs/en/models/haiku-5-5/overview) · [Google](https://ai.google.dev/gemini-api/docs/pricing)

O ChatGPT oferece login a parceiros comerciais selecionados. O compartilhamento de uso para aplicativos comerciais participantes exige Go, Plus ou Pro. O Claude Free permite um conector personalizado para consultar ferramentas externas dentro do Claude. O Vale embutido usa credenciais de API no servidor. [Login em outros apps do ChatGPT](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites) · [Autenticação Claude](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) · [Conectores Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

## Validação antes da publicação

1. Gere o cliente Prisma e rode `npm run build` e `npm test -- --runInBand --runTestsByPath src/assistente/assistente.spec.ts src/execucao/execucao.variables.spec.ts` na API. No frontend, instale com `npm ci --legacy-peer-deps` e rode `npm run build`.
2. A branch do MVP usa o release de relatórios operacionais como base. Reaplique somente o delta do assistente sobre uma cópia isolada da origem que corresponde às imagens ativas. A VPS tem alterações fora dessa revisão. Preserve os arquivos vigentes e resolva os pontos de integração sobre eles.
3. Gere imagens candidatas com tags próprias. Em ambiente de homologação isolado, valide login, usuário desativado e sessão expirada, filtros, duas sessões distintas, resultados parciais, erros, zero, comparação e Excel. Confira o dashboard financeiro contra a tela Relatórios para o mesmo recorte. Use banco de teste e mantenha os workers de produção fora da homologação.
4. Use `VALE_ASSISTENTE_ATIVO=true` para habilitar o recurso após o teste de fumaça. Mantenha a origem HTTPS do frontend em `FRONTEND_URL`. As chaves institucionais `OPENAI_API_KEY` e `ANTHROPIC_API_KEY` são opcionais, assim como `VALE_OPENAI_MODEL` e `VALE_CLAUDE_MODEL`. Valide cada provedor com uma chave de teste e uma pergunta sem dados pessoais.

## Hostinger e rollback

1. Identifique e registre as imagens em execução, o manifesto de hashes da origem, o arquivo Compose e a revisão da branch. Adquira os locks de implantação de API e frontend usados pelas publicações vigentes. Se a origem ou as imagens mudaram desde a preparação da candidata, refaça a validação.
2. Reserve uma janela operacional para impedir novas submissões enquanto o deploy troca as imagens. Confirme zero itens `PENDENTE` ou `PROCESSANDO` em `execucao_queue`, `execucao_create_queue` e `geo_queue`, além de zero execuções `EM_PROCESSAMENTO`. Repita a leitura imediatamente antes da troca.
3. Execute o backup oficial em `/opt/valeexpresso/backup.py` e verifique sua saída. Preserve as imagens ativas com tags de rollback, a origem instalada, o Compose e a configuração protegida da API. Registre IDs e hashes no diretório do release. O MVP não tem migração de banco.
4. Faça o Compose recriar apenas API e web com as imagens candidatas. Verifique a API pelo proxy e a autenticação, o dashboard e a exportação com usuário autorizado. Confira que a fila volta a operar e registre os IDs efetivamente em execução.
5. Se o teste falhar, restaure a configuração e os arquivos de origem do backup da publicação, reponha as tags anteriores, recrie apenas API e web e verifique a saúde pelo proxy. O banco continua na mesma versão.
