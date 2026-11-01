-- @data: reference
IF OBJECT_ID('dbo.SubmissionBatch','U') IS NULL
CREATE TABLE dbo.SubmissionBatch (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL,
  batch_date DATE NOT NULL,
  payer_name NVARCHAR(200),
  payer_id NVARCHAR(50),
  total_claims INT DEFAULT 0,
  accepted INT DEFAULT 0,
  rejected INT DEFAULT 0,
  pending INT DEFAULT 0,
  status NVARCHAR(20) DEFAULT 'pending',
  submitted_at DATETIME2,
  completed_at DATETIME2,
  file_reference NVARCHAR(200)
);

IF OBJECT_ID('dbo.SubmissionRecord','U') IS NULL
CREATE TABLE dbo.SubmissionRecord (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL,
  batch_id INT NULL REFERENCES dbo.SubmissionBatch(id),
  claim_id NVARCHAR(50),
  patient_name NVARCHAR(200),
  payer_name NVARCHAR(200),
  location_name NVARCHAR(200),
  charge_amount DECIMAL(10,2),
  submission_status NVARCHAR(20) DEFAULT 'pending',
  rejection_code NVARCHAR(50),
  rejection_reason NVARCHAR(500),
  resubmitted_at DATETIME2,
  resubmission_count INT DEFAULT 0
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SubmissionRecord_status' AND object_id=OBJECT_ID('dbo.SubmissionRecord'))
  CREATE INDEX IX_SubmissionRecord_status ON dbo.SubmissionRecord (customer_id, submission_status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SubmissionRecord_batch' AND object_id=OBJECT_ID('dbo.SubmissionRecord'))
  CREATE INDEX IX_SubmissionRecord_batch ON dbo.SubmissionRecord (batch_id);
