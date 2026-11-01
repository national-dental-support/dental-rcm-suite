-- @data: reference
-- Schemas the rest of the migrations assume exist.
--
-- 001_core_schema.sql creates five tables in an `archive` schema. Upstream that
-- schema was created by a separate SQL Server database project rather than by a
-- migration, so the migration set was not self-sufficient: applying it to a
-- genuinely empty database failed on the first file with "The specified schema
-- name 'archive' either does not exist or you do not have permission to use
-- it." This file closes that gap, and runs first by filename order.
--
-- CREATE SCHEMA must be the only statement in its batch, hence the GO.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'archive')
    EXEC(N'CREATE SCHEMA archive AUTHORIZATION dbo;');
GO
