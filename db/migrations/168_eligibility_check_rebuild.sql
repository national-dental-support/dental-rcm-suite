-- @data: reference
-- Rebuild EligibilityCheck with correct schema.
-- The table pre-existed with a different schema (patient_id, ins_plan_id, etc.) from an
-- earlier migration, causing migration 167 to fail on INSERT with unknown column names.
-- Guard: skip if the table already has the new schema (patient_name column present).

IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'EligibilityCheck' AND COLUMN_NAME = 'patient_name'
)
BEGIN
  PRINT '168: EligibilityCheck already has new schema - skipping.';
  RETURN;
END;

-- Step 1: Drop ALL FKs from any table referencing EligibilityCheck or EligibilityAuthLimits.
-- Both must be cleared so we can truncate/drop without constraint violations.
DECLARE @sql NVARCHAR(MAX) = '';

SELECT @sql += 'ALTER TABLE dbo.[' + tp.name + '] DROP CONSTRAINT [' + fk.name + ']; '
FROM sys.foreign_keys fk
JOIN sys.tables tp ON fk.parent_object_id = tp.object_id
JOIN sys.tables tr ON fk.referenced_object_id = tr.object_id
WHERE tr.name IN ('EligibilityCheck', 'EligibilityAuthLimits');

IF LEN(@sql) > 0
  EXEC sp_executesql @sql;

-- Step 2: Clear child tables (order matters - most-dependent first).
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityAlert')
  DELETE FROM dbo.EligibilityAlert;

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityAuthLimits')
  TRUNCATE TABLE dbo.EligibilityAuthLimits;

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityBenefits')
  TRUNCATE TABLE dbo.EligibilityBenefits;

-- Step 3: Drop and recreate EligibilityCheck with the correct schema.
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityCheck')
  DROP TABLE dbo.EligibilityCheck;

CREATE TABLE dbo.EligibilityCheck (
  id               INT           IDENTITY(1,1) PRIMARY KEY,
  customer_id      INT           NOT NULL,
  batch_id         INT           NULL REFERENCES dbo.EligibilityBatch(id),
  patient_name     NVARCHAR(200) NULL,
  patient_dob      DATE          NULL,
  subscriber_id    NVARCHAR(100) NULL,
  payer_name       NVARCHAR(200) NULL,
  payer_id         NVARCHAR(50)  NULL,
  location_name    NVARCHAR(200) NULL,
  provider_name    NVARCHAR(200) NULL,
  appointment_date DATE          NULL,
  check_status     NVARCHAR(20)  NOT NULL DEFAULT 'pending',
  checked_at       DATETIME2     NULL,
  error_detail     NVARCHAR(500) NULL
);

CREATE INDEX IX_EligibilityCheck_customer_appt ON dbo.EligibilityCheck (customer_id, appointment_date);
CREATE INDEX IX_EligibilityCheck_batch         ON dbo.EligibilityCheck (batch_id);

-- Step 4: Restore FKs on the dependent tables.
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityBenefits')
  ALTER TABLE dbo.EligibilityBenefits
    ADD CONSTRAINT FK_EligibilityBenefits_check FOREIGN KEY (check_id) REFERENCES dbo.EligibilityCheck(id);

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityAuthLimits')
  ALTER TABLE dbo.EligibilityAuthLimits
    ADD CONSTRAINT FK_EligibilityAuthLimits_check FOREIGN KEY (check_id) REFERENCES dbo.EligibilityCheck(id);

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EligibilityAlert')
BEGIN
  ALTER TABLE dbo.EligibilityAlert
    ADD CONSTRAINT FK_EligibilityAlert_check     FOREIGN KEY (check_id)     REFERENCES dbo.EligibilityCheck(id);
  ALTER TABLE dbo.EligibilityAlert
    ADD CONSTRAINT FK_EligibilityAlert_authlimit FOREIGN KEY (auth_limit_id) REFERENCES dbo.EligibilityAuthLimits(id);
END;

PRINT '168: EligibilityCheck rebuilt with correct schema.';
