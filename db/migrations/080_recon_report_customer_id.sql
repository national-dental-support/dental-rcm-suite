-- @data: reference
-- 080_recon_report_customer_id.sql
-- Adds customer_id to dbo.recon_report for direct tenant isolation.
-- Backfills from dbo.claims via ClaimID match, falling back to 1.

IF COL_LENGTH('dbo.recon_report', 'customer_id') IS NULL
  ALTER TABLE dbo.recon_report ADD customer_id INT NOT NULL DEFAULT 1;
GO

-- Backfill: set customer_id from the matching claims row
UPDATE rr
SET    rr.customer_id = c.customer_id
FROM   dbo.recon_report rr
JOIN   dbo.claims c ON c.ClaimID = rr.ClaimID
WHERE  rr.customer_id = 1;
GO

PRINT '080_recon_report_customer_id.sql completed';
