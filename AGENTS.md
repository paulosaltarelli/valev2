# Instruções para continuidade

## Fonte e alterações

Este repositório foi consolidado com o código oficial do Vale Expresso V2 na Hostinger. Antes de uma alteração ou publicação futura, confirme se houve mudanças no servidor e preserve o trabalho de outros agentes. Não suponha que o banco esteja vazio ou que uma autorização antiga ainda se aplique.

Leia o README. Trabalhe em branch própria. Implemente apenas o solicitado, confira diferenças e rode verificações proporcionais. Não atualize dependências ou reescreva regras de negócio como efeito colateral de uma sincronização.

## Segurança e produção

- Nunca versione senhas, tokens, API keys, chaves privadas, `.env` reais, dumps de banco ou dados pessoais.
- Não procure/exiba conteúdo de `/opt/valeexpresso/secrets`. Credenciais de produção não são necessárias para compilar e testar unidades.
- Não execute os scripts de integração/manutenção, workers, migrations ou envios contra produção sem autorização explícita para a tarefa atual.
- Não limpe, pause, retome ou reprocesse filas por iniciativa própria. Envio ao RM é gravação financeira e exige escopo autorizado.
- Preserve cadastros, variáveis, fórmulas, eventos e vínculos. Não trate ausência, NULL, zero válido e falha como equivalentes sem conferir o contrato.
- A IA orienta e consulta dentro das permissões implementadas; não deve alterar cadastros ou disparar processamento/envio por iniciativa própria.
- A VPS hospeda outros sistemas. Nunca use `docker compose down -v` nem restaure um banco inteiro para desfazer uma mudança de frontend.

## Validação local

Node.js 22. API: `npm ci`, `npx prisma generate`, `npm run build`, `npm test -- --runInBand`. Frontend: `npm ci --legacy-peer-deps`, `npm run build`. Não inicie a aplicação com configuração de produção para testar compilação.

## Publicação

Quando autorizada: confira a versão oficial e filas ativas, faça backup adequado, publique apenas os serviços necessários, preserve segredos e outros sistemas e verifique saúde e rotas. Registre commit, testes e limitações. Falta de acesso SSH deve ser informada; nunca declare uma publicação não verificada.
