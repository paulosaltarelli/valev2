-- Migração aditiva e reexecutável. Não apagar estas colunas em um rollback de aplicação.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.execucao','controle_fila') IS NULL
  ALTER TABLE dbo.execucao ADD controle_fila VARCHAR(12) NULL;
IF COL_LENGTH('dbo.execucao_funcionario','revisao') IS NULL
  ALTER TABLE dbo.execucao_funcionario ADD revisao INT NOT NULL CONSTRAINT DF_resultado_revisao DEFAULT 1;
IF COL_LENGTH('dbo.execucao_funcionario','conferido_revisao') IS NULL
  ALTER TABLE dbo.execucao_funcionario ADD conferido_revisao INT NULL, conferido_por INT NULL, conferido_em DATETIME2 NULL, enviado_revisao INT NULL, formula_snapshot NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.execucao_queue','revisao_payload') IS NULL
  ALTER TABLE dbo.execucao_queue ADD revisao_payload NVARCHAR(MAX) NULL;
IF OBJECT_ID('dbo.resultado_historico','U') IS NULL
BEGIN
  CREATE TABLE dbo.resultado_historico (
    id INT IDENTITY PRIMARY KEY, resultado_id INT NOT NULL, execucao_id INT NOT NULL,
    revisao INT NOT NULL, tipo VARCHAR(30) NOT NULL, usuario_id INT NULL,
    registrado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), detalhe NVARCHAR(MAX) NOT NULL
  );
  CREATE INDEX resultado_historico_resultado_id_id_idx ON dbo.resultado_historico(resultado_id,id);
  CREATE INDEX resultado_historico_execucao_id_id_idx ON dbo.resultado_historico(execucao_id,id);
END;
IF OBJECT_ID('dbo.operacao_previa','U') IS NULL
BEGIN
  CREATE TABLE dbo.operacao_previa (
    id VARCHAR(36) PRIMARY KEY, usuario_id INT NOT NULL, expira_em DATETIME2 NOT NULL,
    consumida_em DATETIME2 NULL, pedido NVARCHAR(MAX) NOT NULL, fingerprint VARCHAR(64) NOT NULL
  );
  CREATE INDEX operacao_previa_expira_em_idx ON dbo.operacao_previa(expira_em);
END;
-- SQL dinâmico permite que o mesmo batch crie e use a coluna.
EXEC('UPDATE dbo.execucao_funcionario SET enviado_revisao = revisao WHERE status = ''ENVIADO_RM'' AND metadados_rm_id IS NOT NULL AND enviado_revisao IS NULL');
COMMIT;
