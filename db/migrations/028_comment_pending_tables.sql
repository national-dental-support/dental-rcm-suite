-- @data: reference
-- @tags: core
-- ============================================================
-- 028_comment_pending_tables.sql
--
-- 1. ClaimComment   - threaded claim team discussion
-- 2. ClaimPendingConfig - admin-configurable pending hold days
-- 3. pending_until  - DATE column on claimhistory for pending queue
-- ============================================================
SET NOCOUNT ON;

-- -- 1. ClaimComment ---------------------------------------------------------
IF OBJECT_ID('dbo.ClaimComment', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ClaimComment (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    claim_id   NVARCHAR(50)  NOT NULL,
    parent_id  INT           NULL REFERENCES dbo.ClaimComment(id),
    author_id  INT           NOT NULL,
    body       NVARCHAR(MAX) NOT NULL,
    mentions   NVARCHAR(500) NULL,
    is_edited  BIT           NOT NULL DEFAULT 0,
    created_at DATETIME2     NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2     NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_ClaimComment_ClaimId ON dbo.ClaimComment(claim_id, created_at);
END;

-- -- 2. ClaimPendingConfig ----------------------------------------------------
IF OBJECT_ID('dbo.ClaimPendingConfig', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ClaimPendingConfig (
    id           INT        IDENTITY(1,1) PRIMARY KEY,
    customer_id  SMALLINT   NOT NULL,
    pending_days INT        NOT NULL DEFAULT 14,
    updated_by   NVARCHAR(255) NULL,
    updated_at   DATETIME2  NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_ClaimPendingConfig_Customer UNIQUE (customer_id)
  );
  -- Seed default 14-day hold for every customer in the system
  INSERT INTO dbo.ClaimPendingConfig (customer_id, pending_days)
  SELECT DISTINCT customer_id, 14
  FROM dbo.claims
  WHERE customer_id IS NOT NULL;
END;

-- -- 3. pending_until on claimhistory ----------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.claimhistory') AND name = 'pending_until'
)
BEGIN
  ALTER TABLE dbo.claimhistory ADD pending_until DATE NULL;
END;

-- Verification
SELECT
  'ClaimComment'          AS tbl, COUNT(*) AS rows FROM dbo.ClaimComment
UNION ALL SELECT
  'ClaimPendingConfig',   COUNT(*) FROM dbo.ClaimPendingConfig
UNION ALL SELECT
  'claimhistory.pending_until exists', COUNT(*)
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.claimhistory') AND name = 'pending_until';
