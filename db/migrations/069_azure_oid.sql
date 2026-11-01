-- @data: reference
-- Add Azure AD Object ID column for immutable user linking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='azure_oid')
BEGIN
  ALTER TABLE dbo.Users ADD azure_oid NVARCHAR(36) NULL;
  PRINT 'Added azure_oid column to Users table';
END
GO

-- Unique filtered index (only non-null values must be unique)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Users_azure_oid')
  CREATE UNIQUE INDEX IX_Users_azure_oid ON dbo.Users (azure_oid) WHERE azure_oid IS NOT NULL;
