-- @data: reference
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ReconAlertConfig') AND type = N'U')
BEGIN
  CREATE TABLE dbo.ReconAlertConfig (
    id             INT IDENTITY PRIMARY KEY,
    customer_id    INT NOT NULL,
    alert_type     NVARCHAR(50) NOT NULL,
    threshold_days INT NOT NULL,
    severity       NVARCHAR(10) DEFAULT 'warning',
    is_enabled     BIT DEFAULT 1,
    notify_emails  NVARCHAR(500),
    created_at     DATETIME DEFAULT GETDATE()
  );
END

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ReconAlert') AND type = N'U')
BEGIN
  CREATE TABLE dbo.ReconAlert (
    id              INT IDENTITY PRIMARY KEY,
    customer_id     INT NOT NULL,
    config_id       INT NOT NULL,
    alert_type      NVARCHAR(50),
    item_id         NVARCHAR(50),
    item_date       DATE,
    days_aged       INT,
    status          NVARCHAR(20) DEFAULT 'open',
    acknowledged_by NVARCHAR(100),
    created_at      DATETIME DEFAULT GETDATE()
  );
END
