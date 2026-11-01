-- @data: reference
-- Migration 201: Add review workflow columns to ClaimAttachment
-- Required by image-verification InsightFlow feature
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ClaimAttachment' AND COLUMN_NAME='status')
  ALTER TABLE dbo.ClaimAttachment ADD status NVARCHAR(20) NOT NULL DEFAULT 'pending';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ClaimAttachment' AND COLUMN_NAME='ai_confidence')
  ALTER TABLE dbo.ClaimAttachment ADD ai_confidence TINYINT NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ClaimAttachment' AND COLUMN_NAME='reject_reason')
  ALTER TABLE dbo.ClaimAttachment ADD reject_reason NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ClaimAttachment' AND COLUMN_NAME='reviewed_by')
  ALTER TABLE dbo.ClaimAttachment ADD reviewed_by NVARCHAR(255) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ClaimAttachment' AND COLUMN_NAME='reviewed_at')
  ALTER TABLE dbo.ClaimAttachment ADD reviewed_at DATETIME2 NULL;
