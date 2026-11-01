-- @data: reference
-- Widen PostedBy column in claimPostHistory to fit email addresses
IF COL_LENGTH('dbo.claimPostHistory', 'PostedBy') < 200
  ALTER TABLE dbo.claimPostHistory ALTER COLUMN PostedBy NVARCHAR(200);
