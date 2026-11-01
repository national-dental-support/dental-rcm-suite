-- @data: reference
-- Migration 123: Real bank connectivity fields
-- Statement import (BAI2/MT940 over SFTP, Plaid), ACH origination (NACHA)

-- -- Statement import ---------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='stmt_import_method')
  ALTER TABLE dbo.BankAccountConnection ADD stmt_import_method NVARCHAR(20) NOT NULL DEFAULT 'manual';
  -- manual | sftp | plaid | api

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_host')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_host NVARCHAR(200) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_port')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_port INT NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_username')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_username NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_auth_method')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_auth_method NVARCHAR(20) NULL;
  -- password | rsa_key

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_key_fingerprint')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_key_fingerprint NVARCHAR(200) NULL;
  -- SHA-256 fingerprint only, never the private key

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_remote_path')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_remote_path NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_file_format')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_file_format NVARCHAR(20) NULL;
  -- bai2 | mt940 | ofx | camt053 | csv

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_file_pattern')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_file_pattern NVARCHAR(200) NULL;
  -- e.g. ACME_{YYYYMMDD}.bai2

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='sftp_schedule')
  ALTER TABLE dbo.BankAccountConnection ADD sftp_schedule NVARCHAR(20) NULL;
  -- daily | weekly | manual

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='plaid_item_id')
  ALTER TABLE dbo.BankAccountConnection ADD plaid_item_id NVARCHAR(200) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='plaid_institution_id')
  ALTER TABLE dbo.BankAccountConnection ADD plaid_institution_id NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='plaid_last_refresh')
  ALTER TABLE dbo.BankAccountConnection ADD plaid_last_refresh DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='recon_trace_match')
  ALTER TABLE dbo.BankAccountConnection ADD recon_trace_match BIT NOT NULL DEFAULT 1;
  -- match ERA 835 to deposit using TRN trace number

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='recon_lag_days')
  ALTER TABLE dbo.BankAccountConnection ADD recon_lag_days INT NULL DEFAULT 4;
  -- flag deposit without ERA after N days

-- -- ACH origination -----------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_enabled')
  ALTER TABLE dbo.BankAccountConnection ADD ach_enabled BIT NOT NULL DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_company_name')
  ALTER TABLE dbo.BankAccountConnection ADD ach_company_name NVARCHAR(100) NULL;
  -- Legal name as registered with NACHA

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_company_id')
  ALTER TABLE dbo.BankAccountConnection ADD ach_company_id NVARCHAR(10) NULL;
  -- 10-digit ID assigned by your bank (ODFI)

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_odfi_routing')
  ALTER TABLE dbo.BankAccountConnection ADD ach_odfi_routing NVARCHAR(9) NULL;
  -- Your bank's routing number as ODFI

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_sec_codes')
  ALTER TABLE dbo.BankAccountConnection ADD ach_sec_codes NVARCHAR(50) NULL;
  -- pipe-separated: PPD|CCD|CTX

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_transaction_limit')
  ALTER TABLE dbo.BankAccountConnection ADD ach_transaction_limit DECIMAL(12,2) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_daily_limit')
  ALTER TABLE dbo.BankAccountConnection ADD ach_daily_limit DECIMAL(12,2) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_dual_approval_threshold')
  ALTER TABLE dbo.BankAccountConnection ADD ach_dual_approval_threshold DECIMAL(12,2) NULL;
  -- Amounts >= this require a second approver

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_settlement_days')
  ALTER TABLE dbo.BankAccountConnection ADD ach_settlement_days INT NULL DEFAULT 1;
  -- 1 = standard T+1, 0 = same-day ACH

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_nacha_registered')
  ALTER TABLE dbo.BankAccountConnection ADD ach_nacha_registered BIT NOT NULL DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BankAccountConnection' AND COLUMN_NAME='ach_nacha_registered_date')
  ALTER TABLE dbo.BankAccountConnection ADD ach_nacha_registered_date DATETIME2 NULL;
GO

-- -- Update demo data ----------------------------------------------------------

-- Chase: SFTP (BAI2) + ACH origination (payroll + patient refunds)
UPDATE dbo.BankAccountConnection SET
  stmt_import_method        = 'sftp',
  sftp_host                 = 'sftp.jpmorgan.com',
  sftp_port                 = 22,
  sftp_username             = 'smilesdentalgrp_rcm',
  sftp_auth_method          = 'rsa_key',
  sftp_key_fingerprint      = 'SHA256:mK7xP2qRv9nD4sF1tL8jB3wY6cA0eH5',
  sftp_remote_path          = '/treasury/statements/outbound/',
  sftp_file_format          = 'bai2',
  sftp_file_pattern         = 'SMILES_{YYYYMMDD}.bai2',
  sftp_schedule             = 'daily',
  recon_trace_match         = 1,
  recon_lag_days            = 4,
  ach_enabled               = 1,
  ach_company_name          = 'Smiles Dental Group LLC',
  ach_company_id            = '1234567890',
  ach_odfi_routing          = '021000021',
  ach_sec_codes             = 'PPD|CCD',
  ach_transaction_limit     = 25000.00,
  ach_daily_limit           = 100000.00,
  ach_dual_approval_threshold = 10000.00,
  ach_settlement_days       = 1,
  ach_nacha_registered      = 1,
  ach_nacha_registered_date = DATEADD(DAY, -365, GETDATE())
WHERE bank_name = 'Chase Business Banking' AND customer_id = 1;

-- Wells Fargo: SFTP (MT940, remittance receipts only) - no ACH origination
UPDATE dbo.BankAccountConnection SET
  stmt_import_method    = 'sftp',
  sftp_host             = 'sftp.wellsfargo.com',
  sftp_port             = 22,
  sftp_username         = 'smiles_dental_remit',
  sftp_auth_method      = 'rsa_key',
  sftp_key_fingerprint  = 'SHA256:nL8yQ3rT0mC5kJ2vX7pW4bN9dE1fA6',
  sftp_remote_path      = '/remit/outbound/',
  sftp_file_format      = 'mt940',
  sftp_file_pattern     = '*.mt940',
  sftp_schedule         = 'daily',
  recon_trace_match     = 1,
  recon_lag_days        = 3,
  ach_enabled           = 0
WHERE bank_name = 'Wells Fargo' AND customer_id = 1;

-- Bank of America: manual import, suspended, ACH disabled
UPDATE dbo.BankAccountConnection SET
  stmt_import_method = 'manual',
  ach_enabled        = 0
WHERE bank_name = 'Bank of America' AND customer_id = 1;
