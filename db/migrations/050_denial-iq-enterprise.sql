-- @data: reference
-- ===============================================================================
-- Migration 050: Denial IQ Enterprise - addresses all 11 known limitations
--
-- 1.  Dual ownership (accountable owner + working queue)
-- 2.  MSO / Region / Department hierarchy
-- 3.  First-class DenialEvent entity
-- 4.  denial_posting_date on claims
-- 5.  First-touch SLA tracking
-- 6.  Follow-up cadence SLA
-- 7.  QA workflow (sampling, scoring, findings)
-- 8.  Automatic overflow configuration
-- 9.  source_system lineage field
-- 10. data_quality_flags
-- 11. ClaimSubmittedDate -> datetime2
-- ===============================================================================

-- -- 1. Dual Ownership ----------------------------------------------------------

-- Add dual-ownership columns to claimhistory
IF COL_LENGTH('dbo.claimhistory', 'accountable_owner_id') IS NULL
  ALTER TABLE dbo.claimhistory ADD accountable_owner_id INT NULL;

IF COL_LENGTH('dbo.claimhistory', 'accountable_owner_type') IS NULL
  ALTER TABLE dbo.claimhistory ADD accountable_owner_type NVARCHAR(20) NULL; -- 'location' or 'central'

IF COL_LENGTH('dbo.claimhistory', 'working_queue_type') IS NULL
  ALTER TABLE dbo.claimhistory ADD working_queue_type NVARCHAR(20) NULL; -- 'location' or 'central'

IF COL_LENGTH('dbo.claimhistory', 'working_queue_id') IS NULL
  ALTER TABLE dbo.claimhistory ADD working_queue_id INT NULL;

-- Ownership history table for full audit trail
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClaimOwnershipHistory')
BEGIN
  CREATE TABLE dbo.ClaimOwnershipHistory (
    id                      INT IDENTITY(1,1) PRIMARY KEY,
    claim_id                NVARCHAR(50) NOT NULL,
    accountable_owner_type  NVARCHAR(20) NOT NULL,  -- 'location' or 'central'
    accountable_owner_id    INT NOT NULL,
    working_queue_type      NVARCHAR(20) NULL,
    working_queue_id        INT NULL,
    assigned_to_user_id     INT NULL,
    effective_start         DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    effective_end           DATETIME2 NULL,         -- NULL = current assignment
    changed_by              INT NULL,
    reason_code             NVARCHAR(100) NULL,     -- 'initial', 'reassigned', 'escalated', 'overflow'
    customer_id             SMALLINT NULL,
    created_at              DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX IX_ClaimOwnership_claim ON dbo.ClaimOwnershipHistory(claim_id, effective_end);
  CREATE INDEX IX_ClaimOwnership_owner ON dbo.ClaimOwnershipHistory(accountable_owner_id, effective_end);
END

-- -- 2. MSO / Region / Department Hierarchy -------------------------------------

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='mso')
BEGIN
  CREATE TABLE dbo.mso (
    mso_id        INT IDENTITY(1,1) PRIMARY KEY,
    mso_name      NVARCHAR(255) NOT NULL,
    customer_id   SMALLINT NULL,
    is_active     BIT NOT NULL DEFAULT 1,
    created_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='region')
BEGIN
  CREATE TABLE dbo.region (
    region_id     INT IDENTITY(1,1) PRIMARY KEY,
    region_name   NVARCHAR(255) NOT NULL,
    parent_mso_id INT NULL REFERENCES dbo.mso(mso_id),
    customer_id   SMALLINT NULL,
    is_active     BIT NOT NULL DEFAULT 1,
    created_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

-- Add region_id to location table
IF COL_LENGTH('dbo.location', 'parent_region_id') IS NULL
  ALTER TABLE dbo.location ADD parent_region_id INT NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='department')
BEGIN
  CREATE TABLE dbo.department (
    department_id       INT IDENTITY(1,1) PRIMARY KEY,
    department_name     NVARCHAR(255) NOT NULL,
    parent_location_id  INT NULL,
    customer_id         SMALLINT NULL,
    is_active           BIT NOT NULL DEFAULT 1,
    created_at          DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at          DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

-- Unified org hierarchy view
IF OBJECT_ID('dbo.vw_org_hierarchy', 'V') IS NOT NULL
  DROP VIEW dbo.vw_org_hierarchy;
GO
CREATE VIEW dbo.vw_org_hierarchy AS
SELECT
  m.mso_id, m.mso_name,
  r.region_id, r.region_name,
  l.LocationID AS location_id, l.LocationName AS location_name,
  d.department_id, d.department_name,
  COALESCE(m.customer_id, r.customer_id, d.customer_id) AS customer_id
FROM dbo.mso m
LEFT JOIN dbo.region r ON r.parent_mso_id = m.mso_id
LEFT JOIN dbo.location l ON l.parent_region_id = r.region_id
LEFT JOIN dbo.department d ON d.parent_location_id = l.LocationID
WHERE COALESCE(m.is_active, 1) = 1;
GO

-- -- 3. First-Class Denial Event Entity -----------------------------------------

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DenialEvent')
BEGIN
  CREATE TABLE dbo.DenialEvent (
    id                          INT IDENTITY(1,1) PRIMARY KEY,
    enterprise_denial_event_id  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    claim_id                    NVARCHAR(50) NOT NULL,
    denial_class                NVARCHAR(50) NULL,      -- 'clinical', 'administrative', 'technical', 'eligibility'
    carc_code                   NVARCHAR(50) NULL,
    rarc_code                   NVARCHAR(50) NULL,
    group_code                  NVARCHAR(10) NULL,      -- CO, PR, OA, PI, CR
    denied_amount               DECIMAL(12,2) NULL,
    recovered_amount            DECIMAL(12,2) NULL DEFAULT 0,
    denial_posting_date         DATE NULL,              -- When denial became actionable
    appeal_deadline             DATE NULL,              -- Derived from payer rules
    status                      NVARCHAR(30) NOT NULL DEFAULT 'open',
                                                         -- open, in_progress, appealed, overturned, written_off, closed
    resolution_date             DATE NULL,
    accountable_owner_id        INT NULL,
    working_queue_id            INT NULL,
    location_id                 INT NULL,
    department_id               INT NULL,
    payer_id                    NVARCHAR(50) NULL,
    source_system               NVARCHAR(100) NULL,
    data_quality_flags          NVARCHAR(500) NULL,     -- JSON array of flag codes
    customer_id                 SMALLINT NULL,
    created_at                  DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at                  DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX IX_DenialEvent_claim ON dbo.DenialEvent(claim_id);
  CREATE INDEX IX_DenialEvent_status ON dbo.DenialEvent(status, customer_id);
  CREATE INDEX IX_DenialEvent_posting ON dbo.DenialEvent(denial_posting_date);
  CREATE INDEX IX_DenialEvent_enterprise ON dbo.DenialEvent(enterprise_denial_event_id);
END

-- -- 4. Denial Posting Date on Claims -------------------------------------------

IF COL_LENGTH('dbo.claims', 'denial_posting_date') IS NULL
  ALTER TABLE dbo.claims ADD denial_posting_date DATE NULL;

-- -- 5 & 6. SLA Tracking - First Touch + Follow-Up Cadence ---------------------

IF COL_LENGTH('dbo.claimhistory', 'first_touch_at') IS NULL
  ALTER TABLE dbo.claimhistory ADD first_touch_at DATETIME2 NULL;

-- SLA configuration table (data-driven, not hard-coded)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='SlaConfig')
BEGIN
  CREATE TABLE dbo.SlaConfig (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    customer_id           SMALLINT NOT NULL,
    queue_type            NVARCHAR(20) NULL,       -- 'location', 'central', NULL = all
    payer_class           NVARCHAR(100) NULL,      -- Payer name pattern or NULL = all
    first_touch_hours     INT NOT NULL DEFAULT 48, -- Max hours from denial posting to first work action
    followup_max_hours    INT NOT NULL DEFAULT 72, -- Max hours between successive work actions
    resolution_target_days INT NOT NULL DEFAULT 30, -- Target days from denial posting to resolution
    is_active             BIT NOT NULL DEFAULT 1,
    created_at            DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at            DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UNIQUE(customer_id, queue_type, payer_class)
  );

  -- Default SLA config for all customers
  INSERT INTO dbo.SlaConfig (customer_id, first_touch_hours, followup_max_hours, resolution_target_days)
  SELECT uid, 48, 72, 30 FROM dbo.Customers;
END

-- SLA violation tracking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='SlaViolation')
BEGIN
  CREATE TABLE dbo.SlaViolation (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    claim_id        NVARCHAR(50) NOT NULL,
    violation_type  NVARCHAR(30) NOT NULL,  -- 'first_touch', 'followup_cadence', 'resolution_deadline', 'appeal_deadline'
    threshold_hours INT NULL,
    actual_hours    INT NULL,
    detected_at     DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    resolved_at     DATETIME2 NULL,
    assigned_to     INT NULL,
    customer_id     SMALLINT NULL,
    created_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX IX_SlaViolation_claim ON dbo.SlaViolation(claim_id, violation_type);
  CREATE INDEX IX_SlaViolation_open ON dbo.SlaViolation(resolved_at, customer_id) WHERE resolved_at IS NULL;
END

-- -- 7. QA Workflow -------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='QaReview')
BEGIN
  CREATE TABLE dbo.QaReview (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    claim_id        NVARCHAR(50) NOT NULL,
    reviewer_id     INT NOT NULL,              -- QA analyst user ID
    review_type     NVARCHAR(30) NOT NULL,     -- 'random_sample', 'targeted', 'escalation_review', 'new_hire'
    score           INT NULL,                  -- 0-100
    status          NVARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed'
    started_at      DATETIME2 NULL,
    completed_at    DATETIME2 NULL,
    customer_id     SMALLINT NULL,
    created_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX IX_QaReview_claim ON dbo.QaReview(claim_id);
  CREATE INDEX IX_QaReview_reviewer ON dbo.QaReview(reviewer_id, status);
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='QaFinding')
BEGIN
  CREATE TABLE dbo.QaFinding (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    review_id       INT NOT NULL REFERENCES dbo.QaReview(id),
    category        NVARCHAR(50) NOT NULL,     -- 'accuracy', 'timeliness', 'documentation', 'process', 'communication'
    severity        NVARCHAR(20) NOT NULL,     -- 'critical', 'major', 'minor', 'observation'
    description     NVARCHAR(MAX) NOT NULL,
    recommendation  NVARCHAR(MAX) NULL,
    created_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

-- -- 8. Automatic Overflow Configuration ----------------------------------------

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='QueueOverflowConfig')
BEGIN
  CREATE TABLE dbo.QueueOverflowConfig (
    id                      INT IDENTITY(1,1) PRIMARY KEY,
    customer_id             SMALLINT NOT NULL,
    source_queue_type       NVARCHAR(20) NOT NULL,    -- 'location' or 'specialist'
    source_queue_id         INT NULL,                 -- Location ID or user ID
    max_active_claims       INT NOT NULL DEFAULT 50,  -- Trigger threshold
    max_aging_days          INT NOT NULL DEFAULT 30,  -- Age-based trigger
    overflow_target_type    NVARCHAR(20) NOT NULL DEFAULT 'central',  -- 'central', 'location', 'auto_assign'
    overflow_target_id      INT NULL,
    is_active               BIT NOT NULL DEFAULT 1,
    last_triggered_at       DATETIME2 NULL,
    created_at              DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at              DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

-- -- 9. source_system Lineage Field ---------------------------------------------

IF COL_LENGTH('dbo.claims', 'source_system') IS NULL
  ALTER TABLE dbo.claims ADD source_system NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.claimhistory', 'source_system') IS NULL
  ALTER TABLE dbo.claimhistory ADD source_system NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.recon_report', 'source_system') IS NULL
  ALTER TABLE dbo.recon_report ADD source_system NVARCHAR(100) NULL;

-- -- 10. Data Quality Flags -----------------------------------------------------

IF COL_LENGTH('dbo.claims', 'data_quality_flags') IS NULL
  ALTER TABLE dbo.claims ADD data_quality_flags NVARCHAR(500) NULL;

IF COL_LENGTH('dbo.claimhistory', 'data_quality_flags') IS NULL
  ALTER TABLE dbo.claimhistory ADD data_quality_flags NVARCHAR(500) NULL;

IF COL_LENGTH('dbo.recon_report', 'data_quality_flags') IS NULL
  ALTER TABLE dbo.recon_report ADD data_quality_flags NVARCHAR(500) NULL;

-- Data quality rule definitions
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DataQualityRule')
BEGIN
  CREATE TABLE dbo.DataQualityRule (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    rule_code       NVARCHAR(50) NOT NULL UNIQUE,   -- 'MISSING_PAYER', 'MISSING_DOS', 'DUPLICATE_CLAIM', etc.
    description     NVARCHAR(255) NOT NULL,
    target_table    NVARCHAR(50) NOT NULL,           -- 'claims', 'claimhistory', 'recon_report'
    severity        NVARCHAR(20) NOT NULL DEFAULT 'warning',  -- 'error', 'warning', 'info'
    check_sql       NVARCHAR(MAX) NULL,              -- Optional SQL for automated checks
    is_active       BIT NOT NULL DEFAULT 1,
    created_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );

  -- Seed common rules
  INSERT INTO dbo.DataQualityRule (rule_code, description, target_table, severity) VALUES
    ('MISSING_PAYER', 'Claim has no payer assigned', 'claims', 'error'),
    ('MISSING_DOS', 'Claim has no date of service', 'claims', 'error'),
    ('MISSING_CHARGE', 'Claim has zero or null charge amount', 'claims', 'warning'),
    ('FUTURE_DOS', 'Date of service is in the future', 'claims', 'warning'),
    ('MISSING_CARC', 'Denied claim has no CARC code', 'claimhistory', 'warning'),
    ('STALE_SUBMISSION', 'Claim submitted date is more than 365 days ago', 'claims', 'info'),
    ('DUPLICATE_CLAIM', 'Possible duplicate based on patient/DOS/charge', 'claims', 'warning'),
    ('MISSING_LOCATION', 'Transaction has no location attribution', 'recon_report', 'warning');
END

-- -- 11. Upgrade ClaimSubmittedDate to DATETIME2 -------------------------------

-- claims table
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'claims'
    AND COLUMN_NAME = 'ClaimSubmittedDate' AND DATA_TYPE = 'date'
)
BEGIN
  ALTER TABLE dbo.claims ALTER COLUMN ClaimSubmittedDate DATETIME2 NULL;
  PRINT 'Upgraded claims.ClaimSubmittedDate to DATETIME2';
END

-- claimhistory table
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'claimhistory'
    AND COLUMN_NAME = 'ClaimSubmittedDate' AND DATA_TYPE = 'date'
)
BEGIN
  ALTER TABLE dbo.claimhistory ALTER COLUMN ClaimSubmittedDate DATETIME2 NULL;
  PRINT 'Upgraded claimhistory.ClaimSubmittedDate to DATETIME2';
END

GO
-- -- Backfill denial_posting_date from earliest denial indicator ----------------
-- (separate GO batch so SQL Server can see the newly-added columns at compile time)

UPDATE dbo.claims
SET denial_posting_date = ClaimSubmittedDate
WHERE denial_posting_date IS NULL
  AND ClaimID LIKE 'CL5%';

-- -- Backfill source_system ----------------------------------------------------

UPDATE dbo.claims SET source_system = 'denial-iq' WHERE source_system IS NULL AND ClaimID LIKE 'CL5%';
UPDATE dbo.claims SET source_system = 'recon-iq'  WHERE source_system IS NULL AND ClaimID LIKE 'CLM%';
UPDATE dbo.claims SET source_system = 'recon-iq'  WHERE source_system IS NULL AND ClaimID LIKE 'CL6%';

PRINT 'Migration 050 complete: Denial IQ Enterprise schema applied';
