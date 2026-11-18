# Vale Expresso V2

Código oficial consolidado a partir da instalação da Hostinger. API NestJS/Prisma, frontend React/TypeScript/Vite, banco SQL Server e integração com TOTVS RM.

## Começar no Codex online

Use a branch `main` deste repositório. Leia [AGENTS.md](AGENTS.md) antes de trabalhar. O checkout contém código, testes, estrutura do banco, migrations, SQLs disponíveis no servidor e arquivos de implantação. Cadastros, fórmulas configuradas por filial, históricos e credenciais permanecem no banco/ambiente da VPS: não fazem parte do Git.

Requisitos: Node.js 22 e npm. Os comandos abaixo compilam/testam; não iniciam a aplicação nem consultam o RM.

```sh
cd api
npm ci
npx prisma generate
npm run build
npm test -- --runInBand

cd ../administration
npm ci --legacy-peer-deps
npm run build
```

O Prisma gera o cliente a partir de `api/prisma/schema.prisma`; `prisma generate` não aplica migrations. Se o ambiente exigir `DATABASE_URL` apenas para carregar a configuração, forneça uma URL fictícia local, nunca credenciais de produção. Não execute `migrate deploy`, `db push` ou testes de integração contra produção.

## Configuração local

Consulte `api/.env.example`, `administration/.env.example` e `.env.docker.example`. Crie arquivos `.env` somente fora do versionamento. Configure seu banco de desenvolvimento e serviços autorizados. O aplicativo faz integração com RM e trabalhadores automáticos: não o inicie apontando para produção sem orientação.

O Vale IA precisa de configuração administrativa, conta/projeto autorizado no provedor, API key e faturamento/créditos conforme o serviço. Não é necessário ativar o assistente para compilar ou usar a ajuda. Não publique chaves no frontend ou no Git.

## Implantação existente

- Aplicação: `https://2.25.146.67:8444`.
- Diretório: `/opt/valeexpresso/app`.
- Compose: `deploy/compose.vps.yml`.
- Credenciais externas ao código: `/opt/valeexpresso/secrets`.
- Serviços: API, web e SQL Server; a VPS hospeda também outros sistemas.

O compose da VPS referencia arquivos privados externos, que devem continuar externos. Ele não é uma configuração pronta para execução no Codex online. Não execute comandos de manutenção automaticamente.

O arquivo `api/assistente-knowledge.json` é gerado por `api/scripts/build-assistente-knowledge.cjs` durante o build e fica fora do Git. Para preparar o contexto completo antes de um build Docker da API, execute `node api/scripts/build-assistente-knowledge.cjs` a partir da raiz, com o frontend presente. O build restrito à pasta API preserva a parcela de frontend de um pacote previamente gerado, quando disponível.

## Ajuda e recursos

- `/ajuda`: central de documentação.
- `/ajuda/rotina-ilustrada`: guia de operação com prints.
- `/ajuda/formulas-por-filial`: referência autenticada do cadastro atual.
- `api/src/execucao`: processamento, regras e lotes.
- `api/src/assistente`: Vale IA.
- `api/prisma`: esquema e migrations; não inclui os dados da produção.
- `api/sql` e `complementar`: scripts/definições existentes na instalação oficial; alterações de SQL no RM exigem implantação própria.

## Segurança do repositório

Arquivos de ambiente reais, bancos, backups, logs, chaves SSH, tokens e credenciais não são versionados. As strings de credenciais presentes em testes são fictícias e usadas em verificações de mascaramento/criptografia. Não as substitua por valores reais. O executável legado `api/a.out` foi excluído por ser artefato de build.

Consulte [docs/SINCRONIZACAO-OFICIAL.md](docs/SINCRONIZACAO-OFICIAL.md) para o escopo desta consolidação.
