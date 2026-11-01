-- @data: reference
-- Migration 064: HIPAA Compliance - Access Log and Session Timeout
-- HIPAA access log for patient data auditing (Sec.164.312(b))

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'HipaaAccessLog')
CREATE TABLE dbo.HipaaAccessLog (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  user_email NVARCHAR(200),
  patient_id INT NULL,
  resource_type NVARCHAR(50) NOT NULL,
  resource_id NVARCHAR(100) NULL,
  action NVARCHAR(20) NOT NULL,
  ip_address NVARCHAR(50),
  user_agent NVARCHAR(500),
  session_id NVARCHAR(100) NULL,
  customer_id INT,
  created_at DATETIME DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HipaaAccessLog_patient')
  CREATE INDEX IX_HipaaAccessLog_patient ON dbo.HipaaAccessLog (patient_id, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HipaaAccessLog_user')
  CREATE INDEX IX_HipaaAccessLog_user ON dbo.HipaaAccessLog (user_id, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HipaaAccessLog_resource')
  CREATE INDEX IX_HipaaAccessLog_resource ON dbo.HipaaAccessLog (resource_type, created_at DESC);

-- Session timeout tracking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='last_activity_at')
  ALTER TABLE dbo.Users ADD last_activity_at DATETIME NULL;
