-- @data: reference
-- @tags: seed
-- 071_org_hierarchy.sql
-- Enterprise -> Group -> Practice -> Location hierarchy
-- Product activation per node with inheritance

-- -- 1. Practice table -----------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='Practice')
CREATE TABLE dbo.Practice (
  id INT IDENTITY(1,1) PRIMARY KEY,
  group_id INT NOT NULL,
  name NVARCHAR(200) NOT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_Practice_Group FOREIGN KEY (group_id) REFERENCES dbo.PracticeGroup(id)
);
GO

-- -- 2. OrgLocation table --------------------------------------------
-- FK omitted: Practice table schema varies across environments (legacy uses PracticeID, new uses id)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='OrgLocation')
CREATE TABLE dbo.OrgLocation (
  id INT IDENTITY(1,1) PRIMARY KEY,
  practice_id INT NOT NULL,
  name NVARCHAR(255) NOT NULL,
  address NVARCHAR(255) NULL,
  city NVARCHAR(100) NULL,
  state NVARCHAR(50) NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

-- -- 3. OrgNodeProduct table (product activation per node) -----------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='OrgNodeProduct')
CREATE TABLE dbo.OrgNodeProduct (
  id INT IDENTITY(1,1) PRIMARY KEY,
  node_type NVARCHAR(20) NOT NULL,  -- 'group', 'practice', 'location'
  node_id INT NOT NULL,
  product_id INT NOT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  activated_by NVARCHAR(255) NULL,
  activated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_OrgNodeProduct UNIQUE (node_type, node_id, product_id)
);
GO

-- -- 4. Add product_slug to PracticeGroup for product overrides ------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='PracticeGroup' AND COLUMN_NAME='product_slug')
  ALTER TABLE dbo.PracticeGroup ADD product_slug NVARCHAR(50) NULL;
GO

-- -- 6. Verification -------------------------------------------------
SELECT 'Practice' AS tbl, COUNT(*) AS cnt FROM dbo.Practice;
SELECT 'OrgLocation' AS tbl, COUNT(*) AS cnt FROM dbo.OrgLocation;
SELECT 'OrgNodeProduct' AS tbl, COUNT(*) AS cnt FROM dbo.OrgNodeProduct;
