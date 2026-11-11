ALTER TABLE [dbo].[variavel] ADD [chapas_por_chamada] INT NULL;

ALTER TABLE [dbo].[variavel] ADD CONSTRAINT [CK_variavel_chapas_por_chamada]
    CHECK ([chapas_por_chamada] > 0);
