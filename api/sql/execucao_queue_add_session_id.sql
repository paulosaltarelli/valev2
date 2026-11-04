/*
  Adiciona session_id na fila para o cron conseguir chamar o RM sem CurrentUserService.
  Rode isto SE você criou a tabela execucao_queue sem a coluna session_id.
*/


  ALTER TABLE dbo.execucao_queue
    ADD session_id VARCHAR(50) NULL;

  CREATE INDEX IX_execucao_queue_session
    ON dbo.execucao_queue (session_id);



