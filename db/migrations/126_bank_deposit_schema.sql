-- @data: reference
-- Add ReconIQ columns to bankDeposit for bank matching / reconciliation features.
-- The original table (001_core_schema) used a different column set; these are additive.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'customer_id')
  ALTER TABLE dbo.bankDeposit ADD customer_id INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'deposit_date')
  ALTER TABLE dbo.bankDeposit ADD deposit_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'deposit_amount')
  ALTER TABLE dbo.bankDeposit ADD deposit_amount DECIMAL(12,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'bank_reference')
  ALTER TABLE dbo.bankDeposit ADD bank_reference NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'matched_amount')
  ALTER TABLE dbo.bankDeposit ADD matched_amount DECIMAL(12,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'unmatched_amount')
  ALTER TABLE dbo.bankDeposit ADD unmatched_amount DECIMAL(12,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'status')
  ALTER TABLE dbo.bankDeposit ADD status NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'notes')
  ALTER TABLE dbo.bankDeposit ADD notes NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'bank_account_id')
  ALTER TABLE dbo.bankDeposit ADD bank_account_id INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.bankDeposit') AND name = 'created_at')
  ALTER TABLE dbo.bankDeposit ADD created_at DATETIME NULL DEFAULT GETDATE();
GO
PRINT 'bankDeposit schema extended for ReconIQ bank matching';
