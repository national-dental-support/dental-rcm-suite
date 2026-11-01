-- @data: reference
-- 082_workflow_rules.sql
-- Schema for world-class features: real-time, documents, business rules,
-- multi-location, workflow automation, data migration, search.

-- ===============================================================================
-- REAL-TIME
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RealtimeEvent')
CREATE TABLE dbo.RealtimeEvent (
  id                BIGINT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  event_type        NVARCHAR(50) NOT NULL,        -- 'appointment_updated','patient_checked_in','hygiene_handoff','claim_status','alert'
  entity_type       NVARCHAR(30) NULL,
  entity_id         NVARCHAR(100) NULL,
  payload           NVARCHAR(MAX) NULL,           -- JSON event data
  target_role       NVARCHAR(30) NULL,            -- null=all, 'provider','front_desk','manager'
  target_user_id    NVARCHAR(255) NULL,           -- specific user, or null=broadcast
  is_read           BIT DEFAULT 0,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
CREATE INDEX IX_RealtimeEvent_Customer ON dbo.RealtimeEvent(customer_id, created_at DESC);

-- ===============================================================================
-- DOCUMENT GENERATION
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GeneratedDocument')
CREATE TABLE dbo.GeneratedDocument (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  document_type     NVARCHAR(30) NOT NULL,        -- 'claim_form','superbill','treatment_plan','routing_slip','referral_letter'
  patient_id        INT NULL,
  provider_id       INT NULL,
  reference_id      NVARCHAR(100) NULL,           -- claim ID, treatment plan ID, etc.
  html_content      NVARCHAR(MAX) NOT NULL,
  pdf_path          NVARCHAR(500) NULL,
  generated_by      NVARCHAR(255) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- BUSINESS RULES
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BusinessRule')
CREATE TABLE dbo.BusinessRule (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  rule_type         NVARCHAR(50) NOT NULL,        -- 'duplicate_claim','appointment_conflict','fee_variance','annual_max','cdt_validation'
  severity          NVARCHAR(10) DEFAULT 'warning', -- 'block','warning','info'
  threshold         FLOAT NULL,                   -- e.g., 10.0 for 10% fee variance
  is_active         BIT DEFAULT 1,
  message_template  NVARCHAR(500) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RuleViolation')
CREATE TABLE dbo.RuleViolation (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  rule_id           INT NULL REFERENCES dbo.BusinessRule(id),
  rule_type         NVARCHAR(50) NOT NULL,
  entity_type       NVARCHAR(30) NOT NULL,        -- 'claim','appointment','procedure'
  entity_id         NVARCHAR(100) NOT NULL,
  severity          NVARCHAR(10) NOT NULL,
  message           NVARCHAR(500) NOT NULL,
  is_overridden     BIT DEFAULT 0,
  overridden_by     NVARCHAR(255) NULL,
  overridden_at     DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- MULTI-LOCATION
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LocationDashboard')
CREATE TABLE dbo.LocationDashboard (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  location_id       INT NOT NULL,
  snapshot_date     DATE NOT NULL,
  total_production  DECIMAL(10,2) DEFAULT 0,
  total_collections DECIMAL(10,2) DEFAULT 0,
  total_ar          DECIMAL(10,2) DEFAULT 0,
  appointment_count INT DEFAULT 0,
  new_patient_count INT DEFAULT 0,
  no_show_count     INT DEFAULT 0,
  schedule_fill_pct DECIMAL(5,2) DEFAULT 0,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  UNIQUE(customer_id, location_id, snapshot_date)
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PatientTransfer')
CREATE TABLE dbo.PatientTransfer (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  from_location_id  INT NOT NULL,
  to_location_id    INT NOT NULL,
  transfer_reason   NVARCHAR(200) NULL,
  transferred_by    NVARCHAR(255) NOT NULL,
  transferred_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- WORKFLOW AUTOMATION
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'WorkflowRule')
CREATE TABLE dbo.WorkflowRule (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  trigger_event     NVARCHAR(50) NOT NULL,        -- 'procedure_complete','appointment_complete','claim_paid','recall_due','plan_renew'
  action_type       NVARCHAR(50) NOT NULL,        -- 'create_claim','update_recall','send_postop','send_alert','update_status'
  conditions        NVARCHAR(MAX) NULL,           -- JSON conditions
  action_config     NVARCHAR(MAX) NULL,           -- JSON action parameters
  is_active         BIT DEFAULT 1,
  execution_count   INT DEFAULT 0,
  last_executed_at  DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'WorkflowExecution')
CREATE TABLE dbo.WorkflowExecution (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  rule_id           INT NOT NULL REFERENCES dbo.WorkflowRule(id),
  trigger_entity    NVARCHAR(100) NULL,           -- e.g., 'proc:12345', 'apt:6789'
  status            NVARCHAR(20) NOT NULL,        -- 'success','failed','skipped'
  result_message    NVARCHAR(500) NULL,
  executed_at       DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- DATA MIGRATION
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DataImportJob')
CREATE TABLE dbo.DataImportJob (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  source_system     NVARCHAR(50) NOT NULL,        -- 'open_dental','dentrix','eaglesoft','csv'
  status            NVARCHAR(20) DEFAULT 'pending', -- 'pending','mapping','importing','complete','error'
  file_path         NVARCHAR(500) NULL,
  field_mapping     NVARCHAR(MAX) NULL,           -- JSON: source->target column mapping
  total_rows        INT DEFAULT 0,
  imported_rows     INT DEFAULT 0,
  error_rows        INT DEFAULT 0,
  error_details     NVARCHAR(MAX) NULL,
  started_at        DATETIME2 NULL,
  completed_at      DATETIME2 NULL,
  created_by        NVARCHAR(255) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- SEARCH & NAVIGATION
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RecentPatient')
CREATE TABLE dbo.RecentPatient (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  user_id           NVARCHAR(255) NOT NULL,
  patient_id        INT NOT NULL,
  accessed_at       DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  UNIQUE(customer_id, user_id, patient_id)
);

PRINT 'Migration 082: World-class dental PMS tables created.';
