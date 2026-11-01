-- @data: reference
-- First-install bootstrap.
--
-- Creates the minimum needed to reach a login screen and configure everything
-- else: one tenant, one superadmin, and the product entitlement rows for the
-- five products. No claims, patients, payers or demo volume - see
-- docs/first-install.md for loading your own data.
--
-- The seeded account is deliberately unusable for anything but changing its own
-- password: must_change_password = 1, and the API refuses every other route
-- until that is cleared. The default password below is public knowledge, which
-- is exactly why the suite will not serve anything else while it is in place.
--
-- The two {{...}} tokens below are substituted by db/migrate.js, from:
--   BOOTSTRAP_ADMIN_EMAIL     (default: admin@localhost)
--   BOOTSTRAP_ADMIN_PASSWORD  (default: "changeme-on-first-login")
--
-- Set BOOTSTRAP_ADMIN_PASSWORD to keep the published default out of your
-- database entirely; the runner hashes it with bcrypt at cost 12 and stores
-- nothing else.

SET QUOTED_IDENTIFIER ON;
GO

DECLARE @tenant       INT           = 1;
DECLARE @tenantName   NVARCHAR(100) = N'Default Organization';
DECLARE @adminEmail   NVARCHAR(255) = {{BOOTSTRAP_ADMIN_EMAIL}};
DECLARE @adminHash    NVARCHAR(255) = {{BOOTSTRAP_ADMIN_HASH}};
DECLARE @adminUserId  INT           = 1;

-- -- Tenant -------------------------------------------------------------------
-- The tenant key is dbo.Customers.uid, which is the identity column. Every
-- other table's customer_id refers to it. Customers has a customer_id column of
-- its own only because 073 adds one to everything; it is set to the same value
-- so the row is visible under the tenant security policy from 902.
IF OBJECT_ID('dbo.Customers', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE uid = @tenant)
BEGIN
    SET IDENTITY_INSERT dbo.Customers ON;
    INSERT INTO dbo.Customers (uid, name, is_active, created_at, updated_at, customer_id)
    VALUES (@tenant, @tenantName, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), @tenant);
    SET IDENTITY_INSERT dbo.Customers OFF;
END
GO

-- -- Bootstrap superadmin -----------------------------------------------------
DECLARE @tenant      INT           = 1;
DECLARE @adminEmail  NVARCHAR(255) = {{BOOTSTRAP_ADMIN_EMAIL}};
DECLARE @adminHash   NVARCHAR(255) = {{BOOTSTRAP_ADMIN_HASH}};
DECLARE @adminUserId INT           = 1;

IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE LOWER(Email) = LOWER(@adminEmail))
BEGIN
    DECLARE @isIdentity INT = COLUMNPROPERTY(OBJECT_ID('dbo.Users'), 'userID', 'IsIdentity');

    IF @isIdentity = 1 SET IDENTITY_INSERT dbo.Users ON;

    INSERT INTO dbo.Users (
        userID, FirstName, LastName, Email, Role, customer_id,
        disabled, archived, password_hash, password_algo, must_change_password,
        failed_login_count, created_at
    )
    VALUES (
        @adminUserId, N'Bootstrap', N'Administrator', @adminEmail, N'Super Admin', @tenant,
        0, 0, @adminHash, N'bcrypt', 1,
        0, SYSUTCDATETIME()
    );

    IF @isIdentity = 1 SET IDENTITY_INSERT dbo.Users OFF;
END
GO

-- -- Products and entitlements ------------------------------------------------
-- The five products this suite ships. 'superadmin' is not a product page; it is
-- the privilege flag that grants cross-tenant access.
DECLARE @tenant INT = 1;

IF OBJECT_ID('dbo.Products', 'U') IS NOT NULL
BEGIN
    -- customer_id = 0 is the shared-reference sentinel. The product catalogue
    -- belongs to every tenant, and 902's read predicate admits 0 for all of
    -- them. Leaving it NULL would hide the catalogue from every scoped user;
    -- setting it to 1 would hide it from every tenant but the first.
    MERGE dbo.Products AS target
    USING (VALUES
        (N'denial-iq',    N'Denial-IQ',    N'fact_check',      N'/app/denial-iq',    5),
        (N'recon-iq',     N'Recon-IQ',     N'account_balance', N'/app/recon-iq',     4),
        (N'insightflow',  N'InsightFlow',  N'insights',        N'/app/insightflow',  1),
        (N'payer-iq',     N'Payer-IQ',     N'request_quote',   N'/app/payer-iq',     3),
        (N'claim-vision', N'Claim Vision', N'find_in_page',    N'/app/claim-vision', 2)
    ) AS source (slug, name, icon, nav_route, nav_order)
    ON target.slug = source.slug
    WHEN NOT MATCHED THEN
        INSERT (slug, name, icon, nav_route, nav_order, is_active, created_at, customer_id)
        VALUES (source.slug, source.name, source.icon, source.nav_route, source.nav_order,
                1, SYSUTCDATETIME(), 0);
END
GO

DECLARE @tenant INT = 1;

IF OBJECT_ID('dbo.ProductSubscriptions', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.Products', 'U') IS NOT NULL
BEGIN
    INSERT INTO dbo.ProductSubscriptions (customer_id, product_id, is_active, created_at)
    SELECT @tenant, p.id, 1, SYSUTCDATETIME()
    FROM dbo.Products p
    WHERE p.slug IN (N'denial-iq', N'recon-iq', N'insightflow', N'payer-iq', N'claim-vision')
      AND NOT EXISTS (
          SELECT 1 FROM dbo.ProductSubscriptions s
          WHERE s.customer_id = @tenant AND s.product_id = p.id
      );
END
GO
