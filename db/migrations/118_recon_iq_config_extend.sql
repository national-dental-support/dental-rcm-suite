-- @data: reference
-- Extend ReconIqConfig with additional admin-configurable settings.
-- Columns are added only if they don't already exist (safe to re-run).

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'era_auto_import_enabled')
  ALTER TABLE dbo.ReconIqConfig ADD era_auto_import_enabled BIT NOT NULL DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'era_match_tolerance')
  ALTER TABLE dbo.ReconIqConfig ADD era_match_tolerance DECIMAL(8,2) NOT NULL DEFAULT 1.00;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'unmatched_escalation_days')
  ALTER TABLE dbo.ReconIqConfig ADD unmatched_escalation_days INT NOT NULL DEFAULT 30;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'auto_escalate_enabled')
  ALTER TABLE dbo.ReconIqConfig ADD auto_escalate_enabled BIT NOT NULL DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'default_notify_email')
  ALTER TABLE dbo.ReconIqConfig ADD default_notify_email NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'statement_frequency')
  ALTER TABLE dbo.ReconIqConfig ADD statement_frequency NVARCHAR(20) NOT NULL DEFAULT 'monthly';
