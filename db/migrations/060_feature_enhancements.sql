-- @data: reference
-- Migration 060: Phase 6 Feature Enhancements
-- Consent Forms versioning, Reminders opt-out (already exists from 058), Kiosk language,
-- Recurring Payments, Payment Plans, Telehealth Questionnaire, RPM Billing Periods,
-- Education reading level

-- =======================================================================
-- Enhancement 1: Consent Forms - Version History
-- =======================================================================

-- Guarded on the table as well as the column: consent forms are a feature this
-- distribution does not include, so the table may legitimately be absent.
IF OBJECT_ID('dbo.ConsentFormTemplate', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ConsentFormTemplate') AND name = 'version')
BEGIN
  ALTER TABLE dbo.ConsentFormTemplate ADD version INT DEFAULT 1;
END
GO

IF OBJECT_ID('dbo.ConsentFormTemplate', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ConsentFormTemplate') AND name = 'previous_version_id')
BEGIN
  ALTER TABLE dbo.ConsentFormTemplate ADD previous_version_id INT NULL;
END
GO

-- =======================================================================
-- Enhancement 3: Kiosk - Language column
-- =======================================================================

IF OBJECT_ID('dbo.KioskConfig', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.KioskConfig') AND name = 'language')
BEGIN
  ALTER TABLE dbo.KioskConfig ADD language NVARCHAR(10) DEFAULT 'en';
END
GO

-- =======================================================================
-- Enhancement 5: Recurring Payments
-- =======================================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.RecurringPayment') AND type = 'U')
BEGIN
  CREATE TABLE dbo.RecurringPayment (
    id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id SMALLINT NOT NULL,
    patient_id INT NOT NULL,
    payment_method_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    frequency NVARCHAR(20) NOT NULL DEFAULT 'monthly',
    next_charge_date DATE NOT NULL,
    end_date DATE NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'active',
    total_charged DECIMAL(12,2) NOT NULL DEFAULT 0,
    charge_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT GETDATE()
  );
END
GO

-- =======================================================================
-- Enhancement 6: Payment Plans
-- =======================================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.PaymentPlan') AND type = 'U')
BEGIN
  CREATE TABLE dbo.PaymentPlan (
    id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id SMALLINT NOT NULL,
    invoice_id INT NOT NULL,
    installment_amount DECIMAL(10,2) NOT NULL,
    total_installments INT NOT NULL,
    completed_installments INT NOT NULL DEFAULT 0,
    frequency NVARCHAR(20) NOT NULL DEFAULT 'monthly',
    next_due_date DATE NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT GETDATE()
  );
END
GO

-- =======================================================================
-- Enhancement 7: Telehealth Questionnaire
-- =======================================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.TelehealthQuestionnaire') AND type = 'U')
BEGIN
  CREATE TABLE dbo.TelehealthQuestionnaire (
    id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id SMALLINT NOT NULL,
    session_id INT NOT NULL,
    responses NVARCHAR(MAX) NULL,
    completed_at DATETIME NULL
  );
END
GO

-- =======================================================================
-- Enhancement 8: RPM Billing Periods
-- =======================================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.RpmBillingPeriod') AND type = 'U')
BEGIN
  CREATE TABLE dbo.RpmBillingPeriod (
    id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id SMALLINT NOT NULL,
    patient_id NVARCHAR(50) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    monitoring_days INT NOT NULL DEFAULT 0,
    total_readings INT NOT NULL DEFAULT 0,
    cpt_code NVARCHAR(10) NULL,
    billable BIT NOT NULL DEFAULT 0,
    billed_at DATETIME NULL
  );
END
GO

-- =======================================================================
-- Enhancement 9: Education - Reading Level
-- =======================================================================

IF OBJECT_ID('dbo.EducationContent', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.EducationContent') AND name = 'reading_level')
BEGIN
  ALTER TABLE dbo.EducationContent ADD reading_level NVARCHAR(20) NULL;
END
GO
