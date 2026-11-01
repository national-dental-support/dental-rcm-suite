-- @data: reference
-- Add created_at column to Users table for account creation tracking
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Users' AND COLUMN_NAME = 'created_at'
)
BEGIN
  ALTER TABLE dbo.Users ADD created_at DATETIME NULL;
  PRINT 'Added created_at column to Users table';
END
ELSE
  PRINT 'created_at column already exists on Users table';
GO

-- Backfill existing users: use last_login_at minus a few days, or a default date
UPDATE dbo.Users
SET created_at = ISNULL(DATEADD(DAY, -30, last_login_at), '2026-01-15')
WHERE created_at IS NULL;

PRINT 'Backfilled created_at for existing users';
