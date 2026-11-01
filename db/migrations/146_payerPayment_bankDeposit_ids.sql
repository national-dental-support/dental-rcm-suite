-- @data: reference
-- Migration 146: Add id IDENTITY + customer_id to payerPayment and bankDeposit
-- These tables predate the ingest pipeline and lacked auto-increment PKs and tenant isolation.

SET NOCOUNT ON;

IF COL_LENGTH('dbo.payerPayment', 'id') IS NULL
  ALTER TABLE dbo.payerPayment ADD id INT IDENTITY(1,1) NOT NULL;

IF COL_LENGTH('dbo.payerPayment', 'customer_id') IS NULL
  ALTER TABLE dbo.payerPayment ADD customer_id INT NULL;

IF COL_LENGTH('dbo.bankDeposit', 'id') IS NULL
  ALTER TABLE dbo.bankDeposit ADD id INT IDENTITY(1,1) NOT NULL;

IF COL_LENGTH('dbo.bankDeposit', 'bank_account_id') IS NULL
  ALTER TABLE dbo.bankDeposit ADD bank_account_id INT NULL;
