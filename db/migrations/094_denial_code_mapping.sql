-- @data: reference
-- @tags: core,denial-mapping
-- =============================================================================
-- Create dbo.DenialCodeMapping
-- Maps (payer CARC, X12 CARC, RARC) -> business grouping.
-- Source: DenialCode.xlsx 'Mapped Codes to Groups' sheet (1,507 rows).
-- Idempotent.
-- =============================================================================

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'DenialCodeMapping'
)
BEGIN
  CREATE TABLE dbo.DenialCodeMapping (
    id                      INT IDENTITY(1,1) PRIMARY KEY,
    carc_payer              NVARCHAR(50) NULL,   -- Col A: payer-specific CARC (e.g. 'ZP1', 'B61')
    carc_x12                NVARCHAR(50) NULL,   -- Col B: X12 standard CARC (e.g. 'OA96', 'PR1', '45')
    rarc                    NVARCHAR(50) NULL,   -- Col C: RARC (e.g. 'MA67', 'N30')
    definition              NVARCHAR(1000) NULL, -- Col D: human-readable (some rows ~560 chars)
    grouping                NVARCHAR(100) NOT NULL, -- Col E: 'Denial - *' or 'Reason Code - *'
    insurance_actionable    BIT NULL,
    patient_responsible     BIT NULL,
    no_action_needed        BIT NULL,
    customer_id             INT NULL,            -- NULL = global/shared mapping
    created_at              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_DenialCodeMapping_x12_rarc ON dbo.DenialCodeMapping(carc_x12, rarc);
  CREATE INDEX IX_DenialCodeMapping_payer    ON dbo.DenialCodeMapping(carc_payer);
  CREATE INDEX IX_DenialCodeMapping_grouping ON dbo.DenialCodeMapping(grouping);

  PRINT 'Migration 094: created DenialCodeMapping table.';
END
ELSE
BEGIN
  PRINT 'Migration 094: DenialCodeMapping already exists - no-op.';
END
GO
