-- @data: reference
-- Final remediation: ensure all tables from migrations 123/126 exist correctly.
-- Migration 128 was partially applied; this one handles the remaining gaps.

-- -- EraPayerFact --------------------------------------------------------------
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

-- -- PayerVelocityStats --------------------------------------------------------
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
ELSE IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.PayerVelocityStats') AND name = N'cpt_code_key')
  ALTER TABLE dbo.PayerVelocityStats ADD cpt_code_key AS ISNULL(cpt_code, N'') PERSISTED;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.PayerVelocityStats') AND name = N'IX_PayerVelocityStats_Payer')
  CREATE UNIQUE INDEX IX_PayerVelocityStats_Payer ON dbo.PayerVelocityStats (payer_name, cpt_code_key, customer_id);

-- -- TemplatePerformance -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TemplatePerformance') AND type = N'U')
BEGIN
  CREATE TABLE dbo.TemplatePerformance (
    id                INT IDENTITY PRIMARY KEY,
    customer_id       INT NOT NULL,
    template_id       INT NOT NULL,
    payer_name        NVARCHAR(255) NULL,
    denial_reason     NVARCHAR(20) NULL,
    payer_key         AS ISNULL(payer_name, N'') PERSISTED,
    denial_key        AS ISNULL(denial_reason, N'') PERSISTED,
    total_used        INT NOT NULL DEFAULT 0,
    total_won         INT NOT NULL DEFAULT 0,
    total_lost        INT NOT NULL DEFAULT 0,
    win_rate          AS (CASE WHEN total_used > 0 THEN CONVERT(FLOAT, total_won) / total_used ELSE NULL END) PERSISTED,
    avg_days_to_win   DECIMAL(7,1) NULL,
    last_outcome_at   DATETIME2 NULL,
    updated_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TemplatePerformance') AND name = N'payer_key')
    ALTER TABLE dbo.TemplatePerformance ADD payer_key AS ISNULL(payer_name, N'') PERSISTED;

  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TemplatePerformance') AND name = N'denial_key')
    ALTER TABLE dbo.TemplatePerformance ADD denial_key AS ISNULL(denial_reason, N'') PERSISTED;
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.TemplatePerformance') AND name = N'IX_TplPerf_Template')
  CREATE UNIQUE INDEX IX_TplPerf_Template ON dbo.TemplatePerformance (template_id, payer_key, denial_key, customer_id);

-- -- AppealOutcomeLog ----------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AppealOutcomeLog') AND type = N'U')
BEGIN
  CREATE TABLE dbo.AppealOutcomeLog (
    id             INT IDENTITY PRIMARY KEY,
    customer_id    INT NOT NULL,
    appeal_id      INT NOT NULL,
    template_id    INT NULL,
    claim_id       NVARCHAR(50) NOT NULL,
    payer_name     NVARCHAR(255) NULL,
    denial_reason  NVARCHAR(20) NULL,
    outcome        NVARCHAR(10) NOT NULL,
    days_to_close  INT NULL,
    recorded_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END
