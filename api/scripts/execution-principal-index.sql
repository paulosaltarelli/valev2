SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
IF EXISTS(SELECT filial_id,periodo_id FROM dbo.execucao WHERE historica_de_execucao_id IS NULL GROUP BY filial_id,periodo_id HAVING COUNT(*)>1) THROW 51000,'Unresolved principal scopes; index not activated.',1;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.execucao') AND name='ux_execucao_principal_filial_periodo')
CREATE UNIQUE INDEX ux_execucao_principal_filial_periodo ON dbo.execucao(filial_id,periodo_id) WHERE historica_de_execucao_id IS NULL;
