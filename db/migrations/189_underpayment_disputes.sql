-- @data: reference
-- Migration 189: Underpayment disputes and review tracking for PayerIQ

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='underpayment_disputes')
CREATE TABLE [dbo].[underpayment_disputes] (
  [id]           INT IDENTITY(1,1) PRIMARY KEY,
  [claim_number] NVARCHAR(100)  NOT NULL,
  [cpt_code]     NVARCHAR(50)   NULL,
  [payer_name]   NVARCHAR(200)  NULL,
  [customer_id]  INT            NOT NULL,
  [created_by]   NVARCHAR(200)  NOT NULL,
  [status]       NVARCHAR(50)   NOT NULL DEFAULT 'open', -- open | submitted | won | lost
  [notes]        NVARCHAR(MAX)  NULL,
  [created_at]   DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  [updated_at]   DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);
GO

CREATE INDEX [idx_underpayment_disputes_claim] ON [dbo].[underpayment_disputes] ([claim_number], [customer_id]);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='underpayment_reviews')
CREATE TABLE [dbo].[underpayment_reviews] (
  [id]           INT IDENTITY(1,1) PRIMARY KEY,
  [claim_number] NVARCHAR(100)  NOT NULL,
  [cpt_code]     NVARCHAR(50)   NULL,
  [customer_id]  INT            NOT NULL,
  [reviewed_by]  NVARCHAR(200)  NOT NULL,
  [reviewed_at]  DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT [UQ_underpayment_reviews] UNIQUE ([claim_number], [cpt_code], [customer_id])
);
GO
