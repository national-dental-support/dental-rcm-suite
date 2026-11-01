-- @data: reference
-- 073_add_customer_id_all_tables.sql
-- Ensures every table in the system has a customer_id column for enterprise isolation.
-- Idempotent: only adds the column if it doesn't already exist.
-- Backfills existing rows with customer_id = 1, the first tenant.
--
-- A NULL customer_id is not a harmless gap once the security policy from
-- 902_tenant_rls_policy.sql is in place: the predicate rejects it, so the row
-- is invisible to every scoped user while staying visible to a database owner.
-- That is why phase 2 backfills rather than leaving NULLs.

-- ================================================================
-- Phase 1: Add customer_id INT NULL to all tables that lack it
-- ================================================================

DECLARE @tbl NVARCHAR(256);
DECLARE @sql NVARCHAR(MAX);

DECLARE tbl_cursor CURSOR LOCAL FAST_FORWARD FOR
  SELECT t.name
  FROM sys.tables t
  WHERE NOT EXISTS (
    SELECT 1 FROM sys.columns c
    WHERE c.object_id = t.object_id AND c.name = 'customer_id'
  )
  AND t.name NOT LIKE 'sys%'
  AND t.name NOT LIKE '__migration%'
  AND t.name NOT LIKE 'z%';   -- skip archive/temp tables

OPEN tbl_cursor;
FETCH NEXT FROM tbl_cursor INTO @tbl;

WHILE @@FETCH_STATUS = 0
BEGIN
  SET @sql = 'ALTER TABLE [' + @tbl + '] ADD customer_id INT NULL;';
  EXEC sp_executesql @sql;
  PRINT 'Added customer_id to ' + @tbl;
  FETCH NEXT FROM tbl_cursor INTO @tbl;
END;

CLOSE tbl_cursor;
DEALLOCATE tbl_cursor;

-- ================================================================
-- Phase 2: Backfill all NULL customer_id rows with 1, the first tenant
-- ================================================================

DECLARE @tbl2 NVARCHAR(256);
DECLARE @sql2 NVARCHAR(MAX);
DECLARE @cnt INT;

DECLARE backfill_cursor CURSOR LOCAL FAST_FORWARD FOR
  SELECT t.name
  FROM sys.tables t
  JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'customer_id'
  WHERE t.name NOT LIKE 'sys%'
  AND t.name NOT LIKE '__migration%'
  AND t.name NOT LIKE 'z%';

OPEN backfill_cursor;
FETCH NEXT FROM backfill_cursor INTO @tbl2;

WHILE @@FETCH_STATUS = 0
BEGIN
  SET @sql2 = 'UPDATE [' + @tbl2 + '] SET customer_id = 1 WHERE customer_id IS NULL;';
  EXEC sp_executesql @sql2;
  SET @cnt = @@ROWCOUNT;
  IF @cnt > 0
    PRINT 'Backfilled ' + CAST(@cnt AS VARCHAR) + ' rows in ' + @tbl2;
  FETCH NEXT FROM backfill_cursor INTO @tbl2;
END;

CLOSE backfill_cursor;
DEALLOCATE backfill_cursor;

PRINT 'Migration 073 complete: all tables have customer_id.';
