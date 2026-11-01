-- @data: reference
-- Manager approval gate for claim resubmissions.
-- Specialists submit a resubmission for review; managers approve or reject before it is transmitted.

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ClaimApproval') AND type = N'U')
BEGIN
  CREATE TABLE dbo.ClaimApproval (
    id                INT IDENTITY PRIMARY KEY,
    customer_id       INT NOT NULL,
    claim_id          NVARCHAR(50) NOT NULL,
    appeal_id         INT NULL,                          -- links to DenialAppeal when applicable
    submitted_by      NVARCHAR(255) NOT NULL,            -- specialist email
    submitted_at      DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    reviewer_id       INT NULL,                          -- Users.userID of manager who reviewed
    reviewer_email    NVARCHAR(255) NULL,
    reviewed_at       DATETIME2 NULL,
    status            NVARCHAR(20) NOT NULL DEFAULT 'pending_review',
                                                         -- pending_review | approved | rejected | recalled
    reviewer_notes    NVARCHAR(MAX) NULL,
    package_snapshot  NVARCHAR(MAX) NULL,                -- JSON of the resubmission package at submit time
    created_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at        DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ClaimApproval') AND name = N'IX_ClaimApproval_ClaimId')
  CREATE INDEX IX_ClaimApproval_ClaimId ON dbo.ClaimApproval (claim_id, customer_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ClaimApproval') AND name = N'IX_ClaimApproval_Status')
  CREATE INDEX IX_ClaimApproval_Status ON dbo.ClaimApproval (status, customer_id, submitted_at DESC);
