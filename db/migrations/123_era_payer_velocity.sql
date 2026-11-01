-- @data: reference
-- ERA payer velocity fact table for predictive payer modeling.
-- Populated by the ERA ingestion pipeline; queried by the collections forecast and payer velocity endpoints.

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EraPayerFact') AND type = N'U')
BEGIN
  CREATE TABLE dbo.EraPayerFact (
    id                   INT IDENTITY PRIMARY KEY,
    customer_id          INT NOT NULL,
    payer_name           NVARCHAR(255) NOT NULL,
    cpt_code             NVARCHAR(20) NULL,
    billed_amount        DECIMAL(12,2) NULL,
    allowed_amount       DECIMAL(12,2) NULL,
    paid_amount          DECIMAL(12,2) NULL,
    payment_ratio        AS (CASE WHEN billed_amount > 0 THEN paid_amount / billed_amount ELSE NULL END) PERSISTED,
    is_denied            BIT NOT NULL DEFAULT 0,
    days_to_payment      INT NULL,
    denial_reason_code   NVARCHAR(20) NULL,
    date_of_service      DATE NULL,
    payment_date         DATE NULL,
    era_file_id          NVARCHAR(100) NULL,
    ingested_at          DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.EraPayerFact') AND name = N'IX_EraPayerFact_Payer')
  CREATE INDEX IX_EraPayerFact_Payer ON dbo.EraPayerFact (payer_name, customer_id, date_of_service DESC);

-- Materialized payer velocity summary - refreshed nightly by the collections forecast job.
-- cpt_code_key is a persisted computed column used in the unique index to handle NULLs.
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.PayerVelocityStats') AND type = N'U')
BEGIN
  CREATE TABLE dbo.PayerVelocityStats (
    id                     INT IDENTITY PRIMARY KEY,
    customer_id            INT NOT NULL,
    payer_name             NVARCHAR(255) NOT NULL,
    cpt_code               NVARCHAR(20) NULL,
    cpt_code_key           AS ISNULL(cpt_code, N'') PERSISTED,
    total_claims           INT NOT NULL DEFAULT 0,
    paid_claims            INT NOT NULL DEFAULT 0,
    denied_claims          INT NOT NULL DEFAULT 0,
    avg_payment_ratio      DECIMAL(7,4) NULL,
    avg_days_to_payment    DECIMAL(7,1) NULL,
    p25_days_to_payment    INT NULL,
    p75_days_to_payment    INT NULL,
    computed_at            DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

-- Add cpt_code_key if the table existed before this column was introduced
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.PayerVelocityStats') AND name = N'cpt_code_key')
  ALTER TABLE dbo.PayerVelocityStats ADD cpt_code_key AS ISNULL(cpt_code, N'') PERSISTED;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.PayerVelocityStats') AND name = N'IX_PayerVelocityStats_Payer')
  CREATE UNIQUE INDEX IX_PayerVelocityStats_Payer ON dbo.PayerVelocityStats (payer_name, cpt_code_key, customer_id);
