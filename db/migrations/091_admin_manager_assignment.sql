-- @data: reference
-- Migration 091: Admin -> Manager assignment relationship
-- Enables hierarchical view filtering:
--   Admin sees only their assigned Managers + those Managers' Specialists
--   Manager sees only their assigned Specialists
--   Specialist sees only their own work

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AdminManagerAssignment')
CREATE TABLE dbo.AdminManagerAssignment (
    id INT IDENTITY(1,1) PRIMARY KEY,
    admin_id INT NOT NULL,           -- The Admin user
    manager_id INT NOT NULL,         -- The Manager assigned to this Admin
    customer_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    created_by NVARCHAR(200),
    CONSTRAINT UQ_AdminManager UNIQUE (admin_id, manager_id),
    INDEX IX_AdminManager_Admin (customer_id, admin_id),
    INDEX IX_AdminManager_Manager (customer_id, manager_id)
);
