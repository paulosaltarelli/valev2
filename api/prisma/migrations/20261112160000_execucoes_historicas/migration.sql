ALTER TABLE dbo.execucao ADD historica_de_execucao_id int NULL, historica_em datetime2 NULL, historica_motivo nvarchar(1000) NULL;
GO
ALTER TABLE dbo.execucao ADD CONSTRAINT fk_execucao_principal FOREIGN KEY(historica_de_execucao_id) REFERENCES dbo.execucao(execucao_id);
GO
ALTER TABLE dbo.execucao ADD CONSTRAINT ck_execucao_historica CHECK(historica_de_execucao_id IS NULL OR (historica_de_execucao_id<>execucao_id AND historica_em IS NOT NULL AND historica_motivo IS NOT NULL));
GO
CREATE OR ALTER VIEW vale_ia.execucoes AS
SELECT e.execucao_id AS ExecucaoId,e.periodo_id AS PeriodoId,p.competencia AS Competencia,
 e.filial_id AS FilialId,f.nome AS Filial,e.status AS Status,e.controle_fila AS ControleFila,e.data_execucao AS DataExecucao
FROM dbo.execucao e JOIN dbo.periodo p ON p.periodo_id=e.periodo_id JOIN dbo.filial f ON f.filial_id=e.filial_id
WHERE e.historica_de_execucao_id IS NULL AND e.periodo_id=TRY_CONVERT(int,SESSION_CONTEXT(N'vale_periodo'))
 AND (SESSION_CONTEXT(N'vale_filial') IS NULL OR e.filial_id=TRY_CONVERT(int,SESSION_CONTEXT(N'vale_filial')));
