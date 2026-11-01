-- @data: reference
-- Migration 070: LocationCatalog, ProviderCatalog, PayerCatalog, DataAliasMapping
-- Admin-curated lists for InsightFlow filters and user provisioning.

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LocationCatalog')
BEGIN
  CREATE TABLE LocationCatalog (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    name       NVARCHAR(255) NOT NULL,
    status     NVARCHAR(20)  NOT NULL DEFAULT 'pending',
    source     NVARCHAR(50)  NOT NULL DEFAULT 'recon_report',
    created_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_LocationCatalog_name UNIQUE (name)
  );
  CREATE INDEX IX_LC_status ON LocationCatalog (status);
END

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProviderCatalog')
BEGIN
  CREATE TABLE ProviderCatalog (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    name       NVARCHAR(255) NOT NULL,
    status     NVARCHAR(20)  NOT NULL DEFAULT 'pending',
    source     NVARCHAR(50)  NOT NULL DEFAULT 'recon_report',
    created_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_ProviderCatalog_name UNIQUE (name)
  );
  CREATE INDEX IX_PC_status ON ProviderCatalog (status);
END

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PayerCatalog')
BEGIN
  CREATE TABLE PayerCatalog (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    name       NVARCHAR(255) NOT NULL,
    status     NVARCHAR(20)  NOT NULL DEFAULT 'pending',
    source     NVARCHAR(50)  NOT NULL DEFAULT 'recon_report',
    created_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_PayerCatalog_name UNIQUE (name)
  );
  CREATE INDEX IX_PAC_status ON PayerCatalog (status);
END

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DataAliasMapping')
BEGIN
  CREATE TABLE DataAliasMapping (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    entity_type    NVARCHAR(20)  NOT NULL,
    dirty_name     NVARCHAR(255) NOT NULL,
    canonical_name NVARCHAR(255) NOT NULL,
    created_by     NVARCHAR(255) NULL,
    created_at     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_DataAlias_type_dirty UNIQUE (entity_type, dirty_name)
  );
  CREATE INDEX IX_DataAlias_lookup    ON DataAliasMapping(entity_type, dirty_name);
  CREATE INDEX IX_DataAlias_canonical ON DataAliasMapping(entity_type, canonical_name);
END
