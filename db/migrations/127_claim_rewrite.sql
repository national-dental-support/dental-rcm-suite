-- @data: reference
-- Inline narrative rewrite suggestions from the Ollama rewrite agent.
-- Each row is a suggested replacement for one section of a claim narrative.

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ClaimRewrite') AND type = N'U')
BEGIN
  CREATE TABLE dbo.ClaimRewrite (
    id               INT IDENTITY PRIMARY KEY,
    customer_id      INT NOT NULL,
    claim_id         NVARCHAR(50) NOT NULL,
    original_text    NVARCHAR(MAX) NULL,
    rewritten_text   NVARCHAR(MAX) NULL,
    diff_hunks       NVARCHAR(MAX) NULL,                  -- JSON: { original, replacement, reason }[]
    focus_areas      NVARCHAR(500) NULL,                  -- comma-separated areas improved
    confidence       DECIMAL(4,3) NULL,                   -- 0.000-1.000
    accepted         BIT NULL,                            -- NULL=pending, 1=accepted, 0=rejected
    accepted_by      NVARCHAR(255) NULL,
    model_version    NVARCHAR(100) NULL,
    created_at       DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ClaimRewrite') AND name = N'IX_ClaimRewrite_Claim')
  CREATE INDEX IX_ClaimRewrite_Claim ON dbo.ClaimRewrite (claim_id, customer_id, created_at DESC);
