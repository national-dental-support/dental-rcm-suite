-- @data: reference
-- ============================================================
-- 022_denial_appeal_table.sql
--
-- Creates DenialAppeal table for the Denial IQ appeal generator.
-- (ClaimAppeal is already taken by the clinical dental table.)
-- ============================================================

IF OBJECT_ID('dbo.DenialAppeal', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DenialAppeal (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    claim_id         NVARCHAR(50)  NOT NULL,
    template_id      INT           NULL REFERENCES dbo.AppealLetterTemplate(id),
    denial_reason    NVARCHAR(50)  NULL,
    appeal_level     TINYINT       DEFAULT 1,
    submitted_date   DATE          NULL,
    due_date         DATE          NULL,
    status           NVARCHAR(50)  DEFAULT 'draft',
    generated_letter NVARCHAR(MAX) NULL,
    author_user_id   NVARCHAR(255) NULL,
    notes            NVARCHAR(MAX) NULL,
    created_at       DATETIME2     DEFAULT GETDATE(),
    updated_at       DATETIME2     DEFAULT GETDATE(),
    INDEX IX_DenialAppeal_ClaimId (claim_id)
  );
END;

SELECT 'DenialAppeal' AS tbl, COUNT(*) AS cnt FROM dbo.DenialAppeal;
