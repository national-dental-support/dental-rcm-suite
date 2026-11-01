-- @data: reference
-- Migration 141: IngestConfiguration + IngestRunLog tables
-- IngestConfiguration: per-tenant ingest source definitions (folder watch or API)
-- IngestRunLog: audit trail for every ingest execution (file or API-triggered)

SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'IngestConfiguration')
BEGIN
  CREATE TABLE dbo.IngestConfiguration (
    id                    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    customer_id           INT           NOT NULL,
    name                  NVARCHAR(200) NOT NULL,
    ingest_type           NVARCHAR(20)  NOT NULL,  -- 'claim'|'era'|'eft'|'eob'
    source_type           NVARCHAR(20)  NOT NULL,  -- 'folder'|'api'
    folder_path           NVARCHAR(500) NULL,       -- absolute watched path (folder only)
    file_extensions       NVARCHAR(200) NULL,       -- comma-sep: '.x12,.835,.edi'
    api_json_schema       NVARCHAR(MAX) NULL,       -- JSON Schema (api only)
    payer_id              INT           NULL,
    poll_interval_minutes INT           NOT NULL DEFAULT 5,
    is_active             BIT           NOT NULL DEFAULT 1,
    created_at            DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at            DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_IngestConfiguration_Customer ON dbo.IngestConfiguration(customer_id);
END;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'IngestRunLog')
BEGIN
  CREATE TABLE dbo.IngestRunLog (
    id               INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    config_id        INT           NULL,  -- NULL for ad-hoc API uploads
    customer_id      INT           NOT NULL,
    ingest_type      NVARCHAR(20)  NOT NULL,
    source_file      NVARCHAR(500) NULL,
    triggered_by     NVARCHAR(50)  NOT NULL,  -- 'folder-poll'|'api-upload'|'api-json'|'manual'
    status           NVARCHAR(20)  NOT NULL DEFAULT 'pending',
    records_found    INT           NOT NULL DEFAULT 0,
    records_inserted INT           NOT NULL DEFAULT 0,
    records_failed   INT           NOT NULL DEFAULT 0,
    error_detail     NVARCHAR(MAX) NULL,
    started_at       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    completed_at     DATETIME2     NULL
  );
  CREATE INDEX IX_IngestRunLog_Customer ON dbo.IngestRunLog(customer_id, started_at DESC);
  CREATE INDEX IX_IngestRunLog_Config   ON dbo.IngestRunLog(config_id) WHERE config_id IS NOT NULL;
END;

SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'IngestConfiguration') AS IngestConfigurationCreated,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'IngestRunLog')        AS IngestRunLogCreated;
