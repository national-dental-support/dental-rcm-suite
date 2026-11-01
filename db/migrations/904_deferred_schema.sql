-- @data: reference
-- Schema that existed only as a comment, plus one column the application used
-- to add to itself at runtime.
--
-- Three tables were documented in a /* DDL - run once */ block above the
-- controller that queries them and created by no migration, so on a fresh
-- install those features failed with "Invalid object name". A fourth object, a
-- column, was added by the priority scheduler at runtime with ALTER TABLE.
--
-- Runtime DDL cannot work here and should not: the application connects as a
-- restricted login with no schema rights, which is what SECURITY.md requires and
-- what 903 sets up. Schema belongs in migrations, so it is here, and the runtime
-- ALTER has been removed from the scheduler.

SET QUOTED_IDENTIFIER ON;
GO

-- Per-customer single sign-on, surfaced by the admin UI at
-- pages/admin/customer-sso. No provider is privileged: this is the
-- configuration surface the suite reads for any OIDC or SAML identity provider.
IF OBJECT_ID('dbo.CustomerSSOConfig', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CustomerSSOConfig (
        id                      INT IDENTITY(1,1) PRIMARY KEY,
        customer_id             INT            NOT NULL,
        provider_type           NVARCHAR(20)   NOT NULL,   -- 'saml' | 'oidc' | 'azure-ad'
        display_name            NVARCHAR(200)  NOT NULL,
        domain                  NVARCHAR(200)  NOT NULL,   -- matched against the user's email domain
        client_id               NVARCHAR(500)  NULL,       -- OIDC client_id, or SAML entity_id
        client_secret_encrypted NVARCHAR(500)  NULL,
        metadata_url            NVARCHAR(500)  NULL,
        issuer                  NVARCHAR(500)  NULL,
        authorization_url       NVARCHAR(500)  NULL,
        token_url               NVARCHAR(500)  NULL,
        certificate             NVARCHAR(MAX)  NULL,       -- SAML x509 certificate, PEM
        attribute_mapping       NVARCHAR(MAX)  NULL,       -- JSON: { email, firstName, lastName, role }
        is_active               BIT            NOT NULL DEFAULT 0,
        auto_provision_users    BIT            NOT NULL DEFAULT 0,
        default_role            NVARCHAR(50)   NOT NULL DEFAULT 'User',
        enforce_sso             BIT            NOT NULL DEFAULT 0,  -- blocks password login for this domain
        created_at              DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at              DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_CustomerSSOConfig_domain UNIQUE (domain)
    );

    CREATE INDEX IX_CustomerSSOConfig_customer ON dbo.CustomerSSOConfig (customer_id);
END
GO

-- Outbound webhooks.
IF OBJECT_ID('dbo.WebhookSubscription', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.WebhookSubscription (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        customer_id INT            NOT NULL,
        event_type  NVARCHAR(100)  NOT NULL,   -- e.g. 'claim.denied', or '*' for all
        target_url  NVARCHAR(500)  NOT NULL,
        secret      NVARCHAR(200)  NULL,       -- shared secret for payload signing
        is_active   BIT            NOT NULL DEFAULT 1,
        created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_WebhookSubscription_customer ON dbo.WebhookSubscription (customer_id);
END
GO

IF OBJECT_ID('dbo.WebhookDelivery', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.WebhookDelivery (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        subscription_id INT            NOT NULL
            CONSTRAINT FK_WebhookDelivery_subscription
            REFERENCES dbo.WebhookSubscription (id),
        customer_id     INT            NULL,    -- carried for tenant scoping
        event_type      NVARCHAR(100)  NOT NULL,
        payload         NVARCHAR(MAX)  NULL,
        response_status INT            NULL,
        response_body   NVARCHAR(MAX)  NULL,
        status          NVARCHAR(20)   NOT NULL DEFAULT 'pending',  -- pending | delivered | failed
        attempts        INT            NOT NULL DEFAULT 0,
        created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_WebhookDelivery_subscription ON dbo.WebhookDelivery (subscription_id);
END
GO

-- The column the priority scheduler used to add to itself on every run.
IF OBJECT_ID('dbo.ClaimPriority', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.ClaimPriority', 'proficiency_component') IS NULL
    ALTER TABLE dbo.ClaimPriority ADD proficiency_component FLOAT NOT NULL DEFAULT 0;
GO
