-- @data: reference
-- Migration 191: Appeal lifecycle tracking on claimhistory
-- Adds appeal_sent_at, appeal_outcome to track payer appeal deadlines.
-- When an appeal is submitted, appeal_sent_at is stamped.
-- Cron checks: appeal_sent_at + payer response window > NOW() -> escalate.

-- claimhistory: appeal timestamps
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='claimhistory' AND COLUMN_NAME='appeal_sent_at'
)
  ALTER TABLE dbo.claimhistory ADD appeal_sent_at DATETIME NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='claimhistory' AND COLUMN_NAME='appeal_outcome'
)
  ALTER TABLE dbo.claimhistory
    ADD appeal_outcome NVARCHAR(50) NULL; -- pending | won | lost | partial
GO

-- Index for queue queries filtering by appeal status
-- SET QUOTED_IDENTIFIER ON required for filtered indexes (WHERE clause)
SET QUOTED_IDENTIFIER ON;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_claimhistory_appeal' AND object_id=OBJECT_ID('dbo.claimhistory'))
  CREATE INDEX idx_claimhistory_appeal
    ON dbo.claimhistory (appeal_sent_at, appeal_outcome)
    WHERE appeal_sent_at IS NOT NULL;
GO

-- ClaimPendingConfig: reuse pattern for appeal response window (days per customer)
-- Store payer appeal response days in AppConfig rather than a new table.
-- Key: 'appeal_response_days', value: integer (default 45).
GO
