-- @data: reference
-- 077_pms_connectors.sql
-- PMS (Practice Management System) connector infrastructure for
-- Open Dental and Dentrix integration via rcm-connectors service.

-- -- PmsConnection -----------------------------------------------------------
-- Extends DataSourceConnection with PMS-specific fields
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PmsConnection')
CREATE TABLE dbo.PmsConnection (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  connection_id     INT NOT NULL REFERENCES dbo.DataSourceConnection(id),
  customer_id       INT NOT NULL,
  pms_type          NVARCHAR(30)  NOT NULL,       -- 'open_dental', 'dentrix'
  api_url           NVARCHAR(500) NULL,            -- base URL for REST API
  api_key_encrypted NVARCHAR(500) NULL,            -- encrypted API key
  developer_key     NVARCHAR(500) NULL,            -- Open Dental developer key
  odbc_dsn          NVARCHAR(200) NULL,            -- Dentrix ODBC DSN
  sync_interval_min INT DEFAULT 60,                -- minutes between syncs
  last_sync_at      DATETIME2 NULL,
  next_sync_at      DATETIME2 NULL,
  connector_status  NVARCHAR(20)  DEFAULT 'pending',  -- 'pending','connected','syncing','error','paused'
  status_message    NVARCHAR(MAX) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  updated_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- -- PmsMappingTemplate ------------------------------------------------------
-- Pre-built field mappings for known PMS schemas
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PmsMappingTemplate')
CREATE TABLE dbo.PmsMappingTemplate (
  id                    INT IDENTITY(1,1) PRIMARY KEY,
  pms_type              NVARCHAR(30)  NOT NULL,       -- 'open_dental', 'dentrix'
  source_table          NVARCHAR(200) NOT NULL,
  source_column         NVARCHAR(200) NOT NULL,
  target_table          NVARCHAR(100) NOT NULL,
  target_column         NVARCHAR(100) NOT NULL,
  transform             NVARCHAR(MAX) NULL,            -- JSON: {type:'prefix',value:'OD-'}
  is_required           BIT DEFAULT 0,
  UNIQUE(pms_type, source_table, source_column)
);

-- -- Seed Open Dental Mappings -----------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.PmsMappingTemplate WHERE pms_type = 'open_dental')
BEGIN
  -- patients -> patient
  INSERT INTO dbo.PmsMappingTemplate (pms_type, source_table, source_column, target_table, target_column, transform, is_required) VALUES
  ('open_dental', 'patients', 'PatNum',    'patient', 'PatNum',    NULL, 1),
  ('open_dental', 'patients', 'LName',     'patient', 'LastName',  NULL, 1),
  ('open_dental', 'patients', 'FName',     'patient', 'FirstName', NULL, 1),
  ('open_dental', 'patients', 'Birthdate', 'patient', 'DOB',       '{"type":"date_parse","format":"YYYY-MM-DD"}', 1),
  ('open_dental', 'patients', 'Gender',    'patient', 'Gender',    NULL, 0),
  ('open_dental', 'patients', 'Address',   'patient', 'Address',   NULL, 0),
  ('open_dental', 'patients', 'City',      'patient', 'City',      NULL, 0),
  ('open_dental', 'patients', 'State',     'patient', 'State',     NULL, 0),
  ('open_dental', 'patients', 'Zip',       'patient', 'Zip',       NULL, 0),
  ('open_dental', 'patients', 'Email',     'patient', 'Email',     NULL, 0);

  -- claims -> claims
  INSERT INTO dbo.PmsMappingTemplate (pms_type, source_table, source_column, target_table, target_column, transform, is_required) VALUES
  ('open_dental', 'claims', 'ClaimNum',       'claims', 'ClaimID',            '{"type":"prefix","value":"OD-"}', 1),
  ('open_dental', 'claims', 'PatNum',         'claims', 'PatientID',          NULL, 1),
  ('open_dental', 'claims', 'DateService',    'claims', 'DateOfService',      NULL, 1),
  ('open_dental', 'claims', 'ClaimFee',       'claims', 'ChargeAmt',          NULL, 1),
  ('open_dental', 'claims', 'DateSent',       'claims', 'ClaimSubmittedDate', NULL, 0),
  ('open_dental', 'claims', 'InsPayEst',      'claims', 'InsPayEst',          NULL, 0),
  ('open_dental', 'claims', 'InsPayAmt',      'claims', 'InsPayAmt',          NULL, 0),
  ('open_dental', 'claims', 'DedApplied',     'claims', 'DedApplied',         NULL, 0),
  ('open_dental', 'claims', 'WriteOff',       'claims', 'WriteOff',           NULL, 0),
  ('open_dental', 'claims', 'ProvTreat',      'claims', 'ProvTreat',          NULL, 0),
  ('open_dental', 'claims', 'ProvBill',       'claims', 'ProvBill',           NULL, 0),
  ('open_dental', 'claims', 'ClaimStatus',    'claims', 'ClaimStatus',        NULL, 0),
  ('open_dental', 'claims', 'PreAuthString',  'claims', 'PreAuthString',      NULL, 0),
  ('open_dental', 'claims', 'ClaimNote',      'claims', 'ClaimNote',          NULL, 0);

  -- carriers -> payer
  INSERT INTO dbo.PmsMappingTemplate (pms_type, source_table, source_column, target_table, target_column, transform, is_required) VALUES
  ('open_dental', 'carriers', 'CarrierNum',  'payer', 'PayerID',   NULL, 1),
  ('open_dental', 'carriers', 'CarrierName', 'payer', 'PayerName', NULL, 1);

  -- providers -> provider
  INSERT INTO dbo.PmsMappingTemplate (pms_type, source_table, source_column, target_table, target_column, transform, is_required) VALUES
  ('open_dental', 'providers', 'ProvNum',         'provider', 'ProviderID',   NULL, 1),
  ('open_dental', 'providers', 'NationalProvID',  'provider', 'NPI',          NULL, 0);

  -- appointments -> Appointment
  INSERT INTO dbo.PmsMappingTemplate (pms_type, source_table, source_column, target_table, target_column, transform, is_required) VALUES
  ('open_dental', 'appointments', 'AptNum',      'Appointment', 'AptNum',      NULL, 1),
  ('open_dental', 'appointments', 'PatNum',      'Appointment', 'PatNum',      NULL, 1),
  ('open_dental', 'appointments', 'ProvNum',     'Appointment', 'ProvNum',     NULL, 0),
  ('open_dental', 'appointments', 'AptDateTime', 'Appointment', 'AptDateTime', NULL, 1),
  ('open_dental', 'appointments', 'AptStatus',   'Appointment', 'AptStatus',   NULL, 0),
  ('open_dental', 'appointments', 'Note',        'Appointment', 'Note',        NULL, 0);

  -- insplans -> InsPlan
  INSERT INTO dbo.PmsMappingTemplate (pms_type, source_table, source_column, target_table, target_column, transform, is_required) VALUES
  ('open_dental', 'insplans', 'PlanNum',      'InsPlan', 'PlanNum',      NULL, 1),
  ('open_dental', 'insplans', 'CarrierNum',   'InsPlan', 'CarrierNum',   NULL, 0),
  ('open_dental', 'insplans', 'GroupName',    'InsPlan', 'GroupName',    NULL, 0),
  ('open_dental', 'insplans', 'GroupNum',     'InsPlan', 'GroupNum',     NULL, 0),
  ('open_dental', 'insplans', 'SubscriberID', 'InsPlan', 'SubscriberID', NULL, 0);
END;

-- -- Seed Dentrix Mappings ---------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.PmsMappingTemplate WHERE pms_type = 'dentrix')
BEGIN
  INSERT INTO dbo.PmsMappingTemplate (pms_type, source_table, source_column, target_table, target_column, transform, is_required) VALUES
  ('dentrix', 'PATIENT',     'PATIENT_ID',   'patient',     'PatNum',        NULL, 1),
  ('dentrix', 'PATIENT',     'LAST_NAME',    'patient',     'LastName',      NULL, 1),
  ('dentrix', 'PATIENT',     'FIRST_NAME',   'patient',     'FirstName',     NULL, 1),
  ('dentrix', 'PATIENT',     'BIRTH_DATE',   'patient',     'DOB',           NULL, 1),
  ('dentrix', 'TRAN_LOG',    'TRAN_NUM',     'claims',      'ClaimID',       '{"type":"prefix","value":"DX-"}', 1),
  ('dentrix', 'TRAN_LOG',    'PATIENT_ID',   'claims',      'PatientID',     NULL, 1),
  ('dentrix', 'TRAN_LOG',    'DATE_ENTRY',   'claims',      'DateOfService', NULL, 1),
  ('dentrix', 'TRAN_LOG',    'AMOUNT',       'claims',      'ChargeAmt',     NULL, 1),
  ('dentrix', 'INSURANCE',   'INSURANCE_ID', 'payer',       'PayerID',       NULL, 1),
  ('dentrix', 'INSURANCE',   'COMPANY_NAME', 'payer',       'PayerName',     NULL, 1),
  ('dentrix', 'PROVIDER',    'PROVIDER_ID',  'provider',    'ProviderID',    NULL, 1),
  ('dentrix', 'PROVIDER',    'NPI',          'provider',    'NPI',           NULL, 0),
  ('dentrix', 'APPOINTMENT', 'APPT_ID',      'Appointment', 'AptNum',        NULL, 1),
  ('dentrix', 'APPOINTMENT', 'PATIENT_ID',   'Appointment', 'PatNum',        NULL, 1),
  ('dentrix', 'APPOINTMENT', 'APPT_DATE',    'Appointment', 'AptDateTime',   NULL, 1);
END;

PRINT 'Migration 077: PMS connector tables and template mappings created.';
