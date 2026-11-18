# Validação da cópia oficial

- Snapshot de 704 arquivos conferido por SHA-256 contra a instalação da Hostinger; nenhuma alteração concorrente detectada na conferência.
- Frontend: `npm ci --legacy-peer-deps` e `npm run build` concluídos.
- API: `npm ci`, `npx prisma generate` e `npm run build` concluídos. Nenhum banco foi conectado ou migrado para essas verificações.
- Suíte Jest completa: 55 suítes, 36 aprovadas e 19 reprovadas; 272 testes aprovados e 19 reprovados.

As 19 reprovações correspondem aos testes básicos `should be defined` de controllers/services (auth, cron, dash, execucao, filial, formula, variavel, geo, periodo e usuarios), que não fornecem todas as dependências exigidas pelos módulos atuais. Esses arquivos foram preservados conforme o código oficial, sem excluir testes ou alterar a lógica para mascarar o resultado. O próximo agente pode corrigir a configuração dos testes em tarefa própria.

O primeiro teste local não pôde carregar o Prisma por falta de seu cliente gerado. A geração foi concluída usando a cadeia de certificados confiáveis do Windows (`NODE_USE_SYSTEM_CA=1`), sem desabilitar a verificação TLS. Os números acima são da execução posterior com o cliente gerado.

Os testes funcionais existentes aprovados abrangem os módulos de assistente, permissões/consultas, relatórios, regras, lotes, resultados e calculadora. A aprovação dessas unidades não constitui homologação financeira no RM.

Arquivos de ambiente, chaves privadas, backups, logs, banco e pacote de conhecimento gerado não foram incluídos. As ocorrências de credenciais sintéticas nos testes de mascaramento/criptografia foram revisadas; não são credenciais da VPS ou de provedores.

Esta sincronização somente lê a VPS e publica código no GitHub. Não reinicia serviços nem modifica cadastros, fórmulas, variáveis, filas ou resultados de produção.
