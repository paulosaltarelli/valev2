#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/valeexpresso/releases/operacao-20261106-candidate
db=${1:-vale_ux_test_2026110602}
[[ "$db" =~ ^vale_ux_test_[0-9]+$ ]] || exit 2
sql() { docker exec -i valeexpresso-db-1 bash -c 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b' -- "$@"; }
docker run --rm -v "$PWD/schema-before.prisma:/schema-before.prisma:ro" -e DATABASE_URL='sqlserver://localhost:1433;database=test;user=test;password=ExampleOnly123;trustServerCertificate=true' valeexpresso-api:operacao-build npx prisma migrate diff --from-empty --to-schema /schema-before.prisma --script > schema-test.sql
printf 'IF DB_ID(N\x27%s\x27) IS NOT NULL THROW 50001, \x27Banco de teste já existe; use nova identificação.\x27, 1;\nCREATE DATABASE [%s];\nGO\n' "$db" "$db" | sql
{ printf 'USE [%s];\nGO\n' "$db"; cat schema-test.sql; } | sql
{ printf 'USE [%s];\nGO\n' "$db"; cat api/prisma/ux-operacao.sql; printf '\nGO\n'; cat api/prisma/ux-operacao.sql; printf '\nGO\nCREATE USER [vale_app] FOR LOGIN [vale_app];\nALTER ROLE db_datareader ADD MEMBER [vale_app];\nALTER ROLE db_datawriter ADD MEMBER [vale_app];\n'; } | sql
docker run --rm --network valeexpresso_default --env-file /opt/valeexpresso/secrets/api.env -e DATABASE_NAME="$db" -e NODE_PATH=/app/dist valeexpresso-api:operacao-build node test/operacao.integration.cjs
echo 'TEST_DATABASE='"$db"
