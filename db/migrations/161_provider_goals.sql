-- @data: reference
-- 161: Provider Goals - simple per-provider daily/weekly target table for InsightFlow UI
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'provider_goals')
CREATE TABLE dbo.provider_goals (
  id                     INT IDENTITY(1,1) PRIMARY KEY,
  customer_id            INT NOT NULL,
  provider_name          NVARCHAR(255) NOT NULL,
  daily_production_goal  DECIMAL(12,2) NULL,
  weekly_production_goal DECIMAL(12,2) NULL,
  updated_at             DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_provider_goals_cust_name UNIQUE (customer_id, provider_name)
);
