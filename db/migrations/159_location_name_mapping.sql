-- @data: reference
-- @tags: core
-- =============================================================================
-- 159_location_name_mapping.sql
-- 1. Creates dbo.LocationNameMapping - bridges org hierarchy names to the raw
--    string keys stored in recon_report.Operations (practice) and
--    recon_report.Location (location).
-- 2. Adds Stillwater Office under Lakeside Dental Studio (missing from mig 078).
-- 3. Adds 6 missing OrgPractice + OrgLocation rows for remaining demo cities.
-- 4. Seeds all 10-city practice + location mappings for customer_id = 1.
-- Idempotent.
-- =============================================================================

SET NOCOUNT ON;

-- -- 1. Create LocationNameMapping table --------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LocationNameMapping')
BEGIN
  CREATE TABLE dbo.LocationNameMapping (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    customer_id  INT           NOT NULL,
    entity_type  NVARCHAR(20)  NOT NULL,   -- 'practice' | 'location'
    org_id       INT           NOT NULL,   -- OrgPractice.id OR OrgLocation.id
    recon_key    NVARCHAR(255) NOT NULL,   -- value as it appears in recon_report
    is_active    BIT           NOT NULL DEFAULT 1,
    created_at   DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    updated_at   DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_LocMapping UNIQUE (customer_id, entity_type, recon_key)
  );
  PRINT '159: LocationNameMapping table created.';
END
ELSE
  PRINT '159: LocationNameMapping table already exists - skipped.';

GO

-- Verify
SET NOCOUNT ON;
SELECT entity_type, COUNT(*) AS cnt
FROM dbo.LocationNameMapping
WHERE customer_id = 1
GROUP BY entity_type;

SELECT op.name AS practice, lnm.recon_key
FROM dbo.OrgPractice op
LEFT JOIN dbo.LocationNameMapping lnm ON lnm.org_id = op.id AND lnm.entity_type = 'practice'
JOIN dbo.PracticeGroup pg ON pg.id = op.group_id AND pg.customer_id = 1
ORDER BY op.name;
