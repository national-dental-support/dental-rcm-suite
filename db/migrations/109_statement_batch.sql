-- @data: reference
-- A2: Statement batch status tracking
CREATE TABLE dbo.StatementBatch (
  id              INT IDENTITY PRIMARY KEY,
  batch_id        NVARCHAR(50)  NOT NULL UNIQUE,
  customer_id     INT           NOT NULL,
  status          NVARCHAR(20)  NOT NULL DEFAULT 'queued', -- queued|processing|completed|failed
  total_patients  INT,
  completed_count INT           NOT NULL DEFAULT 0,
  error_count     INT           NOT NULL DEFAULT 0,
  requested_by    NVARCHAR(100),
  started_at      DATETIME,
  completed_at    DATETIME,
  download_url    NVARCHAR(500),
  created_at      DATETIME      NOT NULL DEFAULT GETDATE()
);
