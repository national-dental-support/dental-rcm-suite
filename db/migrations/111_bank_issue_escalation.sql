-- @data: reference
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.BankIssueEscalation') AND type = N'U')
BEGIN
  CREATE TABLE dbo.BankIssueEscalation (
    id                INT IDENTITY PRIMARY KEY,
    customer_id       INT NOT NULL,
    bank_deposit_id   NVARCHAR(50),
    issue_type        NVARCHAR(50) NOT NULL,
    description       NVARCHAR(2000),
    status            NVARCHAR(20) DEFAULT 'open',
    priority          NVARCHAR(10) DEFAULT 'medium',
    assigned_to       NVARCHAR(100),
    resolution_notes  NVARCHAR(1000),
    resolved_by       NVARCHAR(100),
    resolved_at       DATETIME,
    created_by        NVARCHAR(100),
    created_at        DATETIME DEFAULT GETDATE(),
    updated_at        DATETIME DEFAULT GETDATE()
  );
END
