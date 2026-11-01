-- @data: reference
-- Migration 116: Bank Account Connections
-- Stores bank account registrations used to link bank deposits to reconciliations.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BankAccountConnection')
BEGIN
  CREATE TABLE dbo.BankAccountConnection (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    customer_id           INT            NOT NULL DEFAULT 0,
    bank_name             NVARCHAR(100)  NOT NULL,
    account_number_last4  NVARCHAR(4)    NULL,
    routing_number        NVARCHAR(9)    NULL,
    account_type          NVARCHAR(20)   NOT NULL DEFAULT 'checking', -- checking | savings | business_checking
    nickname              NVARCHAR(100)  NULL,
    is_active             BIT            NOT NULL DEFAULT 1,
    created_at            DATETIME2      NOT NULL DEFAULT GETDATE(),
    updated_at            DATETIME2      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_BankAccountConnection_customer ON dbo.BankAccountConnection(customer_id);
END;

-- Add bank_account_id to claimPostHistory to record which account a posting came from
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME='claimPostHistory' AND COLUMN_NAME='bank_account_id'
)
BEGIN
  ALTER TABLE dbo.claimPostHistory ADD bank_account_id INT NULL;
END;
