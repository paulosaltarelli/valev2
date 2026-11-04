/*
Adiciona flag para auto-enfileirar VARIAVEIS+VALORES após criar a execução via execucao_create_queue.
Sem migrations (raw SQL).
*/

ALTER TABLE dbo.execucao_create_queue
ADD processar_variaveis_valores BIT NOT NULL
    CONSTRAINT DF_execucao_create_queue_processar_variaveis_valores DEFAULT (0);

