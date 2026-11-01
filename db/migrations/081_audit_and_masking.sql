-- @data: reference
-- 081_audit_and_masking.sql
-- Schema for 32 feature enhancements across 8 categories.

-- ===============================================================================
-- SCHEDULING ENHANCEMENTS
-- ===============================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Waitlist')
CREATE TABLE dbo.Waitlist (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  provider_id       INT NULL,
  appointment_type_id INT NULL,
  preferred_days    NVARCHAR(50) NULL,           -- JSON array: [1,2,3] (Mon-Wed)
  preferred_time_start TIME NULL,
  preferred_time_end TIME NULL,
  priority          INT DEFAULT 0,               -- higher = more urgent
  status            NVARCHAR(20) DEFAULT 'waiting', -- 'waiting','offered','booked','expired','cancelled'
  offered_slot_date DATE NULL,
  offered_at        DATETIME2 NULL,
  expires_at        DATETIME2 NULL,
  notes             NVARCHAR(500) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TreatmentSequence')
CREATE TABLE dbo.TreatmentSequence (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  treat_plan_id     INT NOT NULL,
  sequence_num      INT NOT NULL,                 -- 1, 2, 3...
  proc_code         NVARCHAR(15) NOT NULL,
  tooth_num         INT NULL,
  estimated_duration_min INT DEFAULT 60,
  scheduled_apt_id  INT NULL,                     -- FK to Appointment when scheduled
  status            NVARCHAR(20) DEFAULT 'pending', -- 'pending','scheduled','completed'
  days_after_previous INT DEFAULT 14,             -- suggested days gap from previous step
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- BILLING ENHANCEMENTS
-- ===============================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SecondaryClaimQueue')
CREATE TABLE dbo.SecondaryClaimQueue (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  primary_claim_id  NVARCHAR(50) NOT NULL,
  secondary_plan_id INT NULL,
  primary_paid      DECIMAL(10,2) NULL,
  primary_allowed   DECIMAL(10,2) NULL,
  cob_amount        DECIMAL(10,2) NULL,           -- coordination of benefits
  status            NVARCHAR(20) DEFAULT 'pending', -- 'pending','generated','submitted','paid'
  secondary_claim_id NVARCHAR(50) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ClaimAttachmentRule')
CREATE TABLE dbo.ClaimAttachmentRule (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  payer_id          INT NULL,                     -- null = all payers
  proc_code         NVARCHAR(15) NOT NULL,
  requires_xray     BIT DEFAULT 0,
  requires_narrative BIT DEFAULT 0,
  requires_perio_chart BIT DEFAULT 0,
  requires_photo    BIT DEFAULT 0,
  notes             NVARCHAR(200) NULL,
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UnearnedRevenue')
CREATE TABLE dbo.UnearnedRevenue (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  type              NVARCHAR(20) NOT NULL,        -- 'prepayment','credit_balance','gift_card'
  amount            DECIMAL(10,2) NOT NULL,
  remaining         DECIMAL(10,2) NOT NULL,
  reference         NVARCHAR(100) NULL,           -- payment ID, gift card number
  applied_to        NVARCHAR(MAX) NULL,           -- JSON: [{procNum, amount, date}]
  status            NVARCHAR(20) DEFAULT 'active', -- 'active','applied','refunded','expired'
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- INSURANCE ENHANCEMENTS
-- ===============================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InsuranceFrequencyLimit')
CREATE TABLE dbo.InsuranceFrequencyLimit (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  payer_id          INT NULL,                     -- null = default for all payers
  plan_id           INT NULL,
  proc_code         NVARCHAR(15) NOT NULL,        -- e.g., 'D0120', 'D1110', 'D0210'
  frequency_months  INT NOT NULL,                 -- e.g., 6 = once per 6 months
  frequency_per_year INT NULL,                    -- alternative: 2 = twice per year
  age_min           INT NULL,                     -- age restriction (e.g., sealants < 16)
  age_max           INT NULL,
  notes             NVARCHAR(200) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InsuranceWaitingPeriod')
CREATE TABLE dbo.InsuranceWaitingPeriod (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  payer_id          INT NULL,
  plan_id           INT NULL,
  category          NVARCHAR(30) NOT NULL,        -- 'preventive','basic','major','ortho'
  waiting_months    INT NOT NULL,                 -- months from plan start before coverage
  notes             NVARCHAR(200) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DowncodeAlert')
CREATE TABLE dbo.DowncodeAlert (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  payer_id          INT NOT NULL,
  submitted_code    NVARCHAR(15) NOT NULL,        -- what we submitted
  paid_as_code      NVARCHAR(15) NOT NULL,        -- what they paid as
  frequency         INT DEFAULT 1,                -- how many times this happened
  last_occurred     DATE NULL,
  notes             NVARCHAR(200) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- SECURITY ENHANCEMENTS
-- ===============================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SessionAudit')
CREATE TABLE dbo.SessionAudit (
  id                BIGINT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  user_id           NVARCHAR(255) NOT NULL,
  session_id        NVARCHAR(200) NOT NULL,
  action            NVARCHAR(50) NOT NULL,        -- 'view_patient','edit_patient','view_chart','print_statement','export_data'
  entity_type       NVARCHAR(50) NULL,            -- 'patient','claim','image','document','rx'
  entity_id         NVARCHAR(100) NULL,
  details           NVARCHAR(MAX) NULL,           -- JSON with field-level changes
  ip_address        NVARCHAR(45) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionAudit_User' AND object_id = OBJECT_ID('dbo.SessionAudit'))
  CREATE INDEX IX_SessionAudit_User ON dbo.SessionAudit(customer_id, user_id, created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionAudit_Entity' AND object_id = OBJECT_ID('dbo.SessionAudit'))
  CREATE INDEX IX_SessionAudit_Entity ON dbo.SessionAudit(entity_type, entity_id);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FieldMaskingRule')
CREATE TABLE dbo.FieldMaskingRule (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  entity_type       NVARCHAR(50) NOT NULL,        -- 'patient','rx','claim'
  field_name        NVARCHAR(100) NOT NULL,       -- 'SSN','DOB','Address','ClinicalNotes'
  min_role          NVARCHAR(30) NOT NULL,        -- minimum role to see unmasked: 'Admin','Manager','Provider','AR Specialist'
  mask_type         NVARCHAR(20) DEFAULT 'partial', -- 'hidden','partial','redacted'
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BreakTheGlassLog')
CREATE TABLE dbo.BreakTheGlassLog (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  user_id           NVARCHAR(255) NOT NULL,
  patient_id        INT NOT NULL,
  reason            NVARCHAR(MAX) NOT NULL,       -- mandatory justification
  entity_type       NVARCHAR(50) NOT NULL,
  entity_id         NVARCHAR(100) NULL,
  ip_address        NVARCHAR(45) NULL,
  accessed_at       DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BusinessAssociateAgreement')
CREATE TABLE dbo.BusinessAssociateAgreement (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  vendor_name       NVARCHAR(200) NOT NULL,
  vendor_contact    NVARCHAR(200) NULL,
  agreement_date    DATE NOT NULL,
  expiration_date   DATE NULL,
  renewal_date      DATE NULL,
  document_path     NVARCHAR(500) NULL,
  status            NVARCHAR(20) DEFAULT 'active', -- 'active','expiring','expired','terminated'
  notes             NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- OPERATIONS ENHANCEMENTS
-- ===============================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProcedureInventoryLink')
CREATE TABLE dbo.ProcedureInventoryLink (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  proc_code         NVARCHAR(15) NOT NULL,
  inventory_item_id INT NOT NULL REFERENCES dbo.InventoryItem(id),
  quantity_used     INT DEFAULT 1,
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  UNIQUE(customer_id, proc_code, inventory_item_id)
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SupplyOrder')
CREATE TABLE dbo.SupplyOrder (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  vendor_name       NVARCHAR(200) NOT NULL,
  order_date        DATE NOT NULL DEFAULT GETUTCDATE(),
  status            NVARCHAR(20) DEFAULT 'draft', -- 'draft','submitted','confirmed','shipped','received','cancelled'
  total_amount      DECIMAL(10,2) NULL,
  notes             NVARCHAR(MAX) NULL,
  submitted_at      DATETIME2 NULL,
  received_at       DATETIME2 NULL,
  created_by        NVARCHAR(255) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SupplyOrderLine')
CREATE TABLE dbo.SupplyOrderLine (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  order_id          INT NOT NULL REFERENCES dbo.SupplyOrder(id),
  inventory_item_id INT NOT NULL REFERENCES dbo.InventoryItem(id),
  quantity_ordered  INT NOT NULL,
  unit_cost         DECIMAL(10,2) NULL,
  quantity_received INT NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- COMMUNICATION ENHANCEMENTS
-- ===============================================================================

-- Two-way SMS: inbound message tracking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InboundSms')
CREATE TABLE dbo.InboundSms (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  from_number       NVARCHAR(20) NOT NULL,
  to_number         NVARCHAR(20) NOT NULL,
  body              NVARCHAR(MAX) NOT NULL,
  patient_id        INT NULL,                     -- matched patient
  intent            NVARCHAR(20) NULL,            -- 'confirm','cancel','reschedule','question','unknown'
  processed         BIT DEFAULT 0,
  processed_action  NVARCHAR(50) NULL,            -- 'appointment_confirmed','appointment_cancelled', etc.
  provider_message_id NVARCHAR(200) NULL,
  received_at       DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Smart recall configuration
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SmartRecallRule')
CREATE TABLE dbo.SmartRecallRule (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  risk_level        NVARCHAR(20) NOT NULL,        -- 'low','moderate','high'
  recall_interval_months INT NOT NULL,            -- 3, 4, 6, 12
  criteria          NVARCHAR(MAX) NULL,           -- JSON: {"perio_stage_min": 2, "bleeding_pct_min": 20}
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Automated lifecycle messages
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LifecycleMessage')
CREATE TABLE dbo.LifecycleMessage (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  trigger_type      NVARCHAR(30) NOT NULL,        -- 'birthday','holiday','treatment_incomplete','new_patient_welcome','anniversary'
  channel           NVARCHAR(10) NOT NULL,        -- 'sms','email'
  subject           NVARCHAR(200) NULL,
  body              NVARCHAR(MAX) NOT NULL,
  days_offset       INT DEFAULT 0,                -- days before/after trigger (negative = before)
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

PRINT 'Migration 081: Enhancement tables created.';
