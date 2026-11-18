SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM dbo.execucao_queue WHERE status IN ('PENDENTE','PROCESSANDO'))
 THROW 51000,'Há processamento ativo. A migração foi interrompida.',1;
IF COL_LENGTH('dbo.execucao_funcionario_base','regras_rm') IS NULL
 ALTER TABLE dbo.execucao_funcionario_base ADD regras_rm NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.execucao_funcionario','codigo_regra_rm') IS NULL
 ALTER TABLE dbo.execucao_funcionario ADD codigo_regra_rm VARCHAR(100) NOT NULL CONSTRAINT DF_exec_func_regra DEFAULT('');
IF EXISTS(SELECT 1 FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID('dbo.execucao_funcionario') AND name='ux_exec_func_exec_base_formula')
 ALTER TABLE dbo.execucao_funcionario DROP CONSTRAINT ux_exec_func_exec_base_formula;
ELSE IF EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.execucao_funcionario') AND name='ux_exec_func_exec_base_formula')
 DROP INDEX ux_exec_func_exec_base_formula ON dbo.execucao_funcionario;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.execucao_funcionario') AND name='ux_exec_func_exec_base_formula_regra')
 EXEC('CREATE UNIQUE INDEX ux_exec_func_exec_base_formula_regra ON dbo.execucao_funcionario(execucao_id,execucao_funcionario_base_id,formula_id,codigo_regra_rm)');
COMMIT;
