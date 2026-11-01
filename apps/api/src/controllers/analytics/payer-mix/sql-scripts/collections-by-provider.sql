
DECLARE @facilityName VARCHAR(100) = '';
DECLARE @providerName VARCHAR(100) = 'Judy'; 
DECLARE @start_date DATE = '2025-03-01';  
DECLARE @end_date DATE = '2025-04-01'; 

-- Total Insurance Payments by provider
SELECT 
        db_garcoc.dbo.edi_invoice.RenProviderId AS ProviderId,
        (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname) AS ProviderFullName,
        SUM(db_garcoc.dbo.edi_paymentdetail.paid) AS TotalPaid
    FROM db_garcoc.dbo.edi_paymentdetail
    LEFT JOIN db_garcoc.dbo.edi_invoice 
        ON db_garcoc.dbo.edi_paymentdetail.invoiceId = db_garcoc.dbo.edi_invoice.Id 
    LEFT JOIN db_garcoc.dbo.edi_inspayments 
        ON db_garcoc.dbo.edi_paymentdetail.paymentId = db_garcoc.dbo.edi_inspayments.paymentId
    LEFT JOIN db_garcoc.dbo.users
        ON db_garcoc.dbo.edi_invoice.RenProviderId = db_garcoc.dbo.users.uid
    WHERE db_garcoc.dbo.edi_inspayments.PayorType = 1
    AND (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname) 
    LIKE '%' + @providerName + '%'
    AND CONVERT(DATE, db_garcoc.dbo.edi_inspayments.date) >= @start_date
    AND CONVERT(DATE, db_garcoc.dbo.edi_inspayments.date) < @end_date
    GROUP BY 
        db_garcoc.dbo.edi_invoice.RenProviderId,
        (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname);


		-- Total Patient Payments by provider
SELECT 
    db_garcoc.dbo.edi_invoice.RenProviderId AS ProviderId,
    (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname) AS ProviderFullName,
    SUM(db_garcoc.dbo.edi_paymentdetail.paid) AS TotalPaid
FROM db_garcoc.dbo.edi_paymentdetail
LEFT JOIN db_garcoc.dbo.edi_invoice 
    ON db_garcoc.dbo.edi_paymentdetail.invoiceId = db_garcoc.dbo.edi_invoice.Id 
LEFT JOIN db_garcoc.dbo.edi_inspayments 
    ON db_garcoc.dbo.edi_paymentdetail.paymentId = db_garcoc.dbo.edi_inspayments.paymentId
LEFT JOIN db_garcoc.dbo.users
    ON db_garcoc.dbo.edi_invoice.RenProviderId = db_garcoc.dbo.users.uid
WHERE db_garcoc.dbo.edi_inspayments.PayorType = 2
AND (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname) 
LIKE '%' + @providerName + '%'
AND CONVERT(DATE, db_garcoc.dbo.edi_inspayments.date) >= @start_date
AND CONVERT(DATE, db_garcoc.dbo.edi_inspayments.date) < @end_date
GROUP BY 
    db_garcoc.dbo.edi_invoice.RenProviderId,
    (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname);


WITH PaymentAgg AS (
    SELECT 
        paymentId, 
        invoiceId, 
        SUM(paid) AS PaidTotal
    FROM db_garcoc.dbo.edi_paymentdetail
    GROUP BY paymentId, invoiceId
)
SELECT 
    db_garcoc.dbo.edi_invoice.RenProviderId AS ProviderId,
    (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname) AS ProviderFullName,
    SUM(PaymentAgg.PaidTotal) AS TotalPaid
FROM PaymentAgg
LEFT JOIN db_garcoc.dbo.edi_invoice 
    ON PaymentAgg.invoiceId = db_garcoc.dbo.edi_invoice.Id 
LEFT JOIN db_garcoc.dbo.edi_inspayments 
    ON PaymentAgg.paymentId = db_garcoc.dbo.edi_inspayments.paymentId
LEFT JOIN db_garcoc.dbo.users
    ON db_garcoc.dbo.edi_invoice.RenProviderId = db_garcoc.dbo.users.uid
WHERE db_garcoc.dbo.edi_inspayments.PayorType = 1
  AND (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname) LIKE '%' + @providerName + '%'
  AND CONVERT(DATE, db_garcoc.dbo.edi_inspayments.date) >= @start_date
  AND CONVERT(DATE, db_garcoc.dbo.edi_inspayments.date) < @end_date
GROUP BY 
    db_garcoc.dbo.edi_invoice.RenProviderId,
    (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname);
