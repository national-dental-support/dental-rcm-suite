-- @data: reference
-- Migration 124: Configurable import schedule and retry policy for bank account connections

ALTER TABLE dbo.BankAccountConnection
  ADD schedule_type        NVARCHAR(20)  NULL,   -- manual | daily | weekly | custom
      schedule_time        NVARCHAR(5)   NULL,   -- HH:MM (24h) for daily/weekly runs
      schedule_days        NVARCHAR(30)  NULL,   -- pipe-sep day codes e.g. 'Mon|Wed|Fri'
      schedule_cron        NVARCHAR(100) NULL,   -- raw cron expression for custom type
      retry_max_attempts   INT           NULL,   -- 0 = disabled
      retry_delay_minutes  INT           NULL;   -- minutes between retry attempts
GO

UPDATE dbo.BankAccountConnection
SET schedule_type = 'daily', schedule_time = '03:00',
    retry_max_attempts = 3, retry_delay_minutes = 15
WHERE id = 1 AND customer_id = 1;

UPDATE dbo.BankAccountConnection
SET schedule_type = 'daily', schedule_time = '04:30',
    retry_max_attempts = 3, retry_delay_minutes = 30
WHERE id = 2 AND customer_id = 1;

UPDATE dbo.BankAccountConnection
SET schedule_type = 'manual', retry_max_attempts = 0, retry_delay_minutes = 0
WHERE id = 3 AND customer_id = 1;
