-- @data: reference
-- The restricted application login.
--
-- 902 creates a security policy whose predicates exempt db_owner. That exemption
-- exists so migrations and restores can work, but it means an API connected as
-- `sa` gets no database-enforced isolation at all - the policy is present,
-- evaluates to true for every row, and nothing looks wrong. Shipping that as the
-- default would make the second layer decorative.
--
-- So this creates the login the API is meant to use: read and write on the
-- application tables, and nothing more. Deliberately NOT db_owner.
--
-- Driven by two optional settings:
--   APP_DB_USER      (default: dental_rcm_app)
--   APP_DB_PASSWORD  (no default)
--
-- With no APP_DB_PASSWORD this migration does nothing and says so. That is a
-- supported choice for a single-user trial - the application-layer filter still
-- applies - but it is one layer, not two, and it is not a deployment posture.

SET QUOTED_IDENTIFIER ON;
GO

DECLARE @user     SYSNAME       = {{APP_DB_USER}};
DECLARE @password NVARCHAR(128) = {{APP_DB_PASSWORD}};
DECLARE @db       SYSNAME       = DB_NAME();
DECLARE @sql      NVARCHAR(MAX);

IF @password IS NULL OR LEN(@password) = 0
BEGIN
    PRINT 'APP_DB_PASSWORD not set - skipping creation of the restricted application login.';
    PRINT 'The API will connect with whatever DB_USER names. If that login is a';
    PRINT 'member of db_owner, the security policy from 902 is inert for it.';
END
ELSE
BEGIN
    -- Server-level login.
    IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @user)
    BEGIN
        SET @sql = N'CREATE LOGIN ' + QUOTENAME(@user)
                 + N' WITH PASSWORD = ' + QUOTENAME(@password, '''')
                 + N', DEFAULT_DATABASE = ' + QUOTENAME(@db)
                 + N', CHECK_POLICY = ON;';
        EXEC sys.sp_executesql @sql;
        PRINT 'Created login.';
    END

    -- Database user.
    IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @user)
    BEGIN
        SET @sql = N'CREATE USER ' + QUOTENAME(@user) + N' FOR LOGIN ' + QUOTENAME(@user) + N';';
        EXEC sys.sp_executesql @sql;
        PRINT 'Created database user.';
    END

    -- Read and write on the application tables. Note what is absent:
    -- db_owner, db_ddladmin, and db_securityadmin. The first would bypass the
    -- security policy; the other two would let the login remove it.
    SET @sql = N'ALTER ROLE db_datareader ADD MEMBER ' + QUOTENAME(@user) + N';';
    EXEC sys.sp_executesql @sql;
    SET @sql = N'ALTER ROLE db_datawriter ADD MEMBER ' + QUOTENAME(@user) + N';';
    EXEC sys.sp_executesql @sql;

    -- The application calls stored procedures and scalar functions in dbo.
    SET @sql = N'GRANT EXECUTE ON SCHEMA::dbo TO ' + QUOTENAME(@user) + N';';
    EXEC sys.sp_executesql @sql;

    -- Guard against the one mistake that would silently undo all of this.
    IF EXISTS (
        SELECT 1
        FROM sys.database_role_members AS drm
        JOIN sys.database_principals  AS r ON r.principal_id = drm.role_principal_id
        JOIN sys.database_principals  AS m ON m.principal_id = drm.member_principal_id
        WHERE r.name = 'db_owner' AND m.name = @user
    )
    BEGIN
        RAISERROR('The application login is a member of db_owner, which disables the tenant security policy for it. Refusing to continue.', 16, 1);
    END
END
GO
