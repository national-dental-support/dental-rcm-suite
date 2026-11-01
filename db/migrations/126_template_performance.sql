-- @data: reference
-- Continuous learning: track which appeal templates win for each payer+denial_reason combination.
-- Updated by the outcome-tracking batch job when claims are marked paid/denied after appeal.
-- payer_key / denial_key are persisted computed columns to allow unique indexing on nullable columns.

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TemplatePerformance') AND type = N'U')
BEGIN
  CREATE TABLE dbo.TemplatePerformance (
    id                INT IDENTITY PRIMARY KEY,
    customer_id       INT NOT NULL,
    template_id       INT NOT NULL,
    payer_name        NVARCHAR(255) NULL,
    denial_reason     NVARCHAR(20) NULL,
    payer_key         AS ISNULL(payer_name, N'') PERSISTED,
    denial_key        AS ISNULL(denial_reason, N'') PERSISTED,
    total_used        INT NOT NULL DEFAULT 0,
    total_won         INT NOT NULL DEFAULT 0,
    total_lost        INT NOT NULL DEFAULT 0,
    win_rate          AS (CASE WHEN total_used > 0 THEN CONVERT(FLOAT, total_won) / total_used ELSE NULL END) PERSISTED,
    avg_days_to_win   DECIMAL(7,1) NULL,
    last_outcome_at   DATETIME2 NULL,
    updated_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

-- Add payer_key / denial_key if the table existed before these columns were introduced
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TemplatePerformance') AND name = N'payer_key')
  ALTER TABLE dbo.TemplatePerformance ADD payer_key AS ISNULL(payer_name, N'') PERSISTED;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TemplatePerformance') AND name = N'denial_key')
  ALTER TABLE dbo.TemplatePerformance ADD denial_key AS ISNULL(denial_reason, N'') PERSISTED;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.TemplatePerformance') AND name = N'IX_TplPerf_Template')
  CREATE UNIQUE INDEX IX_TplPerf_Template
    ON dbo.TemplatePerformance (template_id, payer_key, denial_key, customer_id);

-- Outcome log: each row is one appeal result (won/lost) linked to a template used.
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AppealOutcomeLog') AND type = N'U')
BEGIN
  CREATE TABLE dbo.AppealOutcomeLog (
    id             INT IDENTITY PRIMARY KEY,
    customer_id    INT NOT NULL,
    appeal_id      INT NOT NULL,
    template_id    INT NULL,
    claim_id       NVARCHAR(50) NOT NULL,
    payer_name     NVARCHAR(255) NULL,
    denial_reason  NVARCHAR(20) NULL,
    outcome        NVARCHAR(10) NOT NULL,
    days_to_close  INT NULL,
    recorded_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END
