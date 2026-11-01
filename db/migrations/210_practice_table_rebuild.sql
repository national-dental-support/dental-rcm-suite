-- @data: reference
-- Migration 210: Rebuild Practice table with correct schema.
-- The original table (001_core_schema) used PracticeID/PracticeName/GroupName columns;
-- migration 071 tried to CREATE with id/group_id/name but was skipped (table existed).
-- Guard: skip if the new schema is already present (id + group_id columns exist).

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Practice') AND name = 'group_id'
)
BEGIN
  PRINT '210: Practice already has new schema (group_id found) - skipping.';
  RETURN;
END;

-- Drop old Practice table (no FKs reference it).
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Practice')
  DROP TABLE dbo.Practice;

CREATE TABLE dbo.Practice (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  group_id   INT NOT NULL REFERENCES dbo.PracticeGroup(id),
  name       NVARCHAR(200) NOT NULL,
  customer_id INT NULL,
  is_active  BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IX_Practice_group ON dbo.Practice (group_id);
CREATE INDEX IX_Practice_customer ON dbo.Practice (customer_id);

PRINT '210: Practice table rebuilt with new schema (id, group_id, name).';
