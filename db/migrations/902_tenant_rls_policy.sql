-- @data: reference
-- Database-enforced tenant isolation.
--
-- The application already scopes every query to the acting user's customer_id.
-- This is the second layer: a SQL Server security policy, so a missing or wrong
-- application-side filter cannot leak another tenant's rows.
--
-- The predicates read the session context that
-- apps/api/src/modules/rls-context.ts sets on every query batch:
--
--   customer_id   the acting user's tenant
--   see_all       1 for a cross-tenant administrator, otherwise NULL
--
-- Those two key names are a contract between that file and this one.
--
-- Reads and writes use different predicates on purpose, because this schema has
-- two inherited conventions for "belongs to every tenant" and both are
-- load-bearing:
--
--   customer_id IS NULL   the global default. 190_tenant_isolation_lease_appconfig.sql
--                         documents it for AppConfig, and 27 query sites across
--                         the API read `customer_id = @cid OR customer_id IS NULL`
--                         - the Claim Vision rule evaluator, denial-code
--                         mapping, the reference library, settings.
--   customer_id = 0       the same idea with an explicit value, used by
--                         contractLeaseNetwork and the payer network leases.
--
-- So the READ predicate admits both, or every tenant silently loses all shared
-- reference data - system rules, denial-code crosswalks - while the tables still
-- look populated to a database owner.
--
-- Neither is writable by a tenant. A tenant that could insert a NULL or a 0 row
-- would have a channel for putting rows into every other tenant's view.
-- Publishing shared data is therefore a superadmin or migration action, which is
-- what the see_all and db_owner branches are for.
--
-- The accident this does not protect against is a tenant row that reaches NULL
-- by mistake: it becomes visible to everyone. Two things keep that from
-- happening silently - 073 backfills existing NULLs to tenant 1, and the default
-- constraints below put the acting tenant on any insert that omits the column.
--
-- Scope: every base table carrying a customer_id column, enumerated at apply
-- time rather than hardcoded. A later migration that adds a tenant-scoped table
-- must add it to this policy with ALTER SECURITY POLICY; it is not picked up
-- automatically.
--
-- NOTE: migrations and DBA sessions must connect as db_owner. The predicates
-- exempt database owners, which is also why a test run as `sa` proves nothing -
-- see docs/architecture.md.

SET QUOTED_IDENTIFIER ON;
GO

-- Read predicate: own tenant, either flavour of shared reference data, a
-- cross-tenant administrator, or a database owner.
CREATE OR ALTER FUNCTION dbo.fn_rls_tenant_read(@customer_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS allowed
    WHERE @customer_id = TRY_CAST(SESSION_CONTEXT(N'customer_id') AS INT)
       OR @customer_id IS NULL
       OR @customer_id = 0
       OR TRY_CAST(SESSION_CONTEXT(N'see_all') AS INT) = 1
       OR IS_ROLEMEMBER('db_owner') = 1;
GO

-- Write predicate: own tenant only. Neither shared-data convention is writable
-- by a tenant.
CREATE OR ALTER FUNCTION dbo.fn_rls_tenant_write(@customer_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS allowed
    WHERE @customer_id = TRY_CAST(SESSION_CONTEXT(N'customer_id') AS INT)
       OR TRY_CAST(SESSION_CONTEXT(N'see_all') AS INT) = 1
       OR IS_ROLEMEMBER('db_owner') = 1;
GO

-- Default every tenant column to the acting tenant.
--
-- 073 adds customer_id as NULL-able across the schema. Once the block predicate
-- below is in force, an INSERT that omits the column would be rejected: NULL is
-- not equal to the session's tenant, it is UNKNOWN. Upstream papered over this
-- with DEFAULT 1, which silently attributes every such row to the first tenant.
-- Defaulting to the session context is the honest version - the row lands in
-- the tenant that wrote it, and a write with no tenant context still fails.
--
-- Named constraints, not system-generated ones: a generated name differs per
-- database, which makes it impossible to find the constraint again by name.
DECLARE @defaults TABLE (stmt NVARCHAR(MAX));

INSERT INTO @defaults (stmt)
SELECT N'ALTER TABLE ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name)
     + N' ADD CONSTRAINT ' + QUOTENAME(N'DF_' + t.name + N'_customer_id')
     + N' DEFAULT (TRY_CAST(SESSION_CONTEXT(N''customer_id'') AS INT)) FOR customer_id;'
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
JOIN sys.columns AS c ON c.object_id = t.object_id AND c.name = 'customer_id'
WHERE t.is_ms_shipped = 0
  AND t.temporal_type <> 1
  AND t.name <> '__migrations'
  AND c.default_object_id = 0;        -- leave an existing default alone

DECLARE @stmt NVARCHAR(MAX);
DECLARE default_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT stmt FROM @defaults;
OPEN default_cursor;
FETCH NEXT FROM default_cursor INTO @stmt;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC sys.sp_executesql @stmt;
    FETCH NEXT FROM default_cursor INTO @stmt;
END
CLOSE default_cursor;
DEALLOCATE default_cursor;
GO

IF NOT EXISTS (SELECT 1 FROM sys.security_policies WHERE name = 'TenantIsolationPolicy')
BEGIN
    DECLARE @tables TABLE (schema_name SYSNAME, table_name SYSNAME);

    INSERT INTO @tables (schema_name, table_name)
    SELECT s.name, t.name
    FROM sys.tables AS t
    JOIN sys.schemas AS s ON s.schema_id = t.schema_id
    JOIN sys.columns AS c ON c.object_id = t.object_id
    WHERE c.name = 'customer_id'
      AND t.is_ms_shipped = 0
      AND t.temporal_type <> 1          -- history tables inherit from the parent
      AND t.name <> '__migrations';

    IF EXISTS (SELECT 1 FROM @tables)
    BEGIN
        DECLARE @sql NVARCHAR(MAX) = N'CREATE SECURITY POLICY dbo.TenantIsolationPolicy' + CHAR(13);
        DECLARE @sep NVARCHAR(8) = N'      ';

        SELECT @sql = @sql
             + @sep + N'ADD FILTER PREDICATE dbo.fn_rls_tenant_read(customer_id) ON '
             + QUOTENAME(schema_name) + N'.' + QUOTENAME(table_name) + CHAR(13)
             + N'    , ADD BLOCK PREDICATE dbo.fn_rls_tenant_write(customer_id) ON '
             + QUOTENAME(schema_name) + N'.' + QUOTENAME(table_name)
             + N' AFTER INSERT' + CHAR(13)
             + N'    , ADD BLOCK PREDICATE dbo.fn_rls_tenant_write(customer_id) ON '
             + QUOTENAME(schema_name) + N'.' + QUOTENAME(table_name)
             + N' AFTER UPDATE' + CHAR(13),
             @sep = N'    , '
        FROM @tables
        ORDER BY schema_name, table_name;

        SET @sql = @sql + N'WITH (STATE = ON);';

        EXEC sys.sp_executesql @sql;
    END
END
GO
