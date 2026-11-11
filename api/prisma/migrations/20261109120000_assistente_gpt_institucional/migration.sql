IF COL_LENGTH(N'dbo.assistente_configuracao', N'gpt_institucional_ativo') IS NULL
  ALTER TABLE dbo.assistente_configuracao ADD
    gpt_institucional_ativo BIT NOT NULL CONSTRAINT DF_assistente_gpt_institucional_ativo DEFAULT 0,
    gpt_modelo VARCHAR(80) NOT NULL CONSTRAINT DF_assistente_gpt_modelo DEFAULT 'gpt-5.4-mini',
    gpt_chave VARCHAR(MAX) NULL;
