-- @data: reference
-- @tags: seed
-- 078_org_practice_hierarchy.sql
-- Creates OrgPractice + OrgLocation under the correct names to avoid
-- collision with the legacy dbo.practice (PracticeID/PracticeName schema).
-- Migration 071 failed because its FK on OrgLocation referenced dbo.Practice(id)
-- but SQL Server resolved that to the legacy table which has PracticeID not id.

-- -- 1. OrgPractice ---------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='OrgPractice')
CREATE TABLE dbo.OrgPractice (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  group_id    INT NOT NULL,
  name        NVARCHAR(200) NOT NULL,
  is_active   BIT NOT NULL DEFAULT 1,
  created_at  DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  updated_at  DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_OrgPractice_Group FOREIGN KEY (group_id) REFERENCES dbo.PracticeGroup(id)
);
GO

-- -- 2. OrgLocation ---------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='OrgLocation')
CREATE TABLE dbo.OrgLocation (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  practice_id INT NOT NULL,
  name        NVARCHAR(255) NOT NULL,
  address     NVARCHAR(255) NULL,
  city        NVARCHAR(100) NULL,
  state       NVARCHAR(50)  NULL,
  is_active   BIT NOT NULL DEFAULT 1,
  created_at  DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  updated_at  DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_OrgLocation_OrgPractice FOREIGN KEY (practice_id) REFERENCES dbo.OrgPractice(id)
);
GO

-- -- 3. UserLocationAssignment (user -> OrgLocation scoping) ----------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='UserLocationAssignment')
CREATE TABLE dbo.UserLocationAssignment (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  user_id     INT NOT NULL,
  location_id INT NOT NULL,
  created_at  DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_UserLocation UNIQUE (user_id, location_id),
  CONSTRAINT FK_ULA_Location FOREIGN KEY (location_id) REFERENCES dbo.OrgLocation(id)
);
GO

PRINT '078_org_practice_hierarchy.sql completed';
