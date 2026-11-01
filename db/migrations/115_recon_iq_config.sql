-- @data: reference
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ReconIqConfig') AND type = N'U')
BEGIN
  CREATE TABLE dbo.ReconIqConfig (
    id                           INT IDENTITY PRIMARY KEY,
    customer_id                  INT NOT NULL UNIQUE,
    auto_match_enabled           BIT DEFAULT 0,
    auto_match_threshold         DECIMAL(5,2) DEFAULT 85.0,
    auto_post_enabled            BIT DEFAULT 0,
    statement_min_balance        DECIMAL(10,2) DEFAULT 5.00,
    statement_default_aging_days INT DEFAULT 90,
    created_at                   DATETIME DEFAULT GETDATE(),
    updated_at                   DATETIME DEFAULT GETDATE()
  );
END
