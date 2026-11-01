-- @data: reference
-- @tags: eligibility-iq
-- Schema: EligibilityBatch, EligibilityCheck, EligibilityBenefits, EligibilityAuthLimits

-- -- 1. EligibilityBatch -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityBatch')
BEGIN
  CREATE TABLE dbo.EligibilityBatch (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    customer_id   INT           NOT NULL,
    run_date      DATE          NOT NULL,
    triggered_by  NVARCHAR(50)  NOT NULL DEFAULT 'scheduler',
    status        NVARCHAR(20)  NOT NULL DEFAULT 'pending',
    total_checked INT           NOT NULL DEFAULT 0,
    passed        INT           NOT NULL DEFAULT 0,
    failed        INT           NOT NULL DEFAULT 0,
    errors        INT           NOT NULL DEFAULT 0,
    started_at    DATETIME2     NULL,
    completed_at  DATETIME2     NULL
  );
  CREATE INDEX IX_EligibilityBatch_customer_run ON dbo.EligibilityBatch (customer_id, run_date DESC);
END;

-- -- 2. EligibilityCheck -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityCheck')
BEGIN
  CREATE TABLE dbo.EligibilityCheck (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    customer_id      INT           NOT NULL,
    batch_id         INT           NULL REFERENCES dbo.EligibilityBatch(id),
    patient_name     NVARCHAR(200) NULL,
    patient_dob      DATE          NULL,
    subscriber_id    NVARCHAR(100) NULL,
    payer_name       NVARCHAR(200) NULL,
    payer_id         NVARCHAR(50)  NULL,
    location_name    NVARCHAR(200) NULL,
    provider_name    NVARCHAR(200) NULL,
    appointment_date DATE          NULL,
    check_status     NVARCHAR(20)  NOT NULL DEFAULT 'pending',
    checked_at       DATETIME2     NULL,
    error_detail     NVARCHAR(500) NULL
  );
  CREATE INDEX IX_EligibilityCheck_customer_appt ON dbo.EligibilityCheck (customer_id, appointment_date);
  CREATE INDEX IX_EligibilityCheck_batch ON dbo.EligibilityCheck (batch_id);
END;

-- -- 3. EligibilityBenefits ----------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityBenefits')
BEGIN
  CREATE TABLE dbo.EligibilityBenefits (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    check_id              INT           NOT NULL REFERENCES dbo.EligibilityCheck(id),
    customer_id           INT           NOT NULL,
    copay_amount          DECIMAL(10,2) NULL,
    deductible_individual DECIMAL(10,2) NULL,
    deductible_met        DECIMAL(10,2) NULL,
    deductible_remaining  DECIMAL(10,2) NULL,
    annual_maximum        DECIMAL(10,2) NULL,
    annual_used           DECIMAL(10,2) NULL,
    annual_remaining      DECIMAL(10,2) NULL,
    coverage_type         NVARCHAR(100) NULL,
    effective_date        DATE          NULL,
    termination_date      DATE          NULL,
    preventive_pct        INT           NULL,
    basic_pct             INT           NULL,
    major_pct             INT           NULL,
    ortho_covered         BIT           NULL DEFAULT 0,
    waiting_period_months INT           NULL DEFAULT 0,
    raw_response          NVARCHAR(MAX) NULL
  );
  CREATE INDEX IX_EligibilityBenefits_check ON dbo.EligibilityBenefits (check_id);
END;

-- -- 4. EligibilityAuthLimits --------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityAuthLimits')
BEGIN
  CREATE TABLE dbo.EligibilityAuthLimits (
    id                   INT IDENTITY(1,1) PRIMARY KEY,
    check_id             INT            NOT NULL REFERENCES dbo.EligibilityCheck(id),
    customer_id          INT            NOT NULL,
    service_category     NVARCHAR(100)  NOT NULL,
    auth_number          NVARCHAR(100)  NULL,
    auth_type            NVARCHAR(20)   NOT NULL DEFAULT 'visit',
    visits_approved      INT            NULL,
    visits_used          INT            NULL,
    visits_remaining     INT            NULL,
    dollar_limit         DECIMAL(10,2)  NULL,
    dollar_used          DECIMAL(10,2)  NULL,
    dollar_remaining     DECIMAL(10,2)  NULL,
    auth_start_date      DATE           NULL,
    auth_expiration_date DATE           NULL,
    policy_year_end      DATE           NULL,
    renewal_required     BIT            NOT NULL DEFAULT 0,
    notes                NVARCHAR(500)  NULL
  );
  CREATE INDEX IX_EligibilityAuthLimits_check ON dbo.EligibilityAuthLimits (check_id);
  CREATE INDEX IX_EligibilityAuthLimits_customer ON dbo.EligibilityAuthLimits (customer_id);
END;

-- -- 5. EligibilityAlert -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityAlert')
BEGIN
  CREATE TABLE dbo.EligibilityAlert (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    customer_id      INT           NOT NULL,
    check_id         INT           NULL REFERENCES dbo.EligibilityCheck(id),
    auth_limit_id    INT           NULL REFERENCES dbo.EligibilityAuthLimits(id),
    patient_name     NVARCHAR(200) NULL,
    payer_name       NVARCHAR(200) NULL,
    location_name    NVARCHAR(200) NULL,
    alert_type       NVARCHAR(100) NOT NULL,
    priority         NVARCHAR(20)  NOT NULL DEFAULT 'medium',
    alert_date       DATE          NULL,
    appointment_date DATE          NULL,
    dismissed        BIT           NOT NULL DEFAULT 0,
    dismissed_by     NVARCHAR(200) NULL,
    dismissed_at     DATETIME2     NULL,
    created_at       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_EligibilityAlert_customer_active ON dbo.EligibilityAlert (customer_id, dismissed, priority);
END;
