-- @data: reference
-- Add DEFAULT constraint to Users.last_activity_at so it's never NULL
-- Prevents SESSION_EXPIRED outage when new users are created without explicit last_activity_at

IF NOT EXISTS (
  SELECT 1 FROM sys.default_constraints
  WHERE name = 'DF_Users_last_activity_at'
    AND parent_object_id = OBJECT_ID('dbo.Users')
)
BEGIN
  ALTER TABLE dbo.Users
    ADD CONSTRAINT DF_Users_last_activity_at DEFAULT GETDATE() FOR last_activity_at;
  PRINT 'Added DEFAULT GETDATE() constraint to Users.last_activity_at';
END
ELSE
  PRINT 'DF_Users_last_activity_at constraint already exists';

-- Backfill any existing NULL values
UPDATE dbo.Users SET last_activity_at = GETDATE() WHERE last_activity_at IS NULL;
