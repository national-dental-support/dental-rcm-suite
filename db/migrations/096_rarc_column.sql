-- @data: reference
-- @tags: core,denial-mapping
-- =============================================================================
-- Add RARCCode column alongside CARCCode on post-adjudication tables.
-- RARC ships with 835 CAS/LQ segments, so it lives on the same claim rows.
-- Idempotent.
-- =============================================================================

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.recon_report') AND name = 'RARCCode'
)
BEGIN
  ALTER TABLE dbo.recon_report ADD RARCCode NVARCHAR(50) NULL;
  PRINT 'Migration 096: added RARCCode to recon_report.';
END
ELSE
BEGIN
  PRINT 'Migration 096: RARCCode already exists on recon_report - no-op.';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.claimhistory') AND name = 'RARCCode'
)
BEGIN
  ALTER TABLE dbo.claimhistory ADD RARCCode NVARCHAR(50) NULL;
  PRINT 'Migration 096: added RARCCode to claimhistory.';
END
ELSE
BEGIN
  PRINT 'Migration 096: RARCCode already exists on claimhistory - no-op.';
END
GO
