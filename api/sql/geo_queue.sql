/*
Fila dedicada para processamento de GEO (cálculo de KM + atualização no RM)
- Você executa este SQL manualmente (sem prisma migrate).
- MSSQL / dbo schema.
*/

CREATE TABLE dbo.geo_queue (
    geo_queue_id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    filial_id INT NOT NULL,
    chapa VARCHAR(50) NOT NULL,
    codcoligada INT NULL,
    codfilial INT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT DF_geo_queue_status DEFAULT ('PENDENTE'),
    tentativas INT NOT NULL CONSTRAINT DF_geo_queue_tentativas DEFAULT (0),
    next_run_at DATETIME2 NULL,
    lock_owner VARCHAR(100) NULL,
    locked_at DATETIME2 NULL,
    last_error NVARCHAR(MAX) NULL,
    session_id VARCHAR(50) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_geo_queue_created_at DEFAULT (SYSDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_geo_queue_updated_at DEFAULT (SYSDATETIME()),
    CONSTRAINT FK_geo_queue_filial FOREIGN KEY (filial_id) REFERENCES dbo.filial (filial_id)
);

-- Índices (idempotentes)
CREATE
INDEX IX_geo_queue_status_next_created ON dbo.geo_queue (
    status,
    next_run_at,
    created_at
);

CREATE
INDEX IX_geo_queue_filial_status_next_created ON dbo.geo_queue (
    filial_id,
    status,
    next_run_at,
    created_at
);

CREATE
INDEX IX_geo_queue_filial_chapa ON dbo.geo_queue (filial_id, chapa);

CREATE
INDEX IX_geo_queue_filial_rm_status_next_created ON dbo.geo_queue (
    filial_id,
    codcoligada,
    codfilial,
    status,
    next_run_at,
    created_at
);