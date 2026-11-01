-- @data: reference
-- Add source column to DenialAppeal to track template vs AI generation
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'DenialAppeal' AND COLUMN_NAME = 'source'
)
BEGIN
  ALTER TABLE dbo.DenialAppeal ADD source NVARCHAR(20) DEFAULT 'template';
END
