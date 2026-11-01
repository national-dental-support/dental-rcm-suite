-- @data: reference
-- 047: Invoicing tables
-- Invoice, InvoiceLineItem, InvoicePayment

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Invoice' AND TABLE_SCHEMA = 'dbo')
BEGIN
  CREATE TABLE dbo.Invoice (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    customer_id     SMALLINT        NOT NULL,
    patient_id      INT             NOT NULL,
    invoice_number  NVARCHAR(20)    NOT NULL,
    status          NVARCHAR(20)    NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','viewed','paid','partial','overdue','cancelled')),
    subtotal        DECIMAL(10,2)   NOT NULL DEFAULT 0,
    tax_amount      DECIMAL(10,2)   NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2)   NOT NULL DEFAULT 0,
    total           DECIMAL(10,2)   NOT NULL DEFAULT 0,
    amount_paid     DECIMAL(10,2)   NOT NULL DEFAULT 0,
    balance_due     DECIMAL(10,2)   NOT NULL DEFAULT 0,
    due_date        DATE            NOT NULL,
    sent_at         DATETIME        NULL,
    paid_at         DATETIME        NULL,
    notes           NVARCHAR(1000)  NULL,
    created_by      INT             NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT GETDATE(),
    updated_at      DATETIME        NOT NULL DEFAULT GETDATE()
  );
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InvoiceLineItem' AND TABLE_SCHEMA = 'dbo')
BEGIN
  CREATE TABLE dbo.InvoiceLineItem (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    invoice_id      INT             NOT NULL REFERENCES dbo.Invoice(id),
    description     NVARCHAR(500)   NOT NULL,
    procedure_code  NVARCHAR(20)    NULL,
    quantity        INT             NOT NULL DEFAULT 1,
    unit_price      DECIMAL(10,2)   NOT NULL,
    amount          DECIMAL(10,2)   NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT GETDATE()
  );
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InvoicePayment' AND TABLE_SCHEMA = 'dbo')
BEGIN
  CREATE TABLE dbo.InvoicePayment (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    invoice_id      INT             NOT NULL REFERENCES dbo.Invoice(id),
    transaction_id  INT             NULL REFERENCES dbo.PaymentTransaction(id),
    amount          DECIMAL(10,2)   NOT NULL,
    payment_date    DATETIME        NOT NULL DEFAULT GETDATE(),
    payment_method  NVARCHAR(50)    NOT NULL,
    reference       NVARCHAR(200)   NULL,
    created_at      DATETIME        NOT NULL DEFAULT GETDATE()
  );
END;

PRINT '047 Invoicing - done';
