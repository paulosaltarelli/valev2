SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.assistente_configuracao', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.assistente_configuracao (
    id INT NOT NULL CONSTRAINT PK_assistente_configuracao PRIMARY KEY,
    claude_ativo BIT NOT NULL CONSTRAINT DF_assistente_claude_ativo DEFAULT 0,
    claude_modelo VARCHAR(80) NOT NULL,
    atualizado_em DATETIME2 NOT NULL,
    CONSTRAINT CK_assistente_configuracao_id CHECK (id = 1)
  );
  INSERT INTO dbo.assistente_configuracao (id, claude_ativo, claude_modelo, atualizado_em)
  VALUES (1, 0, 'claude-haiku-5-5', SYSUTCDATETIME());
END;

COMMIT TRANSACTION;
