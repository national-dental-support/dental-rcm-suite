-- @data: reference
-- Add file storage configuration to ReconIqConfig
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'storage_type')
  ALTER TABLE dbo.ReconIqConfig ADD storage_type NVARCHAR(20) NOT NULL DEFAULT 'local';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'storage_connection_string')
  ALTER TABLE dbo.ReconIqConfig ADD storage_connection_string NVARCHAR(1000) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'storage_path')
  ALTER TABLE dbo.ReconIqConfig ADD storage_path NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReconIqConfig') AND name = 'storage_retention_days')
  ALTER TABLE dbo.ReconIqConfig ADD storage_retention_days INT NOT NULL DEFAULT 365;
