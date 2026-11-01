-- @data: reference
-- @tags: seed
-- 070_group_scoping.sql
-- HIPAA-compliant role scoping: Groups, Manager->Specialist assignments
--
-- Hierarchy: Customer -> PracticeGroup -> Location
-- Admin scoped to Group(s), Manager scoped to assigned Specialists + Locations

-- -- 1. PracticeGroup ------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='PracticeGroup')
CREATE TABLE dbo.PracticeGroup (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL,
  name NVARCHAR(200) NOT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

-- -- 2. GroupLocation (Group <-> Location mapping) ---------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='GroupLocation')
CREATE TABLE dbo.GroupLocation (
  id INT IDENTITY(1,1) PRIMARY KEY,
  group_id INT NOT NULL,
  location_name NVARCHAR(255) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_GroupLocation_Group FOREIGN KEY (group_id) REFERENCES dbo.PracticeGroup(id)
);
GO

-- -- 3. UserGroupAssignment (Admin/User <-> Group) ---------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='UserGroupAssignment')
CREATE TABLE dbo.UserGroupAssignment (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  group_id INT NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_UserGroup_Group FOREIGN KEY (group_id) REFERENCES dbo.PracticeGroup(id)
);
GO

-- -- 4. ManagerSpecialistAssignment -----------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='ManagerSpecialistAssignment')
CREATE TABLE dbo.ManagerSpecialistAssignment (
  id INT IDENTITY(1,1) PRIMARY KEY,
  manager_id INT NOT NULL,
  specialist_id INT NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_ManagerSpecialist UNIQUE (manager_id, specialist_id)
);
GO

-- -- 5. Add manager_id to Users --------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='manager_id')
  ALTER TABLE dbo.Users ADD manager_id INT NULL;
GO

-- -- 7. Verification -------------------------------------------------
SELECT 'PracticeGroup' AS tbl, COUNT(*) AS cnt FROM dbo.PracticeGroup;
SELECT 'GroupLocation' AS tbl, COUNT(*) AS cnt FROM dbo.GroupLocation;
SELECT 'UserGroupAssignment' AS tbl, COUNT(*) AS cnt FROM dbo.UserGroupAssignment;
SELECT 'ManagerSpecialistAssignment' AS tbl, COUNT(*) AS cnt FROM dbo.ManagerSpecialistAssignment;
SELECT 'Users with manager_id' AS tbl, COUNT(*) AS cnt FROM dbo.Users WHERE manager_id IS NOT NULL;
