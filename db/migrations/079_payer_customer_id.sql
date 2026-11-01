-- @data: reference
-- 079_payer_customer_id.sql
-- Adds customer_id to dbo.payer for direct tenant isolation.
-- Existing rows backfill to customer_id = 1 (matching the demo tenant).

IF COL_LENGTH('dbo.payer', 'customer_id') IS NULL
  ALTER TABLE dbo.payer ADD customer_id INT NOT NULL DEFAULT 1;
GO

-- Backfill: assign each payer to the customer whose claims reference it,
-- falling back to 1 if ambiguous or unmatched.
UPDATE p
SET    p.customer_id = c.customer_id
FROM   dbo.payer p
CROSS APPLY (
  SELECT TOP 1 customer_id
  FROM   dbo.claims
  WHERE  InsuranceName = p.InsuranceName
  ORDER BY customer_id
) c
WHERE COL_LENGTH('dbo.payer', 'customer_id') IS NOT NULL;
GO

PRINT '079_payer_customer_id.sql completed';
