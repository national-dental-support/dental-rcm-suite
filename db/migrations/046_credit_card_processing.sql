-- @data: reference
-- 046: Credit Card Processing tables
-- PaymentGatewayConfig, PaymentMethod, PaymentTransaction

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PaymentGatewayConfig' AND TABLE_SCHEMA = 'dbo')
BEGIN
  CREATE TABLE dbo.PaymentGatewayConfig (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    customer_id     SMALLINT        NOT NULL,
    gateway         NVARCHAR(30)    NOT NULL CHECK (gateway IN ('stripe','square','authorize_net')),
    api_key_encrypted NVARCHAR(500) NOT NULL,
    merchant_id     NVARCHAR(200)   NULL,
    is_active       BIT             NOT NULL DEFAULT 1,
    is_sandbox      BIT             NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT GETDATE(),
    updated_at      DATETIME        NOT NULL DEFAULT GETDATE()
  );
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PaymentMethod' AND TABLE_SCHEMA = 'dbo')
BEGIN
  CREATE TABLE dbo.PaymentMethod (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    customer_id     SMALLINT        NOT NULL,
    patient_id      INT             NOT NULL,
    method_type     NVARCHAR(20)    NOT NULL CHECK (method_type IN ('credit','debit','ach','hsa')),
    card_brand      NVARCHAR(20)    NULL CHECK (card_brand IS NULL OR card_brand IN ('visa','mastercard','amex','discover')),
    last_four       NVARCHAR(4)     NOT NULL,
    exp_month       INT             NULL,
    exp_year        INT             NULL,
    cardholder_name NVARCHAR(200)   NOT NULL,
    gateway_token   NVARCHAR(500)   NOT NULL,
    is_default      BIT             NOT NULL DEFAULT 0,
    is_active       BIT             NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT GETDATE()
  );
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PaymentTransaction' AND TABLE_SCHEMA = 'dbo')
BEGIN
  CREATE TABLE dbo.PaymentTransaction (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    customer_id           SMALLINT        NOT NULL,
    patient_id            INT             NOT NULL,
    payment_method_id     INT             NULL REFERENCES dbo.PaymentMethod(id),
    amount                DECIMAL(10,2)   NOT NULL,
    currency              NVARCHAR(3)     NOT NULL DEFAULT 'USD',
    transaction_type      NVARCHAR(20)    NOT NULL CHECK (transaction_type IN ('charge','refund','void','auth')),
    status                NVARCHAR(20)    NOT NULL CHECK (status IN ('pending','completed','failed','refunded','voided')),
    gateway_transaction_id NVARCHAR(200)  NOT NULL,
    gateway_response      NVARCHAR(MAX)   NULL,
    invoice_id            INT             NULL,
    description           NVARCHAR(500)   NULL,
    processed_by          INT             NULL,
    processed_at          DATETIME        NOT NULL DEFAULT GETDATE(),
    error_message         NVARCHAR(500)   NULL,
    created_at            DATETIME        NOT NULL DEFAULT GETDATE()
  );
END;

PRINT '046 Credit Card Processing - done';
