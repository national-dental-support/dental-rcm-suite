-- @data: reference
-- Indexes for rejectedclaims table performance
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rejectedclaims_RuleID_CreateDate' AND object_id = OBJECT_ID('dbo.rejectedclaims'))
  CREATE INDEX IX_rejectedclaims_RuleID_CreateDate ON dbo.rejectedclaims (RuleID, CreateDate);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rejectedclaims_CreateDate' AND object_id = OBJECT_ID('dbo.rejectedclaims'))
  CREATE INDEX IX_rejectedclaims_CreateDate ON dbo.rejectedclaims (CreateDate DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ruleshistory_RuleID' AND object_id = OBJECT_ID('dbo.ruleshistory'))
  CREATE INDEX IX_ruleshistory_RuleID ON dbo.ruleshistory (RuleID, ModifiedDate DESC);

-- Add RuleType column to rejectedclaims if missing (for system vs custom tracking)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='rejectedclaims' AND COLUMN_NAME='RuleType')
  ALTER TABLE dbo.rejectedclaims ADD RuleType NVARCHAR(50) NULL;
GO

-- Backfill RuleType from rules table (separate batch so column is visible)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='rejectedclaims' AND COLUMN_NAME='RuleType')
BEGIN
  UPDATE rc SET rc.RuleType = r.RuleType
  FROM dbo.rejectedclaims rc
  JOIN dbo.rules r ON r.RuleID = rc.RuleID
  WHERE rc.RuleType IS NULL;
END
