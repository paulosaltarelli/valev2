/*
  Adiciona CODCOLIGADA/CODFILIAL na fila de GEO para suportar funcionários
  vinculados a filiais diferentes no RM.

  Rode este SQL manualmente (sem prisma migrate) em ambientes existentes.
*/

ALTER TABLE dbo.geo_queue
  ADD codcoligada INT NULL,
      codfilial INT NULL;

-- Índice para facilitar agrupamento/execução por destino (RM)
CREATE INDEX IX_geo_queue_filial_rm_status_next_created
  ON dbo.geo_queue (filial_id, codcoligada, codfilial, status, next_run_at, created_at);

