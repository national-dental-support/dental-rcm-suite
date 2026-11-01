-- @data: reference
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='rules' AND COLUMN_NAME='ExecutionOrder'
)
BEGIN
  ALTER TABLE dbo.rules ADD ExecutionOrder INT NOT NULL DEFAULT 0;
END
GO

-- Backfill: assign order by creation date per customer
;WITH ranked AS (
  SELECT
    RuleID,
    ROW_NUMBER() OVER (
      PARTITION BY ISNULL(customer_id, 0)
      ORDER BY CreateDate ASC, RuleID ASC
    ) - 1 AS rn
  FROM dbo.rules
)
UPDATE r
SET r.ExecutionOrder = ranked.rn
FROM dbo.rules r
JOIN ranked ON ranked.RuleID = r.RuleID
WHERE r.ExecutionOrder = 0;
GO
