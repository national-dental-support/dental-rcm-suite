-- @data: reference
-- Migration 122: Extend BankAccountConnection with full connectivity, compliance, and audit log
-- Supports HIPAA, PCI-DSS, SOC 2 Type II, and HITECH requirements

-- --- Extend BankAccountConnection --------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='account_holder_name')
  ALTER TABLE dbo.BankAccountConnection ADD account_holder_name NVARCHAR(200) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='bank_address')
  ALTER TABLE dbo.BankAccountConnection ADD bank_address NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='bank_phone')
  ALTER TABLE dbo.BankAccountConnection ADD bank_phone NVARCHAR(30) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='bank_contact_name')
  ALTER TABLE dbo.BankAccountConnection ADD bank_contact_name NVARCHAR(200) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='swift_bic')
  ALTER TABLE dbo.BankAccountConnection ADD swift_bic NVARCHAR(11) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='connection_type')
  ALTER TABLE dbo.BankAccountConnection ADD connection_type NVARCHAR(30) NOT NULL DEFAULT 'manual';
  -- manual | ach_debit | sftp | api | plaid

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='connection_status')
  ALTER TABLE dbo.BankAccountConnection ADD connection_status NVARCHAR(30) NOT NULL DEFAULT 'active';
  -- active | pending_verification | suspended | disconnected | error

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='verification_method')
  ALTER TABLE dbo.BankAccountConnection ADD verification_method NVARCHAR(30) NULL;
  -- micro_deposit | instant_auth | voided_check | bank_letter

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='verified_at')
  ALTER TABLE dbo.BankAccountConnection ADD verified_at DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='primary_use')
  ALTER TABLE dbo.BankAccountConnection ADD primary_use NVARCHAR(200) NULL;
  -- pipe-separated: reconciliation|payroll|refunds|vendor

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='last_sync_at')
  ALTER TABLE dbo.BankAccountConnection ADD last_sync_at DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='last_sync_status')
  ALTER TABLE dbo.BankAccountConnection ADD last_sync_status NVARCHAR(30) NULL;
  -- success | failed | partial | none

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sync_frequency')
  ALTER TABLE dbo.BankAccountConnection ADD sync_frequency NVARCHAR(20) NOT NULL DEFAULT 'manual';
  -- manual | daily | weekly | monthly

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='balance_threshold')
  ALTER TABLE dbo.BankAccountConnection ADD balance_threshold DECIMAL(12,2) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='pci_scope')
  ALTER TABLE dbo.BankAccountConnection ADD pci_scope BIT NOT NULL DEFAULT 1;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='hipaa_baa_on_file')
  ALTER TABLE dbo.BankAccountConnection ADD hipaa_baa_on_file BIT NOT NULL DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='notes')
  ALTER TABLE dbo.BankAccountConnection ADD notes NVARCHAR(MAX) NULL;

-- --- Audit Log Table ---------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='BankAccountAuditLog')
BEGIN
  CREATE TABLE dbo.BankAccountAuditLog (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    bank_account_id  INT            NOT NULL,
    customer_id      INT            NOT NULL DEFAULT 0,
    event_type       NVARCHAR(50)   NOT NULL,
    -- account_created | account_updated | account_deactivated | account_deleted
    -- connection_tested | connection_verified | sync_success | sync_failed
    -- credentials_rotated | permission_granted | permission_revoked | status_changed
    -- compliance_reviewed | baa_recorded
    event_detail     NVARCHAR(MAX)  NULL,  -- JSON: before/after, context
    actor_email      NVARCHAR(200)  NOT NULL,
    actor_ip         NVARCHAR(45)   NULL,
    created_at       DATETIME2      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_BankAccountAuditLog_account ON dbo.BankAccountAuditLog(bank_account_id, created_at DESC);
  CREATE INDEX IX_BankAccountAuditLog_customer ON dbo.BankAccountAuditLog(customer_id, created_at DESC);
END;
GO
