-- @data: reference
CREATE TABLE dbo.DashboardLayouts (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  user_id     INT           NOT NULL,
  customer_id INT           NOT NULL,
  name        NVARCHAR(100) NOT NULL,
  config      NVARCHAR(MAX) NOT NULL,
  is_default  BIT           NOT NULL DEFAULT 0,
  is_active   BIT           NOT NULL DEFAULT 0,
  created_at  DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  updated_at  DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IX_DashboardLayouts_User ON dbo.DashboardLayouts (user_id, customer_id);
