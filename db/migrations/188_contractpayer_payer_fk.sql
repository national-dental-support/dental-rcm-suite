-- @data: reference
-- =============================================================================
-- Migration 188: FK from contractPayer -> payer + mark duplicate columns
-- =============================================================================

-- Add FK constraint (WITH NOCHECK so existing mismatched rows do not block migration)
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_contractPayer_payer' AND parent_object_id = OBJECT_ID('dbo.contractPayer')
)
BEGIN
  ALTER TABLE [dbo].[contractPayer]
    WITH NOCHECK
    ADD CONSTRAINT [FK_contractPayer_payer]
    FOREIGN KEY ([PayerID]) REFERENCES [dbo].[payer] ([PayerID]);
END
GO

-- contractPayer.PayerName duplicates payer.InsuranceName / payer.CarrierName.
-- Marked for removal once all queries that read contractPayer.PayerName are
-- updated to JOIN payer and use payer.InsuranceName instead.
-- See: apps/api/src/controllers/ - grep for contractPayer and PayerName.
-- DO NOT DROP until the JOIN migration is complete.
-- FUTURE: DROP COLUMN [PayerName] from contractPayer after controllers updated.
GO
