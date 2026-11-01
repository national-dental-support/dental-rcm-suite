-- ===============================================
-- SQL Script: Insurance Payments
-- Description: 
-- This SQL script retrieves the total insurance and patient payment amounts
-- for providers, locations, and insurance payers from eClinicalWorks. The query 
-- aggregates payments from the transactions table, grouping results by provider, 
-- location, and payer.
-- ===============================================
-- =============================================== 
-- TESTING VARIABLES 
-- =============================================== 
DECLARE @facilityName VARCHAR(100) = 'Cordele';
DECLARE @providerName VARCHAR(100) = 'Judy'; 
DECLARE @start_date DATE = '2025-03-01';  
DECLARE @end_date DATE = '2025-04-01'; 
DECLARE @currentYear VARCHAR(4) = '2025'
-- =============================================== 
-- VALIDATION
-- =============================================== 
     -- CURRENT YEAR AND PREVIOUS YEAR PAYMENTS FOR PATIENT AND PAYOR (PASSED)
        -- INSURANCE
        	SELECT 
			'Insurance Payments (YTD)' AS Title,
                COUNT(*) AS TotalPayments,
                SUM(amount) AS TotalInsurancePaid
            FROM db_garcoc.dbo.edi_inspayments
            WHERE PayorType = 1 -- For insurance payments
            AND YEAR([date]) = @currentYear;

        -- LAST 90 DAYS
		SELECT 
			'Insurance Payments (Last 90 Days)' AS ReportTitle,
			COUNT(*) AS PaymentCount,
			SUM(amount) AS TotalInsurancePaid
		FROM db_garcoc.dbo.edi_inspayments
		WHERE PayorType = 1 
			AND [date] >= DATEADD(DAY, -90, CAST(GETDATE() AS DATE))
			AND [date] < CAST(GETDATE() AS DATE);

        -- PATIENT
                SELECT 
                'Insurance Payments (YTD)' AS Title,
                    COUNT(*) AS TotalPayments,
                    SUM(amount) AS TotalInsurancePaid
                FROM db_garcoc.dbo.edi_inspayments
                WHERE PayorType = 2 -- For insurance payments
                AND YEAR([date]) = @currentYear;

            -- LAST 90 DAYS
            SELECT 
                'Insurance Payments (Last 90 Days)' AS ReportTitle,
                COUNT(*) AS PaymentCount,
                SUM(amount) AS TotalInsurancePaid
            FROM db_garcoc.dbo.edi_inspayments
            WHERE PayorType = 2
                AND [date] >= DATEADD(DAY, -90, CAST(GETDATE() AS DATE))
                AND [date] < CAST(GETDATE() AS DATE);



        -- PREVIOUS MONTH
        DECLARE @FirstDayPrevMonthPreviousMonth DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) - 1, 0);
        DECLARE @FirstDayThisMonthPreviousMonth DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0);
        SELECT COUNT(*) AS PaymentCount, SUM(amount) AS TotalInsurancePaid FROM db_garcoc.dbo.edi_inspayments WHERE PayorType = 1 AND [date] >= @FirstDayPrevMonthPreviousMonth AND [date] < @FirstDayThisMonthPreviousMonth;

        -- CURRENT MONTH
        DECLARE @FirstDayThisMonthCurrentMonth DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0);
        DECLARE @FirstDayNextMonthCurrentMonth DATE = DATEADD(MONTH, 1, @FirstDayThisMonthCurrentMonth);
        SELECT COUNT(*) AS PaymentCount,  SUM(amount) AS TotalInsurancePaid FROM db_garcoc.dbo.edi_inspayments WHERE PayorType = 1 AND [date] >= @FirstDayThisMonthCurrentMonth AND [date] < @FirstDayNextMonthCurrentMonth;

    -- TOTAL PATIENT PAYMENTS (PASSED)
        -- YEAR TO DATE
        SELECT COUNT(*) AS TotalPayments, SUM(amount) AS TotalInsurancePaid FROM db_garcoc.dbo.edi_inspayments WHERE PayorType = 2 AND YEAR([date]) = 2025;
        SELECT COUNT(*) AS PaymentCount FROM db_garcoc.dbo.edi_inspayments WHERE PayorType = 2 AND YEAR([date]) = 2025; -- and payment count

        -- LAST 90 DAYS
        SELECT COUNT(*) AS PaymentCount, SUM(amount) AS TotalInsurancePaid FROM db_garcoc.dbo.edi_inspayments WHERE PayorType = 2 AND [date] >= DATEADD(DAY, -90, CAST(GETDATE() AS DATE)) AND [date] < CAST(GETDATE() AS DATE);

        -- PREVIOUS MONTH
        DECLARE @FirstDayPrevMonth DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) - 1, 0);
        DECLARE @FirstDayThisMonth DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0);
        SELECT COUNT(*) AS PaymentCount, SUM(amount) AS TotalInsurancePaid FROM db_garcoc.dbo.edi_inspayments WHERE PayorType = 2 AND [date] >= @FirstDayPrevMonth AND [date] < @FirstDayThisMonth;

        -- CURRENT MONTH
        --DECLARE @FirstDayThisMonth DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0);
        --DECLARE @FirstDayNextMonth DATE = DATEADD(MONTH, 1, @FirstDayThisMonth);
        --SELECT COUNT(*) AS PaymentCount,  SUM(amount) AS TotalInsurancePaid FROM db_garcoc.dbo.edi_inspayments WHERE PayorType = 2 AND [date] >= @FirstDayThisMonth AND [date] < @FirstDayNextMonth;
        -- =============================================== 
        --  Updates to support filtering dynamically by location (facility), provider and payment date (PASSED)
        -- ===============================================
    -- db_garcoc.dbo.edi_inspayments
        -- edi_inspayments.amount - Amount of the payment. (e.g., 100.00, 200.00, 300.00) 
        -- edi_inspayments.PayorType - Type of payor making the payment. (e.g., 0, 1, 2) ?
        -- It contains the record of the insurance payment, however it's not the record itself. 
        -- The data we need to calculate the insurance payment is from the 	edi_payments
        -- table which this record points to
        -- edi_inspayments.paymentId -> edi_payments.id 

        -- Select all records that are actually by the insurance company (IMPORTANT) showing the most recent payments at the top.
        -- Retrieve all insurance payments with PayorType = 1, ordered by the most recent based on the .date column
    -- =============================================== 
    -- VALIDATION
    -- =============================================== 
        -- TOTAL INSURANCE PAYMENTS (PASSED)

            -- =============================================== 
            --  Updates to support filtering dynamically by location (facility), provider and payment date (PASSED)
            -- ===============================================
            -- Tested and validated 
            SELECT 
                db_garcoc.dbo.edi_invoice.RenProviderId AS ProviderId,
                db_garcoc.dbo.users.ufname AS ProviderFirstName,
                db_garcoc.dbo.users.ulname AS ProviderLastName,
                (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname) AS ProviderFullName,
                db_garcoc.dbo.edi_inspayments.date AS PaymentDate,
                db_garcoc.dbo.edi_inspayments.PayorType AS PayorType,
                db_garcoc.dbo.edi_paymentdetail.paid,
                db_garcoc.dbo.edi_paymentdetail.invoiceid,
                db_garcoc.dbo.edi_paymentdetail.paymentId,
                db_garcoc.dbo.enc.FacilityId AS FacilityId,
                db_garcoc.dbo.edi_facilities.name AS FacilityName
            FROM db_garcoc.dbo.edi_paymentdetail
            LEFT JOIN db_garcoc.dbo.edi_invoice 
                ON db_garcoc.dbo.edi_paymentdetail.invoiceId = db_garcoc.dbo.edi_invoice.Id 
            LEFT JOIN db_garcoc.dbo.edi_inspayments 
                ON db_garcoc.dbo.edi_paymentdetail.paymentId = db_garcoc.dbo.edi_inspayments.paymentId
            LEFT JOIN db_garcoc.dbo.enc 
                ON CAST(db_garcoc.dbo.edi_invoice.encounterId AS VARCHAR(50)) = CAST(enc.encounterid AS VARCHAR(50))
            LEFT JOIN db_garcoc.dbo.users
                ON db_garcoc.dbo.edi_invoice.RenProviderId = db_garcoc.dbo.users.uid
            LEFT JOIN db_garcoc.dbo.edi_facilities
                ON enc.facilityId = db_garcoc.dbo.edi_facilities.Id
            WHERE db_garcoc.dbo.edi_inspayments.PayorType = 1
            AND (db_garcoc.dbo.users.ufname + ' ' + db_garcoc.dbo.users.ulname) LIKE '%' + @providerName + '%'
            AND db_garcoc.dbo.edi_facilities.name LIKE '%' + @facilityName + '%'
            AND CONVERT(DATE, db_garcoc.dbo.edi_inspayments.date) >= @start_date
            AND CONVERT(DATE, db_garcoc.dbo.edi_inspayments.date) < @end_date;