/*
execucao_queue - fila de processamento em background por funcionário base.

Objetivo:
- Garantir que o cron processe APENAS funcionários selecionados no front (via enqueue).
- Permitir retomada após crash (lock + stale lock) e retry/backoff (tentativas + next_run_at).

Observação:
- Ajuste o schema/owner se necessário (assumindo dbo).
*/

CREATE TABLE dbo.execucao_queue (
    queue_id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_execucao_queue PRIMARY KEY,
    execucao_id INT NOT NULL,
    execucao_funcionario_base_id INT NOT NULL,
    tipo VARCHAR(20) NOT NULL, -- 'VARIAVEIS' | 'VALORES'
    status VARCHAR(20) NOT NULL CONSTRAINT DF_execucao_queue_status DEFAULT ('PENDENTE'), -- PENDENTE|PROCESSANDO|CONCLUIDO|ERRO|CANCELADO
    tentativas INT NOT NULL CONSTRAINT DF_execucao_queue_tentativas DEFAULT (0),
    next_run_at DATETIME2 NULL,
    lock_owner VARCHAR(64) NULL,
    locked_at DATETIME2 NULL,
    last_error VARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_execucao_queue_created_at DEFAULT (SYSDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_execucao_queue_updated_at DEFAULT (SYSDATETIME())
);

ALTER TABLE dbo.execucao_queue
ADD CONSTRAINT FK_execucao_queue_execucao FOREIGN KEY (execucao_id) REFERENCES dbo.execucao (execucao_id);

ALTER TABLE dbo.execucao_queue
ADD CONSTRAINT FK_execucao_queue_exec_func_base FOREIGN KEY (execucao_funcionario_base_id) REFERENCES dbo.execucao_funcionario_base (execucao_funcionario_base_id);

-- Evita duplicar itens pendentes/rodando para o mesmo (execucao, func_base, tipo)
CREATE UNIQUE
INDEX UX_execucao_queue_open ON dbo.execucao_queue (
    execucao_id,
    execucao_funcionario_base_id,
    tipo
)
WHERE
    status IN ('PENDENTE', 'PROCESSANDO');

CREATE
INDEX IX_execucao_queue_runnable ON dbo.execucao_queue (
    status,
    tipo,
    next_run_at,
    created_at
);

CREATE
INDEX IX_execucao_queue_execucao_status ON dbo.execucao_queue (execucao_id, status);