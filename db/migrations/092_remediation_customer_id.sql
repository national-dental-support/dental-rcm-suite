-- @data: reference
-- 092_remediation_customer_id.sql
-- Ensures RemediationStepSet has a customer_id column for enterprise tenant isolation.
-- Idempotent: safe to run even if migration 073 already added the column.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.RemediationStepSet') AND name = 'customer_id'
)
BEGIN
  ALTER TABLE [dbo].[RemediationStepSet] ADD [customer_id] INT NULL;
  PRINT 'Added customer_id to RemediationStepSet';
END
ELSE
BEGIN
  PRINT 'customer_id already exists on RemediationStepSet - no-op';
END
GO

PRINT 'Migration 092 complete.';
