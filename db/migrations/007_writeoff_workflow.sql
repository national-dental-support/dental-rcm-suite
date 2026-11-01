-- @data: reference
-- 007_writeoff_workflow.sql
-- AR Write-Off Approval Workflow: rules engine, approval queue, and audit log

-- -- Tier 1: Auto-adjustment rules ------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='WriteOffRule')
CREATE TABLE [dbo].[WriteOffRule] (
  [id]                INT IDENTITY(1,1) PRIMARY KEY,
  [rule_name]         NVARCHAR(100) NOT NULL,
  [priority]          INT NOT NULL DEFAULT 100,
  [conditions]        NVARCHAR(MAX) NOT NULL,       -- JSON: { minAgingDays, maxBalance, denialCodes, claimStatusFinal }
  [adj_type]          NVARCHAR(50) NOT NULL,         -- 'Bad Debt', 'Contractual', 'Courtesy', etc.
  [adj_note_template] NVARCHAR(500) NULL,            -- auto-populated adjustment note
  [requires_approval] BIT NOT NULL DEFAULT 0,        -- 0 = auto-post, 1 = generate request
  [approval_level]    NVARCHAR(50) NULL,             -- 'manager', 'director', 'vp'
  [is_active]         BIT NOT NULL DEFAULT 1,
  [created_by]        NVARCHAR(255) NULL,
  [created_at]        DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  [updated_at]        DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  [customer_id]       INT NULL
);
GO

-- -- Tier 2: Write-off approval queue ---------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='WriteOffRequest')
CREATE TABLE [dbo].[WriteOffRequest] (
  [id]              INT IDENTITY(1,1) PRIMARY KEY,
  [claim_id]        NVARCHAR(50) NOT NULL,           -- FK to claims.ClaimID
  [patient_id]      NVARCHAR(50) NULL,
  [patient_name]    NVARCHAR(100) NULL,
  [payer_name]      NVARCHAR(100) NULL,
  [balance]         DECIMAL(12,2) NOT NULL,
  [aging_days]      INT NOT NULL,
  [adj_type]        NVARCHAR(50) NOT NULL,
  [adj_note]        NVARCHAR(500) NULL,
  [rule_id]         INT NULL,                        -- FK to WriteOffRule (NULL = manual request)
  [rule_name]       NVARCHAR(100) NULL,
  [status]          NVARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, posted
  [requested_by]    NVARCHAR(255) NOT NULL,
  [requested_at]    DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  [reviewed_by]     NVARCHAR(255) NULL,
  [reviewed_at]     DATETIME2 NULL,
  [review_note]     NVARCHAR(500) NULL,
  [posted_at]       DATETIME2 NULL,
  [customer_id]     INT NULL
);
GO

-- -- Audit log for auto-posted adjustments ----------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='WriteOffAuditLog')
CREATE TABLE [dbo].[WriteOffAuditLog] (
  [id]              INT IDENTITY(1,1) PRIMARY KEY,
  [claim_id]        NVARCHAR(50) NOT NULL,
  [rule_id]         INT NOT NULL,
  [rule_name]       NVARCHAR(100) NULL,
  [adj_amt]         DECIMAL(12,2) NOT NULL,
  [adj_type]        NVARCHAR(50) NULL,
  [adj_note]        NVARCHAR(500) NULL,
  [posted_at]       DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  [customer_id]     INT NULL
);
GO
