-- @data: reference
-- 093_catalog_tables_customer_id.sql
-- Adds customer_id to LocationCatalog, ProviderCatalog, and PayerCatalog so
-- each tenant's locations/providers/payers are isolated correctly.
-- Migration 070 created these tables without customer_id; this adds the column
-- idempotently and updates the UNIQUE constraint to be per-tenant.

-- -- LocationCatalog ----------------------------------------------------------

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.LocationCatalog') AND name = 'customer_id'
)
BEGIN
  ALTER TABLE [dbo].[LocationCatalog] ADD [customer_id] INT NULL;
  CREATE INDEX IX_LC_customer ON LocationCatalog (customer_id);
  PRINT 'Added customer_id to LocationCatalog';
END
ELSE
  PRINT 'customer_id already exists on LocationCatalog - no-op';

-- Replace the global UNIQUE(name) with per-tenant UNIQUE(name, customer_id)
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.LocationCatalog') AND name = 'UQ_LocationCatalog_name'
)
BEGIN
  ALTER TABLE [dbo].[LocationCatalog] DROP CONSTRAINT UQ_LocationCatalog_name;
  PRINT 'Dropped UQ_LocationCatalog_name';
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.LocationCatalog') AND name = 'UQ_LocationCatalog_name_cust'
)
BEGIN
  ALTER TABLE [dbo].[LocationCatalog]
    ADD CONSTRAINT UQ_LocationCatalog_name_cust UNIQUE (name, customer_id);
  PRINT 'Added UQ_LocationCatalog_name_cust (name + customer_id)';
END

-- -- ProviderCatalog ----------------------------------------------------------

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.ProviderCatalog') AND name = 'customer_id'
)
BEGIN
  ALTER TABLE [dbo].[ProviderCatalog] ADD [customer_id] INT NULL;
  PRINT 'Added customer_id to ProviderCatalog';
END
ELSE
  PRINT 'customer_id already exists on ProviderCatalog - no-op';

-- -- PayerCatalog -------------------------------------------------------------

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.PayerCatalog') AND name = 'customer_id'
)
BEGIN
  ALTER TABLE [dbo].[PayerCatalog] ADD [customer_id] INT NULL;
  PRINT 'Added customer_id to PayerCatalog';
END
ELSE
  PRINT 'customer_id already exists on PayerCatalog - no-op';

GO
PRINT 'Migration 093 complete.';
