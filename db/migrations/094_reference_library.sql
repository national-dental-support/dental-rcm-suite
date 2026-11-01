-- @data: reference
-- @tags: core,reference-library
-- =============================================================================
-- Reference Library: a glossary of words/terms and their definitions,
-- managed under Admin -> Remediation Steps -> Reference Library tab.
-- Per-tenant scoping (customer_id NULL = global/shared).
-- Idempotent.
-- =============================================================================

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ReferenceLibrary'
)
BEGIN
  CREATE TABLE dbo.ReferenceLibrary (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    term          NVARCHAR(200)  NOT NULL,
    definition    NVARCHAR(MAX)  NOT NULL,
    category      NVARCHAR(100)  NULL,
    customer_id   INT            NULL,  -- NULL = global/shared
    created_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    created_by    NVARCHAR(255)  NULL,
    updated_by    NVARCHAR(255)  NULL
  );

  CREATE INDEX IX_ReferenceLibrary_term     ON dbo.ReferenceLibrary(term);
  CREATE INDEX IX_ReferenceLibrary_category ON dbo.ReferenceLibrary(category);
  CREATE INDEX IX_ReferenceLibrary_customer ON dbo.ReferenceLibrary(customer_id);

  PRINT 'Migration 094: created ReferenceLibrary table.';
END
ELSE
BEGIN
  PRINT 'Migration 094: ReferenceLibrary already exists - no-op.';
END
GO
