-- @data: reference
-- Migration 186: Add SFTP columns to ClearinghouseConnection for ERA auto-fetch
-- Creates the table if missing; idempotent column adds if it already exists.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_NAME = 'ClearinghouseConnection'
)
BEGIN
  CREATE TABLE dbo.ClearinghouseConnection (
    id                INT IDENTITY PRIMARY KEY,
    customer_id       SMALLINT NOT NULL DEFAULT 1,
    connection_name   NVARCHAR(200) NOT NULL,
    payer_id          NVARCHAR(50)  NULL,
    is_active         BIT NOT NULL DEFAULT 1,
    sftp_host         NVARCHAR(200) NULL,
    sftp_port         INT NULL DEFAULT 22,
    sftp_user         NVARCHAR(100) NULL,
    sftp_password_enc NVARCHAR(500) NULL,  -- AES-256-GCM via apps/api/src/utils/crypto.ts
    sftp_era_path     NVARCHAR(500) NULL,
    last_era_fetch_at DATETIME2 NULL,
    created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ClearinghouseConnection' AND COLUMN_NAME = 'sftp_host')
    ALTER TABLE dbo.ClearinghouseConnection ADD sftp_host NVARCHAR(200) NULL;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ClearinghouseConnection' AND COLUMN_NAME = 'sftp_port')
    ALTER TABLE dbo.ClearinghouseConnection ADD sftp_port INT NULL DEFAULT 22;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ClearinghouseConnection' AND COLUMN_NAME = 'sftp_user')
    ALTER TABLE dbo.ClearinghouseConnection ADD sftp_user NVARCHAR(100) NULL;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ClearinghouseConnection' AND COLUMN_NAME = 'sftp_password_enc')
    ALTER TABLE dbo.ClearinghouseConnection ADD sftp_password_enc NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ClearinghouseConnection' AND COLUMN_NAME = 'sftp_era_path')
    ALTER TABLE dbo.ClearinghouseConnection ADD sftp_era_path NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ClearinghouseConnection' AND COLUMN_NAME = 'last_era_fetch_at')
    ALTER TABLE dbo.ClearinghouseConnection ADD last_era_fetch_at DATETIME2 NULL;
END
