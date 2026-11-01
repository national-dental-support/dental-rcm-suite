-- @data: reference
-- 162: Treatment Plans - tracks plans presented vs accepted per patient/provider
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'treatment_plans')
CREATE TABLE dbo.treatment_plans (
  id               INT IDENTITY(1,1) PRIMARY KEY,
  customer_id      INT NOT NULL,
  plan_date        DATE NOT NULL,
  provider_name    NVARCHAR(255) NOT NULL,
  patient_id       NVARCHAR(50) NULL,
  treatment_type   NVARCHAR(100) NOT NULL DEFAULT 'General',  -- e.g. Restorative, Ortho, Perio, Preventive, Oral Surgery
  amount_presented DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_accepted  DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at       DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
