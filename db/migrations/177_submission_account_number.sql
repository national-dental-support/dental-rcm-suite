-- @data: reference
IF OBJECT_ID('dbo.SubmissionRecord', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.SubmissionRecord') AND name = 'account_number'
  )
  ALTER TABLE dbo.SubmissionRecord ADD account_number NVARCHAR(50) NULL;
GO


IF OBJECT_ID('dbo.SubmissionRecord', 'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SubmissionRecord_account_number' AND object_id = OBJECT_ID('dbo.SubmissionRecord'))
  CREATE INDEX IX_SubmissionRecord_account_number ON dbo.SubmissionRecord (customer_id, account_number);
GO
