-- @data: reference
-- =============================================================================
-- Migration 201: Alternate-path contracts for routing arbitrage demo
-- =============================================================================
-- Problem: each payer had exactly one contract (one rate), so arbitrage spread
-- was always 0. This migration adds a LeaseNetworkID FK to contractPayerContracts
-- (linking each contract to a specific routing path) and creates additional
-- contracts per major payer at different rates to produce realistic spread data.
--
-- After this migration:
--   Aetna Dental:      Availity 88%  vs  Direct EDI 115%  vs  Change HC 90%
--   Cigna Dental:      Availity 95%  vs  Direct EDI 115%  vs  Change HC 90%
--   Delta Dental PPO:  Availity 88%  vs  Direct EDI 115%
--   Delta Dental Prem: Availity 95%  vs  Direct EDI 115%
--   UnitedHealthcare:  Availity 100% vs  Direct EDI 115%
--   Anthem BCBS:       Availity 100% vs  Direct EDI 115%
--   Humana Dental:     Availity 88%  vs  Direct EDI 115%
--   MetLife Dental:    Availity 100% vs  Change HC  90%
--   Guardian Dental:   Availity 95%  vs  Change HC  90%
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

-- -- 1. Add LeaseNetworkID to contractPayerContracts ---------------------------
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'contractPayerContracts' AND COLUMN_NAME = 'LeaseNetworkID'
)
  ALTER TABLE dbo.contractPayerContracts ADD LeaseNetworkID TINYINT NULL;
GO
-- -- 6. Verification ------------------------------------------------------------
SELECT 'contractPayerContracts total'           AS TableName, COUNT(*)        AS Rows FROM dbo.contractPayerContracts
UNION ALL
SELECT 'alternate-path contracts (ID >= 16)',  COUNT(*) FROM dbo.contractPayerContracts WHERE PayerContractID >= 16
UNION ALL
SELECT 'contracts with LeaseNetworkID set',    COUNT(*) FROM dbo.contractPayerContracts WHERE LeaseNetworkID IS NOT NULL
UNION ALL
SELECT 'contractFeeSchedule total',            COUNT(*) FROM dbo.contractFeeSchedule
UNION ALL
SELECT 'new fee schedule rows (ID >= 226)',     COUNT(*) FROM dbo.contractFeeSchedule WHERE FeeScheduleID >= 226;
