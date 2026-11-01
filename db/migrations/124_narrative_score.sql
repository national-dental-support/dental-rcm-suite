-- @data: reference
-- NLP narrative completeness scores produced by the Ollama narrative scorer agent.

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.NarrativeScore') AND type = N'U')
BEGIN
  CREATE TABLE dbo.NarrativeScore (
    id               INT IDENTITY PRIMARY KEY,
    customer_id      INT NOT NULL,
    claim_id         NVARCHAR(50) NOT NULL,
    score            INT NOT NULL,                        -- 0-100
    missing_elements NVARCHAR(MAX) NULL,                  -- JSON array of strings
    recommendations  NVARCHAR(MAX) NULL,                  -- JSON array of strings
    model_version    NVARCHAR(100) NULL,
    scored_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.NarrativeScore') AND name = N'IX_NarrativeScore_Claim')
  CREATE INDEX IX_NarrativeScore_Claim ON dbo.NarrativeScore (claim_id, customer_id, scored_at DESC);
