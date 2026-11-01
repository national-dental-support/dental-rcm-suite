-- @data: reference
-- Migration 218: Widen era_remittance_file_id from int to nvarchar(50)
-- era-processor generates string IDs like 'RMF-ERA-...' which couldn't be stored
-- in the original int column, causing silent INSERT failures on ERA upload.
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'remittanceLine'
    AND COLUMN_NAME = 'era_remittance_file_id'
    AND DATA_TYPE = 'int'
)
BEGIN
  ALTER TABLE dbo.remittanceLine
    ALTER COLUMN era_remittance_file_id nvarchar(50) NULL;
END
GO
