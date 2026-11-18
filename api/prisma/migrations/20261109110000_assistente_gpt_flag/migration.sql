IF COL_LENGTH(N'dbo.assistente_configuracao', N'gpt_ativo') IS NULL
  ALTER TABLE dbo.assistente_configuracao ADD gpt_ativo BIT NOT NULL
    CONSTRAINT DF_assistente_gpt_ativo DEFAULT 0;
