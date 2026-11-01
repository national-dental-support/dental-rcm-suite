-- @data: reference
-- Local credential support on dbo.Users.
--
-- The schema inherited from the upstream platform had no credential storage at
-- all: authentication was delegated entirely to an external identity provider,
-- which set two request headers and left role and tenant to a database lookup.
-- This suite authenticates against its own user table, so it needs somewhere to
-- keep a password verifier.
--
-- Only a verifier is stored, never a password. `password_algo` is recorded so a
-- future migration can re-hash in place without guessing the current scheme.
--
-- The existing failed_login_count and locked_until columns are reused for
-- brute-force protection. Both were already enforced on every request by
-- resolveActor and requireRole; nothing had ever incremented them, because
-- until now there was no local login that could fail.

SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('dbo.Users', 'password_hash') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD password_hash NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.Users', 'password_algo') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD password_algo NVARCHAR(20) NULL;
END
GO

IF COL_LENGTH('dbo.Users', 'must_change_password') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD must_change_password BIT NOT NULL CONSTRAINT DF_Users_must_change_password DEFAULT 0;
END
GO

-- A user may authenticate locally (password_hash set) or through an identity
-- provider (azure_oid set) or both. No constraint requires either, because an
-- account may be provisioned before its credential is issued.
GO
