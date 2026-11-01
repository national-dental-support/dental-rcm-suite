-- @data: reference
-- Resubmission package builder tables.
-- A package bundles: corrected claim data, appeal letter, attachments, and checklist state.

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ResubmissionPackage') AND type = N'U')
BEGIN
  CREATE TABLE dbo.ResubmissionPackage (
    id                  INT IDENTITY PRIMARY KEY,
    customer_id         INT NOT NULL,
    claim_id            NVARCHAR(50) NOT NULL,
    appeal_id           INT NULL,
    status              NVARCHAR(30) NOT NULL DEFAULT 'draft',
                                                          -- draft | ready | submitted | approved | rejected
    checklist           NVARCHAR(MAX) NULL,               -- JSON: { item, checked }[]
    corrected_claim     NVARCHAR(MAX) NULL,               -- JSON snapshot of corrected claim fields
    notes               NVARCHAR(MAX) NULL,
    created_by          NVARCHAR(255) NULL,
    submitted_at        DATETIME2 NULL,
    created_at          DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at          DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ResubmissionPackage') AND name = N'IX_ResubPkg_Claim')
  CREATE INDEX IX_ResubPkg_Claim ON dbo.ResubmissionPackage (claim_id, customer_id);

-- Supporting document attachments for a resubmission package.
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ClaimAttachment') AND type = N'U')
BEGIN
  CREATE TABLE dbo.ClaimAttachment (
    id             INT IDENTITY PRIMARY KEY,
    customer_id    INT NOT NULL,
    claim_id       NVARCHAR(50) NOT NULL,
    package_id     INT NULL,                              -- FK -> ResubmissionPackage.id
    file_name      NVARCHAR(500) NOT NULL,
    file_type      NVARCHAR(100) NULL,
    file_size_kb   INT NULL,
    storage_key    NVARCHAR(1000) NULL,                   -- blob/file path
    description    NVARCHAR(500) NULL,
    uploaded_by    NVARCHAR(255) NULL,
    uploaded_at    DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ClaimAttachment') AND name = N'IX_ClaimAttachment_Claim')
  CREATE INDEX IX_ClaimAttachment_Claim ON dbo.ClaimAttachment (claim_id, customer_id);
