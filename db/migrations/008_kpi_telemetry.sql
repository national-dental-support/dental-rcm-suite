-- @data: reference
-- 008_kpi_telemetry.sql
-- Adds structured telemetry for claim lifecycle events and adjustment type categories for KPI reporting.

-- -- Claim event telemetry (for lag metrics) ---------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='ClaimEvent')
CREATE TABLE [dbo].[ClaimEvent] (
  [id]              INT IDENTITY(1,1) PRIMARY KEY,
  [customer_id]     INT NULL,
  [claim_id]        NVARCHAR(50) NOT NULL,
  [event_type]      NVARCHAR(50) NOT NULL,          -- e.g. charge_entered, claim_submitted, claim_rejected, denial_work_started, denial_work_completed, payment_posted
  [event_time]      DATETIME2 NOT NULL,
  [actor_user]      NVARCHAR(255) NULL,
  [metadata]        NVARCHAR(MAX) NULL,             -- JSON blob for additional context (denial code, rejection reason, etc.)
  [created_at]      DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

-- -- Adjustment type classification (transactional vs contractual vs bad debt) ---------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='AdjustmentTypeCategory')
CREATE TABLE [dbo].[AdjustmentTypeCategory] (
  [id]            INT IDENTITY(1,1) PRIMARY KEY,
  [customer_id]   INT NULL,
  [adj_type]      NVARCHAR(128) NOT NULL,            -- matches Adjustment.AdjType values
  [category]      NVARCHAR(50) NOT NULL,             -- 'transactional','contractual','bad_debt','other'
  [description]   NVARCHAR(500) NULL,
  [created_at]    DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UX_AdjustmentTypeCategory UNIQUE (customer_id, adj_type)
);
GO
