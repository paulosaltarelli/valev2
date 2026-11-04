/*
execucao_create_queue - fila de criação assíncrona de execuções (processamentos) por filial/período.

Objetivo:
- Permitir criar execuções em lote (multi-filial) de forma assíncrona, via cron.
- Permitir retomada após crash (lock + stale lock) e retry/backoff (tentativas + next_run_at).

Observação:
- Ajuste o schema/owner se necessário (assumindo dbo).
*/

CREATE TABLE dbo.execucao_create_queue (
    queue_id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_execucao_create_queue PRIMARY KEY,
    filial_id INT NOT NULL,
    periodo_id INT NOT NULL,
    usuario_execucao INT NOT NULL,
    session_id VARCHAR(50) NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT DF_execucao_create_queue_status DEFAULT ('PENDENTE'), -- PENDENTE|PROCESSANDO|CONCLUIDO|ERRO|CANCELADO
    tentativas INT NOT NULL CONSTRAINT DF_execucao_create_queue_tentativas DEFAULT (0),
    next_run_at DATETIME2 NULL,
    lock_owner VARCHAR(64) NULL,
    locked_at DATETIME2 NULL,
    last_error VARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_execucao_create_queue_created_at DEFAULT (SYSDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_execucao_create_queue_updated_at DEFAULT (SYSDATETIME())
);

ALTER TABLE dbo.execucao_create_queue
ADD CONSTRAINT FK_execucao_create_queue_filial
FOREIGN KEY (filial_id) REFERENCES dbo.filial (filial_id);

ALTER TABLE dbo.execucao_create_queue
ADD CONSTRAINT FK_execucao_create_queue_periodo
FOREIGN KEY (periodo_id) REFERENCES dbo.periodo (periodo_id);

ALTER TABLE dbo.execucao_create_queue
ADD CONSTRAINT FK_execucao_create_queue_usuario
FOREIGN KEY (usuario_execucao) REFERENCES dbo.usuario (usuario_id);

CREATE INDEX IX_execucao_create_queue_runnable ON dbo.execucao_create_queue (
    status,
    next_run_at,
    created_at
);

CREATE INDEX IX_execucao_create_queue_usuario_status ON dbo.execucao_create_queue (
    usuario_execucao,
    status
);

ALTER TABLE "dbo"."periodo" ADD "ativo" BIT NOT NULL DEFAULT 1
