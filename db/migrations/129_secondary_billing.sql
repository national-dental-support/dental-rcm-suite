-- @data: reference
-- 129_secondary_billing.sql
-- Adds secondary payer tracking to claims and creates the SecondaryBillingQueue
-- table that drives the ReconIQ Secondary Billing tab.
--
-- After primary EOB is posted (bulk-post), claims with secondary_payer_id set
-- are auto-inserted into SecondaryBillingQueue (status='pending').
-- Billers review the queue, mark items submitted, and post the secondary EOB
-- when the secondary payer responds.

-- -- 1. Add secondary_payer_id to claims -------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'claims' AND COLUMN_NAME = 'secondary_payer_id'
)
BEGIN
  ALTER TABLE dbo.claims
    ADD secondary_payer_id SMALLINT NULL
        CONSTRAINT FK_claims_secondary_payer FOREIGN KEY REFERENCES dbo.payer(PayerID);
  PRINT '129: Added secondary_payer_id to dbo.claims';
END
GO

-- -- 2. Create SecondaryBillingQueue -----------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SecondaryBillingQueue'
)
BEGIN
  CREATE TABLE dbo.SecondaryBillingQueue (
    id                          INT IDENTITY(1,1)   PRIMARY KEY,
    claim_id                    VARCHAR(20)         NOT NULL,
    primary_remittance_file_id  VARCHAR(20)         NOT NULL,
    secondary_payer_id          SMALLINT            NOT NULL,
    primary_paid_amt            DECIMAL(10,2)       NOT NULL DEFAULT 0,
    primary_adjustment_amt      DECIMAL(10,2)       NOT NULL DEFAULT 0,
    patient_resp_amt            DECIMAL(10,2)       NOT NULL DEFAULT 0,
    secondary_bill_amt          DECIMAL(10,2)       NOT NULL DEFAULT 0,
    -- 'pending' | 'submitted' | 'posted'
    status                      VARCHAR(30)         NOT NULL DEFAULT 'pending',
    submitted_by                NVARCHAR(150)       NULL,
    submitted_date              DATETIME2           NULL,
    customer_id                 INT                 NOT NULL,
    created_at                  DATETIME2           NOT NULL DEFAULT GETUTCDATE(),
    updated_at                  DATETIME2           NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_SBQ_ClaimRmf UNIQUE (claim_id, primary_remittance_file_id)
  );
  PRINT '129: Created dbo.SecondaryBillingQueue';
END
GO

PRINT 'Migration 129: secondary_payer_id + SecondaryBillingQueue complete.';
GO
