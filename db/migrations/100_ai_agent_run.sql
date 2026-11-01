-- @data: reference
-- AI Agent execution history - tracks all scheduled and manual AI agent runs
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AiAgentRun')
BEGIN
  CREATE TABLE dbo.AiAgentRun (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    customer_id     INT NOT NULL,
    agent_type      NVARCHAR(50)  NOT NULL,   -- 'appeal','scrubber','alert','routing','categorize'
    trigger_type    NVARCHAR(30)  NOT NULL,   -- 'scheduled','event','manual'
    status          NVARCHAR(20)  NOT NULL,   -- 'running','completed','failed','skipped'
    items_processed INT DEFAULT 0,
    items_actioned  INT DEFAULT 0,
    error_message   NVARCHAR(MAX),
    started_at      DATETIME2 DEFAULT GETDATE(),
    completed_at    DATETIME2,
    metadata_json   NVARCHAR(MAX)
  );

  CREATE INDEX IX_AiAgentRun_Type ON dbo.AiAgentRun(agent_type, started_at DESC);
  CREATE INDEX IX_AiAgentRun_Customer ON dbo.AiAgentRun(customer_id, agent_type);
END
