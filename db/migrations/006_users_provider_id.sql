-- @data: reference
-- Add ProviderID column to users table (required by require-role middleware)
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'ProviderID'
)
ALTER TABLE [dbo].[users] ADD [ProviderID] smallint NULL;
GO

-- Add created_by column to Adjustment table (required by seed reset)
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Adjustment' AND COLUMN_NAME = 'created_by'
)
ALTER TABLE [dbo].[Adjustment] ADD [created_by] nvarchar(255) NULL;
GO
