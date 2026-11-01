-- @data: reference
-- Migration 190: Add customer_id to contractLeaseNetwork and AppConfig for tenant isolation

-- -- contractLeaseNetwork ------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'contractLeaseNetwork' AND COLUMN_NAME = 'customer_id'
)
BEGIN
  ALTER TABLE dbo.contractLeaseNetwork ADD customer_id INT NOT NULL DEFAULT 0;
  CREATE INDEX idx_contractLeaseNetwork_customer ON dbo.contractLeaseNetwork (customer_id);
END
GO

-- -- AppConfig -----------------------------------------------------------------
-- NULL = global default (visible to all tenants); non-NULL = tenant-specific override.
-- Read pattern: WHERE customer_id = @cid OR customer_id IS NULL ORDER BY customer_id DESC
-- The first row wins (tenant-specific row sorts above global NULL).
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'AppConfig' AND COLUMN_NAME = 'customer_id'
)
BEGIN
  ALTER TABLE dbo.AppConfig ADD customer_id INT NULL;
  CREATE INDEX idx_AppConfig_customer ON dbo.AppConfig (customer_id);
END
GO
