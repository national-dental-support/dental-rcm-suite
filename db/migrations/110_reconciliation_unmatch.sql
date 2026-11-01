-- @data: reference
-- B1: Add unmatch tracking columns to reconciliation table
ALTER TABLE dbo.reconciliation
  ADD UnmatchedBy     NVARCHAR(100) NULL,
      UnmatchedDate   DATE          NULL,
      UnmatchReason   NVARCHAR(500) NULL;
