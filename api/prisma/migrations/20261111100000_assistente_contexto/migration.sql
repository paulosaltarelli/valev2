IF COL_LENGTH(N'dbo.assistente_configuracao', N'contexto') IS NULL
  ALTER TABLE dbo.assistente_configuracao ADD contexto NVARCHAR(MAX) NULL;
