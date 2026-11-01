-- @data: reference
-- @tags: core,denial-mapping
-- =============================================================================
-- Widen DenialCodeMapping.definition from NVARCHAR(500) to NVARCHAR(1000).
-- Some xlsx rows have definitions up to ~560 chars.
-- Idempotent.
-- =============================================================================

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.DenialCodeMapping')
    AND name = 'definition'
    AND max_length < 2000  -- NVARCHAR stores 2 bytes/char, so 500 chars = max_length 1000
)
BEGIN
  ALTER TABLE dbo.DenialCodeMapping
    ALTER COLUMN definition NVARCHAR(1000) NULL;
  PRINT 'Migration 098: widened DenialCodeMapping.definition to NVARCHAR(1000).';
END
ELSE
BEGIN
  PRINT 'Migration 098: definition column already wide enough - no-op.';
END
GO

-- Remove prior failed-apply marker for 095 so the seed re-runs this startup
-- (the runner records failed migrations in __migrations to avoid infinite retries,
-- but once we've fixed the schema we want the seed to run).
IF EXISTS (SELECT 1 FROM dbo.__migrations WHERE filename = '095_seed_denial_code_mapping.sql')
   AND NOT EXISTS (SELECT 1 FROM dbo.DenialCodeMapping)
BEGIN
  DELETE FROM dbo.__migrations WHERE filename = '095_seed_denial_code_mapping.sql';
  PRINT 'Migration 098: cleared 095 marker so seed re-runs.';
END
GO
