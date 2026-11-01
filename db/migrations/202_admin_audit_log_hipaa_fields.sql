-- @data: reference
-- Migration 202: Add HIPAA/SOC2 required fields to AdminAuditLog
-- Adds: cause (why the action occurred), outcome (success/failure), duration_ms (how long it took)

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.AdminAuditLog') AND name = 'cause'
)
  ALTER TABLE dbo.AdminAuditLog ADD cause NVARCHAR(500) NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.AdminAuditLog') AND name = 'outcome'
)
  ALTER TABLE dbo.AdminAuditLog ADD outcome NVARCHAR(20) NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.AdminAuditLog') AND name = 'duration_ms'
)
  ALTER TABLE dbo.AdminAuditLog ADD duration_ms INT NULL;
GO
