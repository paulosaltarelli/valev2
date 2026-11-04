BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[ajuste_manual] (
    [ajuste_id] INT NOT NULL IDENTITY(1,1),
    [execucao_funcionario_id] INT NOT NULL,
    [usuario_id] INT NOT NULL,
    [motivo] VARCHAR(255) NOT NULL,
    [valor_anterior] DECIMAL(18,2),
    [valor_novo] DECIMAL(18,2),
    [data_ajuste] DATETIME2 NOT NULL CONSTRAINT [DF__ajuste_ma__data___628FA481] DEFAULT sysdatetime(),
    CONSTRAINT [PK__ajuste_m__AD9C431FF53BA7CB] PRIMARY KEY CLUSTERED ([ajuste_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[execucao] (
    [execucao_id] INT NOT NULL IDENTITY(1,1),
    [filial_id] INT NOT NULL,
    [periodo_id] INT NOT NULL,
    [formula_id] INT NOT NULL,
    [usuario_execucao] INT NOT NULL,
    [status] VARCHAR(30) NOT NULL,
    [data_execucao] DATETIME2 NOT NULL CONSTRAINT [DF__execucao__data_e__4F7CD00D] DEFAULT sysdatetime(),
    CONSTRAINT [PK__execucao__82E1C3EA2FB7A151] PRIMARY KEY CLUSTERED ([execucao_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[execucao_funcionario] (
    [execucao_funcionario_id] INT NOT NULL IDENTITY(1,1),
    [execucao_id] INT NOT NULL,
    [funcionario_id_rm] VARCHAR(50) NOT NULL,
    [valor_calculado] DECIMAL(18,2),
    [valor_final] DECIMAL(18,2),
    [status] VARCHAR(30) NOT NULL,
    [ajuste_manual] BIT NOT NULL CONSTRAINT [DF__execucao___ajust__59FA5E80] DEFAULT 0,
    [execucao_funcionario_base_id] INT NOT NULL CONSTRAINT [DF__execucao___execu__01142BA1] DEFAULT 1,
    CONSTRAINT [PK__execucao__1DD9607F39E3D50A] PRIMARY KEY CLUSTERED ([execucao_funcionario_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[execucao_funcionario_base] (
    [execucao_funcionario_base_id] INT NOT NULL IDENTITY(1,1),
    [execucao_id] INT NOT NULL,
    [funcionario_id_rm] VARCHAR(50) NOT NULL,
    [nome_funcionario] VARCHAR(150),
    [cargo] VARCHAR(100),
    [data_admissao] DATE,
    [data_registro] DATETIME2 NOT NULL CONSTRAINT [DF__execucao___data___5629CD9C] DEFAULT sysdatetime(),
    CONSTRAINT [PK__execucao__39A77246061DF61B] PRIMARY KEY CLUSTERED ([execucao_funcionario_base_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[filial] (
    [filial_id] INT NOT NULL IDENTITY(1,1),
    [codcoligada] INT NOT NULL,
    [codfilial] INT NOT NULL,
    [nome] VARCHAR(150) NOT NULL,
    [ativa] BIT NOT NULL CONSTRAINT [DF__filial__ativa__3B75D760] DEFAULT 1,
    [sql_codigo_rm] VARCHAR(100) NOT NULL,
    CONSTRAINT [PK__filial__DE090C4D8915897C] PRIMARY KEY CLUSTERED ([filial_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[formula] (
    [formula_id] INT NOT NULL IDENTITY(1,1),
    [filial_id] INT NOT NULL,
    [expressao] VARCHAR(max) NOT NULL,
    [versao] INT NOT NULL,
    [ativa] BIT NOT NULL CONSTRAINT [DF__formula__ativa__4AB81AF0] DEFAULT 1,
    [data_inicio_vigencia] DATE NOT NULL,
    [data_fim_vigencia] DATE,
    [data_criacao] DATETIME2 NOT NULL CONSTRAINT [DF__formula__data_cr__4BAC3F29] DEFAULT sysdatetime(),
    [nome] VARCHAR(100) NOT NULL,
    CONSTRAINT [PK__formula__DEDE7CC9E76518B6] PRIMARY KEY CLUSTERED ([formula_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[log_execucao] (
    [log_id] INT NOT NULL IDENTITY(1,1),
    [execucao_id] INT NOT NULL,
    [nivel] VARCHAR(20) NOT NULL,
    [mensagem] VARCHAR(max) NOT NULL,
    [data_log] DATETIME2 NOT NULL CONSTRAINT [DF__log_execu__data___6754599E] DEFAULT sysdatetime(),
    CONSTRAINT [PK__log_exec__9E2397E0D52C0A75] PRIMARY KEY CLUSTERED ([log_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[memoria_calculo] (
    [memoria_id] INT NOT NULL IDENTITY(1,1),
    [execucao_funcionario_id] INT NOT NULL,
    [variavel_id] INT,
    [variavel_codigo] VARCHAR(50) NOT NULL,
    [variavel_nome] VARCHAR(150) NOT NULL,
    [valor] DECIMAL(18,4) NOT NULL,
    [origem] VARCHAR(30) NOT NULL,
    [detalhe] VARCHAR(255),
    [data_registro] DATETIME2 NOT NULL CONSTRAINT [DF__memoria_c__data___5DCAEF64] DEFAULT sysdatetime(),
    CONSTRAINT [PK__memoria___6C39F4E79B1504A1] PRIMARY KEY CLUSTERED ([memoria_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[periodo] (
    [periodo_id] INT NOT NULL IDENTITY(1,1),
    [data_inicio] DATE NOT NULL,
    [data_fim] DATE NOT NULL,
    [competencia] VARCHAR(7) NOT NULL,
    [data_criacao] DATETIME2 NOT NULL CONSTRAINT [DF__periodo__data_cr__3E52440B] DEFAULT sysdatetime(),
    CONSTRAINT [PK__periodo__C736707C7F6F5DE2] PRIMARY KEY CLUSTERED ([periodo_id] ASC),
    CONSTRAINT [ux_periodo_competencia] UNIQUE NONCLUSTERED ([competencia] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[rm_sessao] (
    [rm_sessao_id] INT NOT NULL IDENTITY(1,1),
    [session_id] VARCHAR(50) NOT NULL,
    [username] VARCHAR(100) NOT NULL,
    [encrypted_credentials] VARCHAR(max) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_rm_sessao_created_at] DEFAULT sysdatetime(),
    [last_seen_at] DATETIME2,
    CONSTRAINT [PK_rm_sessao] PRIMARY KEY CLUSTERED ([rm_sessao_id] ASC),
    CONSTRAINT [UX_rm_sessao_session_id] UNIQUE NONCLUSTERED ([session_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[sql_funcionarios_filial] (
    [sql_func_filial_id] INT NOT NULL IDENTITY(1,1),
    [filial_id] INT NOT NULL,
    [nome] VARCHAR(150) NOT NULL,
    [sql_codigo_rm] VARCHAR(100) NOT NULL,
    [ativa] BIT NOT NULL CONSTRAINT [DF__sql_funci__ativa__412EB0B6] DEFAULT 1,
    [data_criacao] DATETIME2 NOT NULL CONSTRAINT [DF__sql_funci__data___4222D4EF] DEFAULT sysdatetime(),
    CONSTRAINT [PK__sql_func__E199697AD28BC2D0] PRIMARY KEY CLUSTERED ([sql_func_filial_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[usuario] (
    [usuario_id] INT NOT NULL IDENTITY(1,1),
    [rm_user_id] VARCHAR(50) NOT NULL,
    [login] VARCHAR(100) NOT NULL,
    [nome] VARCHAR(150) NOT NULL,
    [perfil] VARCHAR(30) NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT [DF__usuario__ativo__37A5467C] DEFAULT 1,
    [data_ultimo_login] DATETIME2,
    [data_criacao] DATETIME2 NOT NULL CONSTRAINT [DF__usuario__data_cr__38996AB5] DEFAULT sysdatetime(),
    CONSTRAINT [PK__usuario__2ED7D2AF7595BE5F] PRIMARY KEY CLUSTERED ([usuario_id] ASC),
    CONSTRAINT [ux_usuario_rm_user] UNIQUE NONCLUSTERED ([rm_user_id] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[variavel] (
    [variavel_id] INT NOT NULL IDENTITY(1,1),
    [filial_id] INT NOT NULL,
    [nome] VARCHAR(150) NOT NULL,
    [codigo] VARCHAR(50) NOT NULL,
    [tipo] VARCHAR(20) NOT NULL,
    [sql_codigo_rm] VARCHAR(100),
    [valor_fixo] DECIMAL(18,4),
    [ativa] BIT NOT NULL CONSTRAINT [DF__variavel__ativa__45F365D3] DEFAULT 1,
    [data_criacao] DATETIME2 NOT NULL CONSTRAINT [DF__variavel__data_c__46E78A0C] DEFAULT sysdatetime(),
    CONSTRAINT [PK__variavel__D9A34CC59FE68912] PRIMARY KEY CLUSTERED ([variavel_id] ASC),
    CONSTRAINT [ux_variavel_filial_codigo] UNIQUE NONCLUSTERED ([filial_id] ASC,[codigo] ASC)
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ix_exec_func_rm] ON [dbo].[execucao_funcionario]([funcionario_id_rm] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ix_exec_func_base_rm] ON [dbo].[execucao_funcionario_base]([funcionario_id_rm] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_rm_sessao_expires_at] ON [dbo].[rm_sessao]([expires_at] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_rm_sessao_username] ON [dbo].[rm_sessao]([username] ASC);

-- AddForeignKey
ALTER TABLE [dbo].[ajuste_manual] ADD CONSTRAINT [fk_ajuste_exec_func] FOREIGN KEY ([execucao_funcionario_id]) REFERENCES [dbo].[execucao_funcionario]([execucao_funcionario_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ajuste_manual] ADD CONSTRAINT [fk_ajuste_usuario] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[usuario]([usuario_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[execucao] ADD CONSTRAINT [fk_execucao_filial] FOREIGN KEY ([filial_id]) REFERENCES [dbo].[filial]([filial_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[execucao] ADD CONSTRAINT [fk_execucao_formula] FOREIGN KEY ([formula_id]) REFERENCES [dbo].[formula]([formula_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[execucao] ADD CONSTRAINT [fk_execucao_periodo] FOREIGN KEY ([periodo_id]) REFERENCES [dbo].[periodo]([periodo_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[execucao] ADD CONSTRAINT [fk_execucao_usuario] FOREIGN KEY ([usuario_execucao]) REFERENCES [dbo].[usuario]([usuario_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[execucao_funcionario] ADD CONSTRAINT [FK__execucao___execu__02084FDA] FOREIGN KEY ([execucao_funcionario_base_id]) REFERENCES [dbo].[execucao_funcionario_base]([execucao_funcionario_base_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[execucao_funcionario] ADD CONSTRAINT [fk_exec_func_execucao] FOREIGN KEY ([execucao_id]) REFERENCES [dbo].[execucao]([execucao_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[execucao_funcionario_base] ADD CONSTRAINT [fk_exec_func_base_execucao] FOREIGN KEY ([execucao_id]) REFERENCES [dbo].[execucao]([execucao_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[formula] ADD CONSTRAINT [fk_formula_filial] FOREIGN KEY ([filial_id]) REFERENCES [dbo].[filial]([filial_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[log_execucao] ADD CONSTRAINT [fk_log_execucao] FOREIGN KEY ([execucao_id]) REFERENCES [dbo].[execucao]([execucao_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[memoria_calculo] ADD CONSTRAINT [fk_memoria_exec_func] FOREIGN KEY ([execucao_funcionario_id]) REFERENCES [dbo].[execucao_funcionario]([execucao_funcionario_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[memoria_calculo] ADD CONSTRAINT [fk_memoria_variavel] FOREIGN KEY ([variavel_id]) REFERENCES [dbo].[variavel]([variavel_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sql_funcionarios_filial] ADD CONSTRAINT [fk_sql_func_filial] FOREIGN KEY ([filial_id]) REFERENCES [dbo].[filial]([filial_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[variavel] ADD CONSTRAINT [fk_variavel_filial] FOREIGN KEY ([filial_id]) REFERENCES [dbo].[filial]([filial_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
