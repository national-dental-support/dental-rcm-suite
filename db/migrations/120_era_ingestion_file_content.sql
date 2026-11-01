-- @data: reference
-- Add file_content, payer_name, total_amount to RemittanceIngestionLog
IF COL_LENGTH('dbo.RemittanceIngestionLog', 'file_content') IS NULL
  ALTER TABLE dbo.RemittanceIngestionLog ADD file_content NVARCHAR(MAX);

IF COL_LENGTH('dbo.RemittanceIngestionLog', 'payer_name') IS NULL
  ALTER TABLE dbo.RemittanceIngestionLog ADD payer_name NVARCHAR(200);

IF COL_LENGTH('dbo.RemittanceIngestionLog', 'total_amount') IS NULL
  ALTER TABLE dbo.RemittanceIngestionLog ADD total_amount DECIMAL(12, 2);
