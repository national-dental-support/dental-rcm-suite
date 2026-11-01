-- @data: reference
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.MatchSuggestion') AND type = N'U')
BEGIN
  CREATE TABLE dbo.MatchSuggestion (
    id                 INT IDENTITY PRIMARY KEY,
    customer_id        INT NOT NULL,
    bank_deposit_id    NVARCHAR(50) NOT NULL,
    remittance_file_id NVARCHAR(50) NOT NULL,
    confidence_score   DECIMAL(5,2),
    match_reasons      NVARCHAR(500),
    status             NVARCHAR(20) DEFAULT 'pending',
    reviewed_by        NVARCHAR(100),
    reviewed_at        DATETIME,
    generated_at       DATETIME DEFAULT GETDATE()
  );
END
