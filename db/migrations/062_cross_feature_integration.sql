-- @data: reference
-- Migration 062: Cross-Feature Integration Schema Changes
-- Adds columns needed for cross-feature integrations

-- TelehealthSession: billing code from duration.
-- Guarded on the table as well as the column: telehealth is a feature this
-- distribution does not include, so the table may legitimately be absent.
IF OBJECT_ID('dbo.TelehealthSession', 'U') IS NOT NULL
   AND NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'TelehealthSession' AND COLUMN_NAME = 'billing_code' AND TABLE_CATALOG = DB_NAME()
)
BEGIN
  ALTER TABLE dbo.TelehealthSession ADD billing_code NVARCHAR(10) NULL;
END;

-- Invoice: insurance vs patient responsibility split
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Invoice' AND COLUMN_NAME = 'insurance_responsibility' AND TABLE_CATALOG = DB_NAME()
)
BEGIN
  ALTER TABLE dbo.Invoice ADD insurance_responsibility DECIMAL(10,2) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Invoice' AND COLUMN_NAME = 'patient_responsibility' AND TABLE_CATALOG = DB_NAME()
)
BEGIN
  ALTER TABLE dbo.Invoice ADD patient_responsibility DECIMAL(10,2) NULL;
END;

-- Invoice: appointment_id for auto-generation linkage
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Invoice' AND COLUMN_NAME = 'appointment_id' AND TABLE_CATALOG = DB_NAME()
)
BEGIN
  ALTER TABLE dbo.Invoice ADD appointment_id INT NULL;
END;
