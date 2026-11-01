-- @data: reference
-- 079_integrations.sql
-- Schema changes for 10 clinical PMS integration features:
--   1. Electronic claim submission
--   2. Payment processing (Stripe)
--   3. Real-time eligibility
--   4. ePrescribing
--   5. HIPAA-compliant storage
--   6. Automated communications
--   7. DICOM imaging
--   8. Treatment plan workflow
--   9. ERA auto-matching
--  10. Lab system integration

-- ===============================================================================
-- 1. ELECTRONIC CLAIM SUBMISSION
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ClaimSubmission')
CREATE TABLE dbo.ClaimSubmission (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  claim_id          NVARCHAR(50) NOT NULL,
  edi_content       NVARCHAR(MAX) NULL,        -- raw X12 837D content
  clearinghouse     NVARCHAR(50) NOT NULL,      -- 'dentalxchange','nea','availity','tesia'
  submitted_at      DATETIME2 NULL,
  status            NVARCHAR(20) DEFAULT 'generated', -- 'generated','submitted','accepted','rejected','error'
  response_code     NVARCHAR(50) NULL,
  response_message  NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- 2. PAYMENT PROCESSING (STRIPE)
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PaymentTransaction')
CREATE TABLE dbo.PaymentTransaction (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  payment_id        INT NULL,                   -- FK to Payment table
  patient_id        INT NOT NULL,
  stripe_intent_id  NVARCHAR(200) NULL,
  stripe_charge_id  NVARCHAR(200) NULL,
  amount            DECIMAL(10,2) NOT NULL,
  currency          NVARCHAR(3) DEFAULT 'usd',
  status            NVARCHAR(20) NOT NULL,      -- 'pending','succeeded','failed','refunded'
  card_brand        NVARCHAR(20) NULL,          -- 'visa','mastercard','amex'
  card_last4        NVARCHAR(4) NULL,
  receipt_url       NVARCHAR(500) NULL,
  refund_id         NVARCHAR(200) NULL,
  refund_amount     DECIMAL(10,2) NULL,
  error_message     NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Recurring payment setup for payment plans
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RecurringPayment')
CREATE TABLE dbo.RecurringPayment (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  pay_plan_id       INT NULL,                   -- FK to PayPlan
  stripe_customer_id NVARCHAR(200) NULL,
  stripe_payment_method_id NVARCHAR(200) NULL,
  amount            DECIMAL(10,2) NOT NULL,
  interval_type     NVARCHAR(10) DEFAULT 'monthly', -- 'weekly','biweekly','monthly'
  next_charge_date  DATE NULL,
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- 3. REAL-TIME ELIGIBILITY
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityCheck')
CREATE TABLE dbo.EligibilityCheck (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  plan_id           INT NULL,
  payer_id          INT NULL,
  checked_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  is_eligible       BIT NULL,
  deductible_total  DECIMAL(10,2) NULL,
  deductible_used   DECIMAL(10,2) NULL,
  annual_max_total  DECIMAL(10,2) NULL,
  annual_max_used   DECIMAL(10,2) NULL,
  coverage_preventive DECIMAL(5,2) NULL,        -- percentage (e.g., 100.00)
  coverage_basic    DECIMAL(5,2) NULL,
  coverage_major    DECIMAL(5,2) NULL,
  coverage_ortho    DECIMAL(5,2) NULL,
  plan_start_date   DATE NULL,
  plan_end_date     DATE NULL,
  response_raw      NVARCHAR(MAX) NULL,         -- raw X12 271 or JSON
  error_message     NVARCHAR(MAX) NULL,
  cache_expires_at  DATETIME2 NULL              -- results cached for 24h
);

-- ===============================================================================
-- 4. ePRESCRIBING
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PharmacyDirectory')
CREATE TABLE dbo.PharmacyDirectory (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  ncpdp_id          NVARCHAR(20) NULL,
  name              NVARCHAR(200) NOT NULL,
  address           NVARCHAR(200) NULL,
  city              NVARCHAR(100) NULL,
  state             NVARCHAR(2) NULL,
  zip               NVARCHAR(10) NULL,
  phone             NVARCHAR(20) NULL,
  fax               NVARCHAR(20) NULL,
  is_24hr           BIT DEFAULT 0,
  accepts_erx       BIT DEFAULT 1
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RxTransmission')
CREATE TABLE dbo.RxTransmission (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  rx_id             INT NOT NULL,
  pharmacy_id       INT NULL,
  ncpdp_message     NVARCHAR(MAX) NULL,         -- NCPDP SCRIPT message
  sent_at           DATETIME2 NULL,
  status            NVARCHAR(20) DEFAULT 'pending', -- 'pending','sent','accepted','rejected','error'
  response_code     NVARCHAR(50) NULL,
  response_message  NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Add pharmacy_id to Rx table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Rx' AND COLUMN_NAME = 'pharmacy_id')
  ALTER TABLE dbo.Rx ADD pharmacy_id INT NULL;

-- ===============================================================================
-- 5. HIPAA-COMPLIANT STORAGE
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PatImage' AND COLUMN_NAME = 'storage_provider')
BEGIN
  ALTER TABLE dbo.PatImage ADD storage_provider NVARCHAR(20) NULL DEFAULT 'local';  -- 'local','azure_blob','s3'
  ALTER TABLE dbo.PatImage ADD storage_path NVARCHAR(500) NULL;
  ALTER TABLE dbo.PatImage ADD encryption_key_id NVARCHAR(100) NULL;
  ALTER TABLE dbo.PatImage ADD is_encrypted BIT DEFAULT 0;
END;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ClaimDocuments' AND COLUMN_NAME = 'storage_provider')
BEGIN
  ALTER TABLE dbo.ClaimDocuments ADD storage_provider NVARCHAR(20) NULL DEFAULT 'local';
  ALTER TABLE dbo.ClaimDocuments ADD storage_path NVARCHAR(500) NULL;
  ALTER TABLE dbo.ClaimDocuments ADD encryption_key_id NVARCHAR(100) NULL;
  ALTER TABLE dbo.ClaimDocuments ADD is_encrypted BIT DEFAULT 0;
END;

-- Access audit for HIPAA
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PhiAccessLog')
CREATE TABLE dbo.PhiAccessLog (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  user_id           NVARCHAR(255) NOT NULL,
  entity_type       NVARCHAR(50) NOT NULL,      -- 'image','document','patient','rx'
  entity_id         INT NOT NULL,
  action            NVARCHAR(20) NOT NULL,       -- 'view','download','print','export'
  ip_address        NVARCHAR(45) NULL,
  user_agent        NVARCHAR(500) NULL,
  accessed_at       DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- 6. AUTOMATED COMMUNICATIONS
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CommunicationPreference')
CREATE TABLE dbo.CommunicationPreference (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL UNIQUE,
  sms_opt_in        BIT DEFAULT 1,
  email_opt_in      BIT DEFAULT 1,
  preferred_channel NVARCHAR(10) DEFAULT 'sms', -- 'sms','email','both'
  preferred_phone   NVARCHAR(20) NULL,
  preferred_email   NVARCHAR(200) NULL,
  updated_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ReminderTemplate')
CREATE TABLE dbo.ReminderTemplate (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  template_type     NVARCHAR(30) NOT NULL,      -- 'appointment_reminder','recall_notice','balance_due','welcome'
  channel           NVARCHAR(10) NOT NULL,       -- 'sms','email'
  subject           NVARCHAR(200) NULL,          -- email subject (null for SMS)
  body              NVARCHAR(MAX) NOT NULL,      -- supports {{patient_name}}, {{date}}, {{time}}, {{provider}} tokens
  send_before_hours INT NULL,                    -- for reminders: hours before appointment
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CommunicationHistory')
CREATE TABLE dbo.CommunicationHistory (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  patient_id        INT NOT NULL,
  template_id       INT NULL,
  channel           NVARCHAR(10) NOT NULL,       -- 'sms','email'
  recipient         NVARCHAR(200) NOT NULL,      -- phone or email
  subject           NVARCHAR(200) NULL,
  body              NVARCHAR(MAX) NULL,
  status            NVARCHAR(20) NOT NULL,       -- 'queued','sent','delivered','failed','bounced'
  provider_message_id NVARCHAR(200) NULL,        -- Twilio SID or SendGrid message ID
  error_message     NVARCHAR(MAX) NULL,
  sent_at           DATETIME2 NULL,
  delivered_at      DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- 7. DICOM IMAGING
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PatImage' AND COLUMN_NAME = 'dicom_study_uid')
BEGIN
  ALTER TABLE dbo.PatImage ADD dicom_study_uid NVARCHAR(100) NULL;
  ALTER TABLE dbo.PatImage ADD dicom_series_uid NVARCHAR(100) NULL;
  ALTER TABLE dbo.PatImage ADD modality NVARCHAR(20) NULL;           -- 'IO' (intraoral), 'PX' (panoramic), 'CT' (CBCT)
  ALTER TABLE dbo.PatImage ADD body_part NVARCHAR(50) NULL;
  ALTER TABLE dbo.PatImage ADD exposure_kvp FLOAT NULL;
  ALTER TABLE dbo.PatImage ADD exposure_mas FLOAT NULL;
  ALTER TABLE dbo.PatImage ADD preview_path NVARCHAR(500) NULL;      -- JPEG preview of DICOM
END;

-- ===============================================================================
-- 8. TREATMENT PLAN WORKFLOW
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TreatPlan' AND COLUMN_NAME = 'estimated_insurance')
BEGIN
  ALTER TABLE dbo.TreatPlan ADD estimated_insurance DECIMAL(10,2) NULL;
  ALTER TABLE dbo.TreatPlan ADD estimated_patient DECIMAL(10,2) NULL;
  ALTER TABLE dbo.TreatPlan ADD total_fee DECIMAL(10,2) NULL;
  ALTER TABLE dbo.TreatPlan ADD signature_data NVARCHAR(MAX) NULL;   -- base64 e-signature image
  ALTER TABLE dbo.TreatPlan ADD presented_by INT NULL;
  ALTER TABLE dbo.TreatPlan ADD accepted_procs NVARCHAR(MAX) NULL;   -- JSON array of accepted ProcNums (for partial accept)
END;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TreatPlanProc' AND COLUMN_NAME = 'sequence_order')
BEGIN
  ALTER TABLE dbo.TreatPlanProc ADD sequence_order INT NULL DEFAULT 0;
  ALTER TABLE dbo.TreatPlanProc ADD phase_name NVARCHAR(50) NULL;     -- 'Phase 1: Urgent', 'Phase 2: Restorative', etc.
  ALTER TABLE dbo.TreatPlanProc ADD ins_estimate DECIMAL(10,2) NULL;
  ALTER TABLE dbo.TreatPlanProc ADD pat_estimate DECIMAL(10,2) NULL;
  ALTER TABLE dbo.TreatPlanProc ADD is_accepted BIT NULL;
END;

-- ===============================================================================
-- 9. ERA AUTO-MATCHING
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EraLine')
CREATE TABLE dbo.EraLine (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  era_file_id       INT NULL,                    -- FK to uploaded ERA file
  payer_name        NVARCHAR(200) NULL,
  check_number      NVARCHAR(50) NULL,
  check_date        DATE NULL,
  check_amount      DECIMAL(10,2) NULL,
  patient_name      NVARCHAR(200) NULL,
  claim_id_835      NVARCHAR(50) NULL,           -- claim ID from 835 file
  service_date      DATE NULL,
  charge_amount     DECIMAL(10,2) NULL,
  paid_amount       DECIMAL(10,2) NULL,
  adjustment_amount DECIMAL(10,2) NULL,
  adjustment_code   NVARCHAR(20) NULL,           -- CARC code
  -- Matching fields
  matched_claim_id  NVARCHAR(50) NULL,           -- internal ClaimID (our system)
  match_confidence  FLOAT NULL,                  -- 0.0 to 1.0
  match_method      NVARCHAR(20) NULL,           -- 'exact','fuzzy','manual'
  auto_posted       BIT DEFAULT 0,
  posted_at         DATETIME2 NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- ===============================================================================
-- 10. LAB SYSTEM INTEGRATION
-- ===============================================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LabDirectory')
CREATE TABLE dbo.LabDirectory (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  customer_id       INT NOT NULL,
  name              NVARCHAR(200) NOT NULL,
  portal_url        NVARCHAR(500) NULL,
  api_key_encrypted NVARCHAR(500) NULL,
  phone             NVARCHAR(20) NULL,
  fax               NVARCHAR(20) NULL,
  address           NVARCHAR(200) NULL,
  city              NVARCHAR(100) NULL,
  state             NVARCHAR(2) NULL,
  zip               NVARCHAR(10) NULL,
  is_active         BIT DEFAULT 1,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LabCase' AND COLUMN_NAME = 'lab_directory_id')
BEGIN
  ALTER TABLE dbo.LabCase ADD lab_directory_id INT NULL;
  ALTER TABLE dbo.LabCase ADD transmission_status NVARCHAR(20) NULL DEFAULT 'not_sent'; -- 'not_sent','sent','received','in_progress','shipped'
  ALTER TABLE dbo.LabCase ADD tracking_number NVARCHAR(100) NULL;
  ALTER TABLE dbo.LabCase ADD transmitted_at DATETIME2 NULL;
END;

PRINT 'Migration 079: clinical integration tables created.';
