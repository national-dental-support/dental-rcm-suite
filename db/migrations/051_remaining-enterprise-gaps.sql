-- @data: reference
-- ===============================================================================
-- Migration 051: Remaining enterprise gaps
--
-- 1. load_timestamp on all curated tables
-- 2. Multi-level escalation paths
-- 3. Deduplication tracking
-- 4. Late-arriving data handling
-- 5. Quarantine / exception reporting
-- ===============================================================================

-- -- 1. load_timestamp on core tables -------------------------------------------

IF COL_LENGTH('dbo.claims', 'load_timestamp') IS NULL
  ALTER TABLE dbo.claims ADD load_timestamp DATETIME2 NOT NULL DEFAULT GETUTCDATE();

IF COL_LENGTH('dbo.claimhistory', 'load_timestamp') IS NULL
  ALTER TABLE dbo.claimhistory ADD load_timestamp DATETIME2 NOT NULL DEFAULT GETUTCDATE();

IF COL_LENGTH('dbo.recon_report', 'load_timestamp') IS NULL
  ALTER TABLE dbo.recon_report ADD load_timestamp DATETIME2 NOT NULL DEFAULT GETUTCDATE();

-- -- 2. Multi-Level Escalation Paths -------------------------------------------

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EscalationPath')
BEGIN
  CREATE TABLE dbo.EscalationPath (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    customer_id     SMALLINT NOT NULL,
    path_name       NVARCHAR(100) NOT NULL,      -- 'default', 'high-value', 'timely-filing-risk'
    is_active       BIT NOT NULL DEFAULT 1,
    created_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EscalationPathStep')
BEGIN
  CREATE TABLE dbo.EscalationPathStep (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    path_id             INT NOT NULL REFERENCES dbo.EscalationPath(id),
    step_order          INT NOT NULL,                -- 1, 2, 3 ...
    escalate_to_role    NVARCHAR(50) NOT NULL,       -- 'Supervisor', 'Manager', 'Director', 'Finance'
    escalate_to_user_id INT NULL,                    -- Specific user (optional)
    trigger_after_hours INT NOT NULL DEFAULT 24,     -- Hours after prior step before auto-escalating
    notify              BIT NOT NULL DEFAULT 1,      -- Send notification on escalation
    created_at          DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX IX_EscalationStep_path ON dbo.EscalationPathStep(path_id, step_order);
END

-- Track which escalation step a claim is currently at
IF COL_LENGTH('dbo.claimhistory', 'escalation_path_id') IS NULL
  ALTER TABLE dbo.claimhistory ADD escalation_path_id INT NULL;

IF COL_LENGTH('dbo.claimhistory', 'escalation_step') IS NULL
  ALTER TABLE dbo.claimhistory ADD escalation_step INT NULL DEFAULT 0;

-- Seed a default 3-level escalation path for each customer
INSERT INTO dbo.EscalationPath (customer_id, path_name)
SELECT uid, 'default' FROM dbo.Customers c
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.EscalationPath ep WHERE ep.customer_id = c.uid AND ep.path_name = 'default'
);

-- Seed default steps: Specialist -> Supervisor (24h) -> Manager (48h) -> Finance (72h)
INSERT INTO dbo.EscalationPathStep (path_id, step_order, escalate_to_role, trigger_after_hours)
SELECT ep.id, s.step_order, s.escalate_to_role, s.trigger_after_hours
FROM dbo.EscalationPath ep
CROSS APPLY (VALUES
  (1, 'Supervisor', 24),
  (2, 'Manager', 48),
  (3, 'Finance', 72)
) AS s(step_order, escalate_to_role, trigger_after_hours)
WHERE ep.path_name = 'default'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.EscalationPathStep eps WHERE eps.path_id = ep.id
  );

-- -- 3. Deduplication Tracking ------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClaimDeduplicationLog')
BEGIN
  CREATE TABLE dbo.ClaimDeduplicationLog (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    claim_id          NVARCHAR(50) NOT NULL,
    duplicate_of      NVARCHAR(50) NOT NULL,        -- The canonical/surviving claim
    match_reason      NVARCHAR(100) NOT NULL,        -- 'patient_dos_charge', 'insurance_claim_id', 'manual'
    confidence        DECIMAL(5,2) NULL,             -- 0-100 match confidence
    action_taken      NVARCHAR(30) NOT NULL DEFAULT 'flagged',  -- 'flagged', 'merged', 'rejected', 'accepted'
    reviewed_by       INT NULL,
    reviewed_at       DATETIME2 NULL,
    customer_id       SMALLINT NULL,
    created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX IX_DedupLog_claim ON dbo.ClaimDeduplicationLog(claim_id);
  CREATE INDEX IX_DedupLog_dup ON dbo.ClaimDeduplicationLog(duplicate_of);
END

-- -- 4. Late-Arriving Data Tracking ------------------------------------------

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='LateArrivingRecord')
BEGIN
  CREATE TABLE dbo.LateArrivingRecord (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    target_table    NVARCHAR(50) NOT NULL,           -- 'claims', 'recon_report', etc.
    record_key      NVARCHAR(100) NOT NULL,          -- ClaimID or other PK
    arrival_type    NVARCHAR(30) NOT NULL,            -- 'new_record', 'correction', 'reversal'
    original_load   DATETIME2 NULL,                  -- When the record was first loaded
    late_load       DATETIME2 NOT NULL DEFAULT GETUTCDATE(),  -- When the late version arrived
    days_late       INT NULL,                        -- Computed delay
    fields_changed  NVARCHAR(MAX) NULL,              -- JSON: changed field names and old/new values
    applied         BIT NOT NULL DEFAULT 0,          -- Whether the update was applied
    customer_id     SMALLINT NULL,
    created_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX IX_LateArriving_table ON dbo.LateArrivingRecord(target_table, record_key);
  CREATE INDEX IX_LateArriving_pending ON dbo.LateArrivingRecord(applied) WHERE applied = 0;
END

-- -- 5. Quarantine / Exception Queue -----------------------------------------

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DataQuarantine')
BEGIN
  CREATE TABLE dbo.DataQuarantine (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    source_table      NVARCHAR(50) NOT NULL,         -- Where record came from
    record_key        NVARCHAR(100) NOT NULL,        -- PK of quarantined record
    rule_code         NVARCHAR(50) NOT NULL,          -- FK to DataQualityRule.rule_code
    severity          NVARCHAR(20) NOT NULL,          -- 'error', 'warning', 'info'
    raw_data          NVARCHAR(MAX) NULL,             -- JSON snapshot of the record
    status            NVARCHAR(20) NOT NULL DEFAULT 'open',  -- 'open', 'reviewed', 'resolved', 'suppressed'
    resolution_notes  NVARCHAR(MAX) NULL,
    resolved_by       INT NULL,
    resolved_at       DATETIME2 NULL,
    customer_id       SMALLINT NULL,
    created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX IX_Quarantine_status ON dbo.DataQuarantine(status, source_table);
  CREATE INDEX IX_Quarantine_rule ON dbo.DataQuarantine(rule_code);
END

PRINT 'Migration 051 complete: remaining enterprise gaps addressed';
