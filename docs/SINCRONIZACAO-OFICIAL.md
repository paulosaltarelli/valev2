# Consolidação do código oficial

Snapshot de referência obtido da instalação `/opt/valeexpresso/app` em 18/11/2026. A sincronização não modifica a VPS, seus processos ou dados.

Inclui frontend, ajuda ilustrada, Vale IA, API, regras implementadas em código, filas/lotes, testes, scripts existentes, schema Prisma, migrations, SQLs disponíveis, Docker e Nginx. Configurações financeiras cadastradas, chaves de provedores e usuários permanecem no banco/ambiente e não foram exportados.

Diferenças intencionais em relação aos arquivos da instalação:

- Exclusão de dependências, builds, executável legado `a.out`, arquivos de ambiente reais, logs e backups.
- Exclusão do pacote gerado `api/assistente-knowledge.json`; sua geração é reproduzida pelo build.
- `.env.example` usa placeholders para a chave de criptografia e endpoints RM de exemplo.
- `.gitignore` ampliado para proteger credenciais e artefatos.
- README e AGENTS.md adicionados para continuidade no Codex online.

Não é necessário nem seguro copiar a chave SSH do computador anterior para o repositório. Configure acesso autorizado separadamente quando a tarefa exigir consultar ou publicar na VPS.
