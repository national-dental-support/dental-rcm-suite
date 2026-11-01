-- @data: reference
-- Migration 058: Security hardening - audit log, telemetry, encryption IV columns, reminder opt-out
-- Date: 2026-03-17

-- Feature audit log for compliance
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FeatureAuditLog')
CREATE TABLE dbo.FeatureAuditLog (
  id INT IDENTITY(1,1) PRIMARY KEY,
  feature NVARCHAR(50) NOT NULL,
  action NVARCHAR(100) NOT NULL,
  actor_id INT NULL,
  actor_email NVARCHAR(200) NULL,
  target_id NVARCHAR(100) NULL,
  target_type NVARCHAR(50) NULL,
  details NVARCHAR(MAX) NULL,
  ip_address NVARCHAR(50) NULL,
  created_at DATETIME DEFAULT GETDATE()
);

-- Telemetry events for monitoring
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TelemetryEvent')
CREATE TABLE dbo.TelemetryEvent (
  id INT IDENTITY(1,1) PRIMARY KEY,
  event_name NVARCHAR(100) NOT NULL,
  feature NVARCHAR(50) NOT NULL,
  actor_id INT NULL,
  customer_id INT NULL,
  metadata NVARCHAR(MAX) NULL,
  created_at DATETIME DEFAULT GETDATE()
);

-- Add api_key_iv columns to config tables for encryption
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='PaymentGatewayConfig' AND COLUMN_NAME='api_key_iv')
  ALTER TABLE dbo.PaymentGatewayConfig ADD api_key_iv NVARCHAR(50) NULL;

-- Guarded on the table as well as the column: FaxConfig belongs to a feature
-- this distribution does not include, so the table may legitimately be absent.
IF OBJECT_ID('dbo.FaxConfig', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='FaxConfig' AND COLUMN_NAME='api_key_iv')
  ALTER TABLE dbo.FaxConfig ADD api_key_iv NVARCHAR(50) NULL;

IF OBJECT_ID('dbo.TelehealthConfig', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TelehealthConfig' AND COLUMN_NAME='api_key_iv')
  ALTER TABLE dbo.TelehealthConfig ADD api_key_iv NVARCHAR(50) NULL;

IF OBJECT_ID('dbo.ReviewSource', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ReviewSource' AND COLUMN_NAME='api_key_iv')
  ALTER TABLE dbo.ReviewSource ADD api_key_iv NVARCHAR(50) NULL;

-- Reminder opt-out table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ReminderOptOut')
CREATE TABLE dbo.ReminderOptOut (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL,
  patient_id INT NOT NULL,
  channel NVARCHAR(10) NOT NULL,
  opted_out_at DATETIME DEFAULT GETDATE(),
  CONSTRAINT UQ_ReminderOptOut UNIQUE (customer_id, patient_id, channel)
);

-- Indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FeatureAuditLog_feature')
  CREATE INDEX IX_FeatureAuditLog_feature ON dbo.FeatureAuditLog (feature, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TelemetryEvent_feature')
  CREATE INDEX IX_TelemetryEvent_feature ON dbo.TelemetryEvent (feature, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TelemetryEvent_event')
  CREATE INDEX IX_TelemetryEvent_event ON dbo.TelemetryEvent (event_name, created_at DESC);
