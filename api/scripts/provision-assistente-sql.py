"""Provisiona identidades de leitura do Vale IA. Executar somente na VPS como root."""
from pathlib import Path
import json
import os
import re
import secrets
import subprocess

root = Path("/opt/valeexpresso")
database = subprocess.check_output(
    ["docker", "exec", "valeexpresso-api-1", "printenv", "DATABASE_NAME"], text=True
).strip()
if not re.fullmatch(r"[A-Za-z0-9_]{1,100}", database):
    raise RuntimeError("Nome do banco ativo inválido.")

secret_file = root / "secrets/ia-sql.env"
values = {}
if secret_file.exists():
    values = dict(line.split("=", 1) for line in secret_file.read_text().splitlines() if "=" in line)

commands = []
for prefix, login, role in [
    ("OPERATOR", "vale_ia_operator_reader", "vale_ia_operador"),
    ("ADMIN", "vale_ia_admin_reader", "vale_ia_admin"),
]:
    user_key = "VALE_IA_SQL_" + prefix + "_USER"
    pass_key = "VALE_IA_SQL_" + prefix + "_PASSWORD"
    had_password = bool(values.get(pass_key))
    password = values.get(pass_key) or ("Va9!" + secrets.token_urlsafe(48))
    if not re.fullmatch(r"[A-Za-z0-9_!\-]{32,100}", password):
        raise RuntimeError("Credencial de leitura armazenada em formato inválido.")
    values[user_key] = login
    values[pass_key] = password
    commands.append(f"""
USE [master];
IF SUSER_ID(N'{login}') IS NULL
  CREATE LOGIN [{login}] WITH PASSWORD=N'{password}', CHECK_POLICY=ON;
{"" if had_password else f"ELSE ALTER LOGIN [{login}] WITH PASSWORD=N'{password}', CHECK_POLICY=ON;"}
USE [{database}];
IF DATABASE_PRINCIPAL_ID(N'{role}') IS NULL THROW 51000,'Aplique primeiro a migração das visões.',1;
IF USER_ID(N'{login}') IS NULL CREATE USER [{login}] FOR LOGIN [{login}];
IF EXISTS(
 SELECT 1 FROM sys.database_role_members m JOIN sys.database_principals r ON r.principal_id=m.role_principal_id
 WHERE m.member_principal_id=USER_ID(N'{login}') AND r.name<>N'{role}'
) THROW 51002,'A identidade possui um papel não esperado.',1;
IF IS_ROLEMEMBER(N'{role}',N'{login}')<>1 ALTER ROLE [{role}] ADD MEMBER [{login}];
DENY SELECT, INSERT, UPDATE, DELETE, EXECUTE ON SCHEMA::dbo TO [{login}];
DENY INSERT, UPDATE, DELETE, ALTER ON SCHEMA::vale_ia TO [{login}];
IF IS_SRVROLEMEMBER(N'sysadmin',N'{login}')=1 THROW 51001,'A identidade de leitura não pode ser sysadmin.',1;
""")

result = subprocess.run(
    ["docker", "exec", "-i", "valeexpresso-db-1", "bash", "-c",
     'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b'],
    input="SET NOCOUNT ON;\n" + "\n".join(commands), text=True, capture_output=True
)
if result.returncode:
    # A saída SQL pode conter uma linha de CREATE LOGIN. Não registrar valores secretos.
    raise RuntimeError("Falha ao provisionar identidades SQL de leitura.")

def write_private(path, text):
    temp = path.with_name(path.name + ".new")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as file:
        file.write(text)
    os.chmod(temp, 0o600)
    temp.replace(path)

block = "\n".join(key + "=" + value for key, value in values.items()) + "\n"
write_private(secret_file, block)
api_env = root / "secrets/api.env"
previous = api_env.read_text()
preserved = "\n".join(line for line in previous.splitlines() if not line.startswith("VALE_IA_SQL_"))
write_private(api_env, preserved.rstrip() + "\n" + block)
print(json.dumps({"database": database, "readOnlyIdentities": 2, "credentialsStored": True}))
