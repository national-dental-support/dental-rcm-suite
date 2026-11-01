-- @data: reference
-- 080_compliance_and_security.sql
-- Schema for 27 features across 6 categories:
--   Clinical, Patient Experience, Financial, Compliance, Operations, Interoperability

-- ===============================================================================
-- CLINICAL
-- ===============================================================================

-- Odontogram: link tooth conditions to procedures and treatment plans
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ToothCondition')
CREATE TABLE dbo.ToothCondition (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  tooth_num         INT NOT NULL,                -- 1-32 (universal)
  surface           NVARCHAR(10) NULL,           -- M,O,D,B,L,I combinations
  condition_type    NVARCHAR(30) NOT NULL,        -- 'caries','fracture','missing','impacted','crown','filling','rct','implant','bridge','veneer','sealant'
  status            NVARCHAR(20) DEFAULT 'existing', -- 'existing','planned','completed'
  linked_proc_num   INT NULL,                    -- FK to ProcedureLog
  linked_tp_proc_id INT NULL,                    -- FK to TreatPlanProc
  noted_date        DATE NOT NULL DEFAULT GETUTCDATE(),
  noted_by          INT NULL,                    -- provider who noted it
  notes             NVARCHAR(500) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Perio trending: track measurements over time for comparison
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PerioTrend')
CREATE TABLE dbo.PerioTrend (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  tooth_num         INT NOT NULL,
  site              NVARCHAR(5) NOT NULL,        -- 'DB','B','MB','DL','L','ML' (6 sites per tooth)
  exam_date         DATE NOT NULL,
  probing_depth     SMALLINT NULL,               -- mm
  recession         SMALLINT NULL,               -- mm
  cal               SMALLINT NULL,               -- clinical attachment level (computed)
  bleeding          BIT DEFAULT 0,
  plaque            BIT DEFAULT 0,
  suppuration       BIT DEFAULT 0,
  provider_id       INT NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PerioTrend_Patient' AND object_id = OBJECT_ID('dbo.PerioTrend'))
  CREATE INDEX IX_PerioTrend_Patient ON dbo.PerioTrend(customer_id, patient_id, tooth_num, exam_date);

-- Clinical decision support alerts
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ClinicalAlert')
CREATE TABLE dbo.ClinicalAlert (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  alert_type        NVARCHAR(50) NOT NULL,        -- 'overdue_fmx','overdue_prophy','perio_maintenance','med_interaction','allergy_warning','missing_preauth'
  severity          NVARCHAR(10) DEFAULT 'info',  -- 'info','warning','critical'
  title             NVARCHAR(200) NOT NULL,
  message           NVARCHAR(MAX) NOT NULL,
  is_dismissed      BIT DEFAULT 0,
  dismissed_by      INT NULL,
  dismissed_at      DATETIME2 NULL,
  trigger_rule_id   INT NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Clinical alert rules (configurable per customer)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ClinicalAlertRule')
CREATE TABLE dbo.ClinicalAlertRule (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  alert_type        NVARCHAR(50) NOT NULL,
  proc_code         NVARCHAR(15) NULL,           -- trigger on this procedure code
  interval_months   INT NULL,                    -- months since last occurrence
  is_active         BIT DEFAULT 1,
  message_template  NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Voice/dictation clinical notes
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PatNote' AND COLUMN_NAME = 'audio_file_path')
BEGIN
  ALTER TABLE dbo.PatNote ADD audio_file_path NVARCHAR(500) NULL;
  ALTER TABLE dbo.PatNote ADD transcription_status NVARCHAR(20) NULL;  -- 'pending','completed','failed'
  ALTER TABLE dbo.PatNote ADD transcription_source NVARCHAR(20) NULL;  -- 'manual','speech_to_text'
END;

-- AI diagnosis results (radiograph analysis)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AiDiagnosis')
CREATE TABLE dbo.AiDiagnosis (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  image_id          INT NULL,                    -- FK to PatImage
  model_name        NVARCHAR(100) NOT NULL,       -- 'caries_detector_v2','perio_classifier_v1'
  model_version     NVARCHAR(20) NULL,
  findings          NVARCHAR(MAX) NOT NULL,       -- JSON array of {tooth, surface, condition, confidence, bbox}
  overall_confidence FLOAT NULL,
  reviewed_by       INT NULL,
  review_status     NVARCHAR(20) DEFAULT 'pending', -- 'pending','confirmed','rejected','modified'
  reviewed_at       DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- PATIENT EXPERIENCE
-- ===============================================================================

-- Patient portal accounts
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PortalAccount')
CREATE TABLE dbo.PortalAccount (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL UNIQUE,
  email             NVARCHAR(200) NOT NULL,
  password_hash     NVARCHAR(500) NOT NULL,
  is_active         BIT DEFAULT 1,
  is_verified       BIT DEFAULT 0,
  verification_token NVARCHAR(200) NULL,
  last_login_at     DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Portal messages (patient <-> practice)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PortalMessage')
CREATE TABLE dbo.PortalMessage (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  sender_type       NVARCHAR(10) NOT NULL,        -- 'patient','staff'
  sender_id         NVARCHAR(255) NOT NULL,
  subject           NVARCHAR(200) NULL,
  body              NVARCHAR(MAX) NOT NULL,
  is_read           BIT DEFAULT 0,
  read_at           DATETIME2 NULL,
  parent_message_id INT NULL,                     -- thread replies
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Online scheduling / public booking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'OnlineBookingSlot')
CREATE TABLE dbo.OnlineBookingSlot (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  provider_id       INT NOT NULL,
  operatory_id      INT NULL,
  slot_date         DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  appointment_type_id INT NULL,
  is_available      BIT DEFAULT 1,
  booked_by_patient_id INT NULL,
  booked_at         DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Online booking configuration
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'OnlineBookingConfig')
CREATE TABLE dbo.OnlineBookingConfig (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL UNIQUE,
  is_enabled        BIT DEFAULT 0,
  advance_days      INT DEFAULT 60,               -- how far ahead patients can book
  slot_duration_min INT DEFAULT 30,
  require_new_patient_form BIT DEFAULT 1,
  confirmation_email BIT DEFAULT 1,
  confirmation_sms  BIT DEFAULT 1,
  allowed_apt_types NVARCHAR(MAX) NULL,           -- JSON array of appointment type IDs
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Digital intake forms
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'IntakeForm')
CREATE TABLE dbo.IntakeForm (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  form_name         NVARCHAR(100) NOT NULL,       -- 'new_patient','medical_history','consent','insurance','hipaa_notice'
  form_version      INT DEFAULT 1,
  form_schema       NVARCHAR(MAX) NOT NULL,       -- JSON schema definition (fields, types, validations)
  is_active         BIT DEFAULT 1,
  is_required       BIT DEFAULT 0,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Patient form submissions
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'IntakeSubmission')
CREATE TABLE dbo.IntakeSubmission (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NULL,                     -- null until linked
  form_id           INT NOT NULL REFERENCES dbo.IntakeForm(id),
  form_data         NVARCHAR(MAX) NOT NULL,       -- JSON of submitted answers
  signature_data    NVARCHAR(MAX) NULL,           -- base64 e-signature
  ip_address        NVARCHAR(45) NULL,
  submitted_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  reviewed_by       INT NULL,
  reviewed_at       DATETIME2 NULL,
  status            NVARCHAR(20) DEFAULT 'submitted' -- 'submitted','reviewed','imported'
);

-- Text-to-pay payment links
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PaymentLink')
CREATE TABLE dbo.PaymentLink (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  amount            DECIMAL(10,2) NOT NULL,
  token             NVARCHAR(100) NOT NULL UNIQUE, -- unique URL token
  description       NVARCHAR(200) NULL,
  expires_at        DATETIME2 NOT NULL,
  is_paid           BIT DEFAULT 0,
  paid_at           DATETIME2 NULL,
  payment_id        INT NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Review/reputation management
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ReviewRequest')
CREATE TABLE dbo.ReviewRequest (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  appointment_id    INT NULL,
  channel           NVARCHAR(10) NOT NULL,        -- 'sms','email'
  sent_at           DATETIME2 NULL,
  status            NVARCHAR(20) DEFAULT 'pending', -- 'pending','sent','clicked','reviewed','declined'
  review_platform   NVARCHAR(30) NULL,            -- 'google','yelp','healthgrades'
  review_url        NVARCHAR(500) NULL,
  rating            SMALLINT NULL,                -- 1-5 if captured internally
  review_text       NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ReviewConfig')
CREATE TABLE dbo.ReviewConfig (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL UNIQUE,
  is_enabled        BIT DEFAULT 0,
  google_place_id   NVARCHAR(200) NULL,
  yelp_biz_id       NVARCHAR(200) NULL,
  send_after_hours  INT DEFAULT 2,                -- hours after appointment completion
  min_rating_threshold INT DEFAULT 4,             -- only ask publicly if internal rating >= this
  sms_template      NVARCHAR(MAX) NULL,
  email_template    NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- FINANCIAL
-- ===============================================================================

-- Patient statements
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PatientStatement')
CREATE TABLE dbo.PatientStatement (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  statement_date    DATE NOT NULL DEFAULT GETUTCDATE(),
  balance_due       DECIMAL(10,2) NOT NULL,
  charges_total     DECIMAL(10,2) NOT NULL,
  payments_total    DECIMAL(10,2) NOT NULL,
  adjustments_total DECIMAL(10,2) NOT NULL,
  line_items        NVARCHAR(MAX) NULL,           -- JSON array of charges/payments
  pdf_path          NVARCHAR(500) NULL,
  delivery_method   NVARCHAR(10) NULL,            -- 'email','mail','portal','print'
  sent_at           DATETIME2 NULL,
  dunning_level     INT DEFAULT 0,                -- 0=current, 1=30-day, 2=60-day, 3=90-day, 4=collections
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Collections workflow
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CollectionsAction')
CREATE TABLE dbo.CollectionsAction (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  action_type       NVARCHAR(30) NOT NULL,        -- 'statement_30','statement_60','phone_call','final_notice','sent_to_collections','write_off'
  action_date       DATE NOT NULL DEFAULT GETUTCDATE(),
  performed_by      INT NULL,
  balance_at_action DECIMAL(10,2) NULL,
  notes             NVARCHAR(MAX) NULL,
  next_action_date  DATE NULL,
  next_action_type  NVARCHAR(30) NULL,
  status            NVARCHAR(20) DEFAULT 'completed', -- 'completed','scheduled','skipped'
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Sliding fee schedules (FQHC / income-based discounts)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SlidingFeeSchedule')
CREATE TABLE dbo.SlidingFeeSchedule (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  name              NVARCHAR(100) NOT NULL,       -- 'Federal Poverty Level', 'Senior Discount'
  income_min        DECIMAL(10,2) NULL,           -- min household income
  income_max        DECIMAL(10,2) NULL,           -- max household income
  family_size_min   INT NULL,
  family_size_max   INT NULL,
  discount_percent  DECIMAL(5,2) NOT NULL,        -- e.g., 75.00 = 75% discount
  fee_sched_id      INT NULL,                     -- overrides to specific fee schedule
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Add sliding fee to patient
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'patient' AND COLUMN_NAME = 'sliding_fee_id')
  ALTER TABLE dbo.patient ADD sliding_fee_id INT NULL;


-- ===============================================================================
-- COMPLIANCE & SECURITY
-- ===============================================================================

-- HIPAA training tracker
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ComplianceTraining')
CREATE TABLE dbo.ComplianceTraining (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  user_id           NVARCHAR(255) NOT NULL,
  training_type     NVARCHAR(50) NOT NULL,        -- 'hipaa_privacy','hipaa_security','osha_bloodborne','infection_control','emergency_procedures'
  training_name     NVARCHAR(200) NOT NULL,
  completed_at      DATETIME2 NULL,
  expires_at        DATETIME2 NULL,
  certificate_path  NVARCHAR(500) NULL,
  score             FLOAT NULL,
  status            NVARCHAR(20) DEFAULT 'assigned', -- 'assigned','in_progress','completed','expired'
  assigned_by       NVARCHAR(255) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Versioned consent forms with e-signature audit trail
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ConsentDocument')
CREATE TABLE dbo.ConsentDocument (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  document_type     NVARCHAR(50) NOT NULL,        -- 'treatment_consent','hipaa_notice','financial_agreement','photo_release','sedation_consent'
  version           INT NOT NULL DEFAULT 1,
  title             NVARCHAR(200) NOT NULL,
  body_html         NVARCHAR(MAX) NOT NULL,
  is_current        BIT DEFAULT 1,
  requires_witness  BIT DEFAULT 0,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ConsentSignature')
CREATE TABLE dbo.ConsentSignature (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  document_id       INT NOT NULL REFERENCES dbo.ConsentDocument(id),
  signature_data    NVARCHAR(MAX) NOT NULL,       -- base64 e-signature
  signer_name       NVARCHAR(200) NOT NULL,
  signer_relationship NVARCHAR(50) NULL,          -- 'self','parent','guardian'
  witness_name      NVARCHAR(200) NULL,
  witness_signature NVARCHAR(MAX) NULL,
  ip_address        NVARCHAR(45) NULL,
  user_agent        NVARCHAR(500) NULL,
  signed_at         DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Password policy
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SecurityPolicy')
CREATE TABLE dbo.SecurityPolicy (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL UNIQUE,
  min_password_length INT DEFAULT 12,
  require_uppercase BIT DEFAULT 1,
  require_lowercase BIT DEFAULT 1,
  require_number    BIT DEFAULT 1,
  require_special   BIT DEFAULT 1,
  password_expiry_days INT DEFAULT 90,
  max_failed_attempts INT DEFAULT 5,
  lockout_duration_min INT DEFAULT 30,
  session_timeout_min INT DEFAULT 30,
  require_mfa       BIT DEFAULT 0,
  mfa_method        NVARCHAR(20) NULL,            -- 'totp','sms','email'
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Data retention policies
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DataRetentionPolicy')
CREATE TABLE dbo.DataRetentionPolicy (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  entity_type       NVARCHAR(50) NOT NULL,        -- 'patient_record','financial','imaging','communication','audit_log'
  retention_years   INT NOT NULL,                 -- how long to keep
  state_code        NVARCHAR(2) NULL,             -- state-specific requirement
  regulation        NVARCHAR(100) NULL,           -- 'hipaa','state_dental_board','osha'
  auto_purge        BIT DEFAULT 0,
  last_purge_at     DATETIME2 NULL,
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- OPERATIONS
-- ===============================================================================

-- Provider availability / working hours
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProviderSchedule')
CREATE TABLE dbo.ProviderSchedule (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  provider_id       INT NOT NULL,
  day_of_week       SMALLINT NOT NULL,            -- 0=Sun, 1=Mon, ..., 6=Sat
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  operatory_id      INT NULL,                     -- preferred operatory
  is_active         BIT DEFAULT 1,
  effective_from    DATE NULL,
  effective_to      DATE NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Chair utilization tracking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ChairUtilization')
CREATE TABLE dbo.ChairUtilization (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  operatory_id      INT NOT NULL,
  utilization_date  DATE NOT NULL,
  total_minutes     INT NOT NULL,                 -- total available minutes
  used_minutes      INT NOT NULL,                 -- minutes with appointments
  utilization_pct   DECIMAL(5,2) NULL,
  provider_id       INT NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Inventory / supply management
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InventoryItem')
CREATE TABLE dbo.InventoryItem (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  sku               NVARCHAR(50) NULL,
  name              NVARCHAR(200) NOT NULL,
  category          NVARCHAR(50) NOT NULL,        -- 'restorative','hygiene','endo','ortho','surgical','ppe','office'
  unit              NVARCHAR(20) NULL,            -- 'each','box','pack','roll'
  quantity_on_hand  INT DEFAULT 0,
  reorder_point     INT DEFAULT 0,
  reorder_quantity  INT DEFAULT 0,
  unit_cost         DECIMAL(10,2) NULL,
  vendor_name       NVARCHAR(200) NULL,
  vendor_sku        NVARCHAR(50) NULL,
  last_ordered_at   DATETIME2 NULL,
  last_received_at  DATETIME2 NULL,
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InventoryTransaction')
CREATE TABLE dbo.InventoryTransaction (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  item_id           INT NOT NULL REFERENCES dbo.InventoryItem(id),
  transaction_type  NVARCHAR(20) NOT NULL,        -- 'received','used','adjusted','returned','expired'
  quantity          INT NOT NULL,                  -- positive for in, negative for out
  reference_id      NVARCHAR(100) NULL,           -- PO number, procedure number, etc.
  notes             NVARCHAR(500) NULL,
  performed_by      NVARCHAR(255) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Staff time tracking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TimeEntry')
CREATE TABLE dbo.TimeEntry (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  user_id           NVARCHAR(255) NOT NULL,
  clock_in          DATETIME2 NOT NULL,
  clock_out         DATETIME2 NULL,
  break_minutes     INT DEFAULT 0,
  total_hours       DECIMAL(5,2) NULL,            -- computed on clock-out
  entry_type        NVARCHAR(20) DEFAULT 'regular', -- 'regular','overtime','pto','sick','holiday'
  notes             NVARCHAR(500) NULL,
  approved_by       NVARCHAR(255) NULL,
  approved_at       DATETIME2 NULL,
  status            NVARCHAR(20) DEFAULT 'active', -- 'active','completed','approved','disputed'
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Production goals and tracking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProductionGoal')
CREATE TABLE dbo.ProductionGoal (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  provider_id       INT NULL,                     -- null = office-wide goal
  goal_type         NVARCHAR(20) NOT NULL,        -- 'daily','weekly','monthly'
  goal_period       NVARCHAR(10) NOT NULL,        -- 'YYYY-MM-DD' for daily, 'YYYY-WXX' for weekly, 'YYYY-MM' for monthly
  production_target DECIMAL(10,2) NOT NULL,
  collections_target DECIMAL(10,2) NULL,
  actual_production DECIMAL(10,2) DEFAULT 0,
  actual_collections DECIMAL(10,2) DEFAULT 0,
  achievement_pct   DECIMAL(5,2) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- INTEROPERABILITY
-- ===============================================================================

-- FHIR resource log (tracks exposed/consumed FHIR resources)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FhirResourceLog')
CREATE TABLE dbo.FhirResourceLog (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  resource_type     NVARCHAR(50) NOT NULL,        -- 'Patient','Encounter','Observation','Condition','Procedure','AllergyIntolerance','MedicationRequest'
  resource_id       NVARCHAR(200) NOT NULL,
  fhir_version      NVARCHAR(10) DEFAULT 'R4',
  direction         NVARCHAR(10) NOT NULL,        -- 'inbound','outbound'
  endpoint          NVARCHAR(500) NULL,
  status_code       INT NULL,
  request_size      INT NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- HL7 ADT messages (hospital/ASC integration)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Hl7Message')
CREATE TABLE dbo.Hl7Message (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  message_type      NVARCHAR(10) NOT NULL,        -- 'ADT^A01','ADT^A04','ADT^A08','ORM^O01','ORU^R01'
  direction         NVARCHAR(10) NOT NULL,        -- 'inbound','outbound'
  patient_id        INT NULL,
  message_content   NVARCHAR(MAX) NOT NULL,
  ack_status        NVARCHAR(5) NULL,             -- 'AA','AE','AR' (ACK codes)
  processing_status NVARCHAR(20) DEFAULT 'received', -- 'received','processed','error','ignored'
  error_message     NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- CDA (Clinical Document Architecture) documents
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CdaDocument')
CREATE TABLE dbo.CdaDocument (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  document_type     NVARCHAR(50) NOT NULL,        -- 'CCD','referral_summary','discharge_summary','progress_note'
  cda_xml           NVARCHAR(MAX) NOT NULL,
  human_readable    NVARCHAR(MAX) NULL,           -- HTML rendering
  generated_by      NVARCHAR(255) NULL,
  sent_to           NVARCHAR(200) NULL,           -- recipient Direct address or fax
  sent_at           DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Direct messaging (secure provider-to-provider)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DirectMessage')
CREATE TABLE dbo.DirectMessage (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  from_address      NVARCHAR(200) NOT NULL,       -- Direct address (e.g., dr.smith@direct.practice.com)
  to_address        NVARCHAR(200) NOT NULL,
  subject           NVARCHAR(200) NULL,
  body              NVARCHAR(MAX) NULL,
  patient_id        INT NULL,                     -- linked patient (if clinical)
  cda_document_id   INT NULL,                     -- attached CDA document
  attachment_path   NVARCHAR(500) NULL,
  direction         NVARCHAR(10) NOT NULL,        -- 'inbound','outbound'
  status            NVARCHAR(20) DEFAULT 'sent',  -- 'draft','sent','delivered','failed','read'
  delivered_at      DATETIME2 NULL,
  read_at           DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Direct messaging configuration
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DirectConfig')
CREATE TABLE dbo.DirectConfig (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL UNIQUE,
  direct_domain     NVARCHAR(200) NULL,           -- e.g., 'direct.mypractice.com'
  hisp_provider     NVARCHAR(50) NULL,            -- 'directtrust','emrdirect','maxmd'
  hisp_api_url      NVARCHAR(500) NULL,
  hisp_api_key      NVARCHAR(500) NULL,
  is_active         BIT DEFAULT 0,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

PRINT 'Migration 080: Best-in-class dental PMS tables created.';
