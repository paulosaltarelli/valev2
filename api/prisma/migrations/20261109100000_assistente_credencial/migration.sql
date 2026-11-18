IF COL_LENGTH(N'dbo.assistente_configuracao', N'claude_chave') IS NULL
  ALTER TABLE dbo.assistente_configuracao ADD claude_chave VARCHAR(MAX) NULL;
