-- @data: reference
-- AI-generated proactive alerts
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AiAlert')
BEGIN
  CREATE TABLE dbo.AiAlert (
    id                   INT IDENTITY(1,1) PRIMARY KEY,
    customer_id          INT NOT NULL,
    alert_type           NVARCHAR(50) NOT NULL,
    severity             NVARCHAR(20) NOT NULL,
    title                NVARCHAR(255) NOT NULL,
    detail               NVARCHAR(MAX),
    ai_explanation       NVARCHAR(MAX),
    recommended_actions  NVARCHAR(MAX),
    dismissed            BIT DEFAULT 0,
    dismissed_by         NVARCHAR(255),
    dismissed_at         DATETIME2,
    created_at           DATETIME2 DEFAULT GETDATE()
  );

  CREATE INDEX IX_AiAlert_Customer ON dbo.AiAlert(customer_id, created_at DESC);
END
