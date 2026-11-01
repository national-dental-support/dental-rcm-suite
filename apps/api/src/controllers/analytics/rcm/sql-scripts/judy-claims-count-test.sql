-- This is a test to see the invoice rows for a specific provider and facility dynamically,
-- including all records for the entire current day (regardless of the current time).

DECLARE @providerName VARCHAR(100) = ''; 
DECLARE @facilityName VARCHAR(100) = ''; -- change or leave empty for no facility filtering
DECLARE @start_date DATE = '2023-01-01';  
DECLARE @end_date DATE = '2025-03-14'; 
DECLARE @currentYear VARCHAR(4) = '2025';

PRINT 'Provider Name: ' + @providerName;
PRINT 'Facility Name: ' + @facilityName;
PRINT 'Start Date: ' + CONVERT(VARCHAR(10), @start_date, 120);
PRINT 'End Date: ' + CONVERT(VARCHAR(10), @end_date, 120);
PRINT 'Current Year: ' + @currentYear;


-- Claims Count
SELECT COUNT(*) AS record_count
FROM db_garcoc.dbo.edi_invoice i
LEFT JOIN db_garcoc.dbo.users u 
  ON i.RenProviderId = u.uid
LEFT JOIN db_garcoc.dbo.edi_facilities f
  ON i.InvFacilityId = f.Id
WHERE 
  i.ServiceDt >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
  AND i.ServiceDt < DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
  AND (
       @providerName IS NULL
       OR @providerName = ''
       OR ((u.ufname + ' ' + u.ulname) LIKE '%' + @providerName + '%')
  )
  AND (
       @facilityName IS NULL
       OR @facilityName = ''
       OR (f.name LIKE '%' + @facilityName + '%')
  );
SELECT 
    i.*,
    (u.ufname + ' ' + u.ulname) AS ProviderFullName,
    f.name AS FacilityName
FROM db_garcoc.dbo.edi_invoice i
LEFT JOIN db_garcoc.dbo.users u 
    ON i.RenProviderId = u.uid
LEFT JOIN db_garcoc.dbo.edi_facilities f
    ON i.InvFacilityId = f.Id
WHERE 
    i.ServiceDt >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
    AND i.ServiceDt < DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
    AND (
         @providerName IS NULL
         OR @providerName = ''
         OR ((u.ufname + ' ' + u.ulname) LIKE '%' + @providerName + '%')
    )
    AND (
         @facilityName IS NULL
         OR @facilityName = ''
         OR (f.name LIKE '%' + @facilityName + '%')
    );
