-- @data: reference
-- 004_tenant_isolation.sql
-- Multi-tenant data isolation for clinical
-- Adds customer_id to all per-tenant clinical and reference tables
-- Existing data backfills to customer_id = 1 via DEFAULT constraint

-- ============================================================
-- Per-tenant clinical tables (27)
-- ============================================================

IF COL_LENGTH('dbo.patient', 'customer_id') IS NULL
  ALTER TABLE dbo.patient ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Appointment', 'customer_id') IS NULL
  ALTER TABLE dbo.Appointment ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.ProcedureLog', 'customer_id') IS NULL
  ALTER TABLE dbo.ProcedureLog ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Payment', 'customer_id') IS NULL
  ALTER TABLE dbo.Payment ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.InsPlan', 'customer_id') IS NULL
  ALTER TABLE dbo.InsPlan ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.TreatPlan', 'customer_id') IS NULL
  ALTER TABLE dbo.TreatPlan ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.TreatPlanProc', 'customer_id') IS NULL
  ALTER TABLE dbo.TreatPlanProc ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Recall', 'customer_id') IS NULL
  ALTER TABLE dbo.Recall ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Commlog', 'customer_id') IS NULL
  ALTER TABLE dbo.Commlog ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Referral', 'customer_id') IS NULL
  ALTER TABLE dbo.Referral ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Rx', 'customer_id') IS NULL
  ALTER TABLE dbo.Rx ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.LabCase', 'customer_id') IS NULL
  ALTER TABLE dbo.LabCase ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Allergy', 'customer_id') IS NULL
  ALTER TABLE dbo.Allergy ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.MedPat', 'customer_id') IS NULL
  ALTER TABLE dbo.MedPat ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.PatNote', 'customer_id') IS NULL
  ALTER TABLE dbo.PatNote ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Vitals', 'customer_id') IS NULL
  ALTER TABLE dbo.Vitals ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.PerioExam', 'customer_id') IS NULL
  ALTER TABLE dbo.PerioExam ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.ToothInitial', 'customer_id') IS NULL
  ALTER TABLE dbo.ToothInitial ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.PatientFamily', 'customer_id') IS NULL
  ALTER TABLE dbo.PatientFamily ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.PatImage', 'customer_id') IS NULL
  ALTER TABLE dbo.PatImage ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.PreAuth', 'customer_id') IS NULL
  ALTER TABLE dbo.PreAuth ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.ClaimAppeal', 'customer_id') IS NULL
  ALTER TABLE dbo.ClaimAppeal ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.PayPlan', 'customer_id') IS NULL
  ALTER TABLE dbo.PayPlan ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Adjustment', 'customer_id') IS NULL
  ALTER TABLE dbo.Adjustment ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.OrthoCase', 'customer_id') IS NULL
  ALTER TABLE dbo.OrthoCase ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.OrthoVisit', 'customer_id') IS NULL
  ALTER TABLE dbo.OrthoVisit ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.SchedBlock', 'customer_id') IS NULL
  ALTER TABLE dbo.SchedBlock ADD customer_id INT NOT NULL DEFAULT 1;

-- ============================================================
-- Per-tenant reference tables (4)
-- ============================================================

IF COL_LENGTH('dbo.provider', 'customer_id') IS NULL
  ALTER TABLE dbo.provider ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Operatory', 'customer_id') IS NULL
  ALTER TABLE dbo.Operatory ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.FeeSched', 'customer_id') IS NULL
  ALTER TABLE dbo.FeeSched ADD customer_id INT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.Fee', 'customer_id') IS NULL
  ALTER TABLE dbo.Fee ADD customer_id INT NOT NULL DEFAULT 1;

-- ============================================================
-- Indexes for high-traffic tables
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_patient_customer_id' AND object_id = OBJECT_ID('dbo.patient'))
  CREATE INDEX IX_patient_customer_id ON dbo.patient(customer_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_customer_id' AND object_id = OBJECT_ID('dbo.Appointment'))
  CREATE INDEX IX_Appointment_customer_id ON dbo.Appointment(customer_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProcedureLog_customer_id' AND object_id = OBJECT_ID('dbo.ProcedureLog'))
  CREATE INDEX IX_ProcedureLog_customer_id ON dbo.ProcedureLog(customer_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Payment_customer_id' AND object_id = OBJECT_ID('dbo.Payment'))
  CREATE INDEX IX_Payment_customer_id ON dbo.Payment(customer_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_claims_customer_id' AND object_id = OBJECT_ID('dbo.claims'))
  CREATE INDEX IX_claims_customer_id ON dbo.claims(customer_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InsPlan_customer_id' AND object_id = OBJECT_ID('dbo.InsPlan'))
  CREATE INDEX IX_InsPlan_customer_id ON dbo.InsPlan(customer_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_provider_customer_id' AND object_id = OBJECT_ID('dbo.provider'))
  CREATE INDEX IX_provider_customer_id ON dbo.provider(customer_id);

PRINT '004_tenant_isolation.sql completed successfully';
