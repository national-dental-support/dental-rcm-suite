-- @data: reference
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.RemittanceIngestionLog') AND type = N'U')
BEGIN
  CREATE TABLE dbo.RemittanceIngestionLog (
    id                 INT IDENTITY PRIMARY KEY,
    customer_id        INT NOT NULL,
    file_name          NVARCHAR(500),
    file_size_bytes    INT,
    file_type          NVARCHAR(10),
    status             NVARCHAR(20) DEFAULT 'processing',
    remittance_file_id NVARCHAR(50),
    claims_found       INT,
    claims_matched     INT,
    error_message      NVARCHAR(1000),
    uploaded_by        NVARCHAR(100),
    uploaded_at        DATETIME DEFAULT GETDATE(),
    completed_at       DATETIME
  );
END
