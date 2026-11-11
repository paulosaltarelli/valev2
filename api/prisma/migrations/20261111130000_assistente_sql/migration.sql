IF SCHEMA_ID(N'vale_ia') IS NULL EXEC(N'CREATE SCHEMA vale_ia AUTHORIZATION dbo');
IF DATABASE_PRINCIPAL_ID(N'vale_ia_operador') IS NULL CREATE ROLE vale_ia_operador;
IF DATABASE_PRINCIPAL_ID(N'vale_ia_admin') IS NULL CREATE ROLE vale_ia_admin;
GO
CREATE OR ALTER VIEW vale_ia.filiais AS
SELECT f.filial_id AS FilialId, f.nome AS Filial, f.codcoligada AS CodColigada, f.codfilial AS CodFilial, f.km_max AS LimiteKm
FROM dbo.filial f WHERE f.ativa=1
 AND (SESSION_CONTEXT(N'vale_filial') IS NULL OR f.filial_id=TRY_CONVERT(int,SESSION_CONTEXT(N'vale_filial')));
GO
CREATE OR ALTER VIEW vale_ia.execucoes AS
SELECT e.execucao_id AS ExecucaoId,e.periodo_id AS PeriodoId,p.competencia AS Competencia,
 e.filial_id AS FilialId,f.nome AS Filial,e.status AS Status,e.controle_fila AS ControleFila,e.data_execucao AS DataExecucao
FROM dbo.execucao e JOIN dbo.periodo p ON p.periodo_id=e.periodo_id JOIN dbo.filial f ON f.filial_id=e.filial_id
WHERE e.periodo_id=TRY_CONVERT(int,SESSION_CONTEXT(N'vale_periodo'))
 AND (SESSION_CONTEXT(N'vale_filial') IS NULL OR e.filial_id=TRY_CONVERT(int,SESSION_CONTEXT(N'vale_filial')));
GO
CREATE OR ALTER VIEW vale_ia.funcionarios AS
SELECT b.execucao_funcionario_base_id AS FuncionarioBaseId,b.funcionario_id_rm AS Matricula,b.nome_funcionario AS Funcionario,
 b.cargo AS Cargo,b.status AS StatusFuncionario,b.km AS Km,b.codcoligada AS CodColigada,b.codfilial AS CodFilial,
 e.ExecucaoId,e.PeriodoId,e.Competencia,e.FilialId,e.Filial
FROM dbo.execucao_funcionario_base b JOIN vale_ia.execucoes e ON e.ExecucaoId=b.execucao_id
WHERE SESSION_CONTEXT(N'vale_matricula') IS NULL OR b.funcionario_id_rm=CONVERT(varchar(50),SESSION_CONTEXT(N'vale_matricula'));
GO
CREATE OR ALTER VIEW vale_ia.resultados AS
SELECT r.execucao_funcionario_id AS ResultadoId,b.execucao_funcionario_base_id AS FuncionarioBaseId,b.funcionario_id_rm AS Matricula,b.nome_funcionario AS Funcionario,
 e.ExecucaoId,e.PeriodoId,e.Competencia,e.FilialId,e.Filial,
 r.formula_id AS FormulaId,fo.nome AS Formula,fo.versao AS VersaoCadastro,
 TRY_CONVERT(int,JSON_VALUE(CASE WHEN ISJSON(r.formula_snapshot)=1 THEN r.formula_snapshot ELSE N'{}' END,'$.versao')) AS VersaoCalculada,
 r.valor_calculado AS Calculado,r.valor_final AS FinalLocal,r.ajuste_manual AS AjusteManual,
 r.status AS StatusResultado,b.status AS StatusFuncionario,r.revisao AS RevisaoLocal,r.enviado_revisao AS RevisaoComEnvioRegistrado
FROM dbo.execucao_funcionario r JOIN vale_ia.execucoes e ON e.ExecucaoId=r.execucao_id
 JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id=r.execucao_funcionario_base_id
 JOIN dbo.formula fo ON fo.formula_id=r.formula_id
WHERE SESSION_CONTEXT(N'vale_matricula') IS NULL OR b.funcionario_id_rm=CONVERT(varchar(50),SESSION_CONTEXT(N'vale_matricula'));
GO
-- Mesmos critérios e campos usados em DashService.getFinanceiroTimeline.
-- Os valores são registros locais associados ao envio, sem conciliação com o RM.
CREATE OR ALTER VIEW vale_ia.financeiro AS
SELECT r.execucao_funcionario_id AS ResultadoId,b.execucao_funcionario_base_id AS FuncionarioBaseId,b.funcionario_id_rm AS Matricula,b.nome_funcionario AS Funcionario,
 e.ExecucaoId,e.PeriodoId,e.Competencia,e.FilialId,e.Filial,fo.nome AS Formula,fo.polaridade AS Polaridade,
 COALESCE(r.valor_final,r.valor_calculado) AS ValorLocal,
 CASE WHEN fo.polaridade='+' THEN COALESCE(r.valor_final,r.valor_calculado) ELSE CONVERT(decimal(18,2),0) END AS Pago,
 CASE WHEN fo.polaridade='-' THEN COALESCE(r.valor_final,r.valor_calculado) ELSE CONVERT(decimal(18,2),0) END AS Desconto
FROM dbo.execucao_funcionario r JOIN vale_ia.execucoes e ON e.ExecucaoId=r.execucao_id
 JOIN dbo.execucao_funcionario_base b ON b.execucao_funcionario_base_id=r.execucao_funcionario_base_id
 JOIN dbo.formula fo ON fo.formula_id=r.formula_id
WHERE b.status='ENVIADO_RM' AND fo.tipo='V' AND COALESCE(r.valor_final,r.valor_calculado) IS NOT NULL
 AND (SESSION_CONTEXT(N'vale_matricula') IS NULL OR b.funcionario_id_rm=CONVERT(varchar(50),SESSION_CONTEXT(N'vale_matricula')));
GO
CREATE OR ALTER VIEW vale_ia.variaveis AS
SELECT m.memoria_id AS MemoriaId,m.variavel_codigo AS VariavelCodigo,m.variavel_nome AS Variavel,
 m.valor AS Valor,m.origem AS Origem,m.data_registro AS DataRegistro,
 r.ResultadoId,r.FormulaId,r.Formula,r.FuncionarioBaseId,r.Matricula,r.Funcionario,
 r.ExecucaoId,r.PeriodoId,r.Competencia,r.FilialId,r.Filial,r.StatusResultado
FROM dbo.memoria_calculo m JOIN vale_ia.resultados r ON r.ResultadoId=m.execucao_funcionario_id;
GO
CREATE OR ALTER VIEW vale_ia.filas AS
SELECT q.queue_id AS ItemId,q.tipo AS Tipo,q.status AS Status,q.tentativas AS Tentativas,
 q.created_at AS CriadoEm,q.updated_at AS AtualizadoEm,e.ExecucaoId,e.PeriodoId,e.Competencia,e.FilialId,e.Filial
FROM dbo.execucao_queue q JOIN vale_ia.execucoes e ON e.ExecucaoId=q.execucao_id;
GO
CREATE OR ALTER VIEW vale_ia.formulas AS
SELECT fo.formula_id AS FormulaId,fo.nome AS Formula,fo.versao AS VersaoCadastro,fo.ativa AS Ativa,
 fo.tipo AS Tipo,fo.polaridade AS Polaridade,fo.data_inicio_vigencia AS InicioVigencia,fo.data_fim_vigencia AS FimVigencia,
 LEFT(fo.expressao,4000) AS Expressao,
 CASE WHEN LEN(fo.expressao)>4000 THEN 1 ELSE 0 END AS ExpressaoParcial,f.FilialId,f.Filial
FROM dbo.formula fo JOIN vale_ia.filiais f ON f.FilialId=fo.filial_id;
GO
GRANT SELECT ON OBJECT::vale_ia.filiais TO vale_ia_operador;
GRANT SELECT ON OBJECT::vale_ia.execucoes TO vale_ia_operador;
GRANT SELECT ON OBJECT::vale_ia.funcionarios TO vale_ia_operador;
GRANT SELECT ON OBJECT::vale_ia.resultados TO vale_ia_operador;
GRANT SELECT ON OBJECT::vale_ia.financeiro TO vale_ia_operador;
GRANT SELECT ON OBJECT::vale_ia.variaveis TO vale_ia_operador;
GRANT SELECT ON OBJECT::vale_ia.filas TO vale_ia_operador;
GRANT SELECT ON SCHEMA::vale_ia TO vale_ia_admin;
