-- @data: reference
-- Migration 039: Add permissions column to Users table
-- Required by POST /api/admin/users endpoint for role-specific permissions
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Users' AND COLUMN_NAME = 'permissions'
)
BEGIN
  ALTER TABLE dbo.Users ADD permissions NVARCHAR(MAX) NULL;
  PRINT 'Added permissions column to Users table';
END
ELSE
  PRINT 'permissions column already exists on Users table';
