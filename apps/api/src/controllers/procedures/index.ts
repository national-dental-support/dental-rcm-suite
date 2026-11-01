import { Request, Response } from 'express';
import sql, { IResult, ConnectionPool } from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';
/**
 *
 * WARNING: THIS FILE VIOLATES THE CRAP OUT OF SRP, WE NEED TO PRIORITIZE BREAKING THIS DOWN BASED ON SOFTWARE SERVICE
 * PROVIDED BY MYRCM
 *
 *
 *
 *
 *
 * Controller class to handle fetching all procedures data for a given customer and date range.
 */

/*
 * Interface representing the structure of the procedures data returned from the API.
 *
 * @interface ProceduresDto
 *
 * @property {number} uid - The unique identifier for the procedure.
 * @property {string} claim_id - The identifier for the claim associated with the procedure (nvarchar(50)).
 * @property {string} code - The procedure code (nvarchar(50)).
 * @property {string} date_of_service - The date when the procedure was performed (nvarchar(50)).
 * @property {string} submitted - Indicates if the procedure was submitted for payment (nvarchar(50)).
 * @property {string} write_off - The amount written off for the procedure (nvarchar(50)).
 * @property {string} contracted - The contracted amount for the procedure (nvarchar(50)).
 * @property {string} deductible - The deductible amount for the procedure (nvarchar(50)).
 * @property {string} co_pay - The co-payment amount for the procedure (nvarchar(50)).
 * @property {string} co_insurance - The co-insurance amount for the procedure (nvarchar(50)).
 * @property {string} pi_reduction - The provider incentives reduction for the procedure (nvarchar(50)).
 * @property {string} other_adj - Other adjustments made to the procedure (nvarchar(50)).
 * @property {string} patient_responsibility - The amount the patient is responsible for (nvarchar(50)).
 * @property {string} insurance_paid - The amount paid by the insurance for the procedure (nvarchar(50)).
 * @property {string} carc - The claim adjustment reason code (nvarchar(50)).
 * @property {string} cpt_category_id - The identifier for the CPT category associated with the procedure (varchar(25)).
 * @property {string} patient_paid - The amount paid by the patient for the procedure (varchar(255)).
 */

// WE NEED TO USE THIS EVENTUALLY,
interface ProceduresDto {
  uid: number;
  claim_id: string;
  code: string;
  date_of_service: string;
  submitted: string;
  write_off: string;
  contracted: string;
  deductible: string;
  co_pay: string;
  co_insurance: string;
  pi_reduction: string;
  other_adj: string;
  patient_responsibility: string;
  insurance_paid: string;
  carc: string;
  cpt_category_id: string;
  patient_paid: string;
}

export class ProceduresController {
  private pool: ConnectionPool;
  /**
   * Constructor to initialize the database connection pool.
   */
  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
  }
  /**
   * getProceduresAndClaimCounts()
   *
   * Retrieves aggregated statistics for all procedures and claims (regardless of payer) for a specific customer,
   * grouped by month. It calculates the total procedure count (CPT), the unique claim count,
   * and the average CPTs per claim.
   *
   * @param {Request} req - The HTTP request object containing:
   *   - `customer_id` (string): The ID of the customer.
   *   - `months_ago` (number): The number of months in the past to consider.
   * @param {Response} res - The HTTP response object used to send the result.
   * @returns {Promise<Response>} A JSON response containing the aggregated statistics per month.
   *
   * @example
   * // Request body:
   * {
   *   "customer_id": "123",
   *   "months_ago": 12
   * }
   * // Response:
   * [
   *   {
   *     "date_of_service": "2023-09",
   *     "cpt_count": 50,
   *     "claims_count": 10,
   *     "cpt_per_claim": 5.0
   *   },
   *   {
   *     "date_of_service": "2023-08",
   *     "cpt_count": 30,
   *     "claims_count": 8,
   *     "cpt_per_claim": 3.75
   *   }
   * ]
   */
  public getProceduresAndClaimCounts = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;

      const months_ago = req.body.months_ago as string | number | undefined;

      if (!customer_id || !this.isPositiveInteger(months_ago)) {
        return res.status(400).json({
          message:
            'Procedures Controller; getProceduresAndClaimCounts; Invalid or missing customer_id or months_ago parameters.',
        });
      }

      // Calculate the date threshold based on the number of months ago specified
      const dateThreshold = new Date();

      dateThreshold.setMonth(dateThreshold.getMonth() - Number(months_ago));

      const formattedDateThreshold = dateThreshold.toISOString().split('T')[0];

      const query = `

          WITH DateRange AS (
        SELECT
            EOMONTH(GETDATE(), -1) AS end_date, -- Last day of the previous month
            DATEADD(MONTH, -12, DATEADD(DAY, 1, EOMONTH(GETDATE(), -2))) AS start_date
    ),
    ClaimsAggregated AS (
        SELECT
            YEAR(CONVERT(DATE, date_of_service_837)) AS service_year,
            MONTH(CONVERT(DATE, date_of_service_837)) AS service_month,
            COUNT(DISTINCT uid) AS claims_count
        FROM ClaimsTracking
        WHERE CONVERT(DATE, date_of_service_837) BETWEEN
            (SELECT start_date FROM DateRange) AND (SELECT end_date FROM DateRange)
          AND customer_id = @customer_id
        GROUP BY YEAR(CONVERT(DATE, date_of_service_837)), MONTH(CONVERT(DATE, date_of_service_837))
    ),
    ProceduresAggregated AS (
        SELECT
            YEAR(CONVERT(DATE, date_of_service)) AS service_year,
            MONTH(CONVERT(DATE, date_of_service)) AS service_month,
            COUNT(DISTINCT uid) AS cpt_count
        FROM Procedures
        WHERE CONVERT(DATE, date_of_service) BETWEEN
            (SELECT start_date FROM DateRange) AND (SELECT end_date FROM DateRange)
          AND customer_id = @customer_id
        GROUP BY YEAR(CONVERT(DATE, date_of_service)), MONTH(CONVERT(DATE, date_of_service))
    ),
    AggregatedData AS (
        SELECT
            CONCAT(
                ISNULL(ca.service_year, pa.service_year), '-',
                RIGHT('0' + CAST(ISNULL(ca.service_month, pa.service_month) AS VARCHAR), 2)
            ) AS date_of_service,
            ISNULL(ca.claims_count, 0) AS claims_count,
            ISNULL(pa.cpt_count, 0) AS cpt_count
        FROM ClaimsAggregated ca
        FULL OUTER JOIN ProceduresAggregated pa
            ON ca.service_year = pa.service_year AND ca.service_month = pa.service_month
    )
    SELECT
        date_of_service,
        claims_count,
        cpt_count,
        CASE
            WHEN claims_count = 0 THEN 0
            ELSE CAST(cpt_count AS FLOAT) / claims_count
        END AS cpt_per_claim
    FROM AggregatedData
    ORDER BY date_of_service;
      `


        ;

      // Execute the query with parameterized inputs
      const result: IResult<any> = await this.pool
        .request()
        .input('customer_id', sql.Int, customer_id)
        // .input('dateThreshold', sql.Date, formattedDateThreshold)
        .query(query);

      // Return the aggregated statistics that match the criteria
      return res.status(200).json(result.recordset);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };

  /**
   * Retrieves aggregated statistics of payer charges by the date of service (DOS).
   * The statistics include total submitted charges, total contracted (allowed) charges,
   * total insurance paid, and the percentage of charges paid by that payer.
   *
   * @param {Request} req - The HTTP request object containing:
   *   - `customer_id` (string): The ID of the customer.
   *   - `months_ago` (number): How far back to search, in months.
   *   - `payer` (string): The payer for which the data is requested.
   * @param {Response} res - The HTTP response object used to send the result.
   * @returns {Promise<Response>} A JSON response with the aggregated statistics for each month.
   *
   * @example
   * // Request body:
   * {
   *   "customer_id": "123",
   *   "months_ago": 6,
   *   "payer": "Medicare"
   * }
   * // Response:
   * [
   *   {
   *     "payer": "Medicare",
   *     "date_of_service": "2023-09",
   *     "total_submitted": 50000.00,
   *     "total_contracted": 40000.00,
   *     "total_insurance_paid": 30000.00,
   *     "percent_of_charges": 60.00
   *   },
   *   {
   *     "payer": "Medicare",
   *     "date_of_service": "2023-08",
   *     "total_submitted": 45000.00,
   *     "total_contracted": 38000.00,
   *     "total_insurance_paid": 32000.00,
   *     "percent_of_charges": 71.11
   *   }
   * ]
   */


  // Chart 2 - Medicare Dashboard
  public getPayerChargesByDateOfService = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const months_ago = req.body.months_ago as string | number | undefined;
      const payer = req.body.payer as string | undefined;

      // Validate the input parameters
      if (!customer_id || !this.isPositiveInteger(months_ago) || !payer) {
        return res.status(400).json({
          message:
            'getPayerChargesByDateOfService; Invalid or missing customer_id, months_ago, or payer parameters.',
        });
      }

      // Calculate the date range based on the number of months ago specified
      const endOfLastMonth = new Date();
      endOfLastMonth.setDate(0); // Sets the date to the last day of the previous month
      const startOfLastYear = new Date(new Date().getFullYear(), new Date().getMonth() - Number(months_ago), 1);

      const formattedStartOfLastYear = startOfLastYear.toISOString().split('T')[0]; // Format the start date as YYYY-MM-DD
      const formattedEndOfLastMonth = endOfLastMonth.toISOString().split('T')[0]; // Format the end date as YYYY-MM-DD
  
      // SQL query to get the aggregated statistics for each month, including the payer
      const query = `
          WITH DateRange AS (
            SELECT 
                EOMONTH(GETDATE(), -1) AS end_date, -- Last day of the previous month
                DATEADD(MONTH, -12, DATEADD(DAY, 1, EOMONTH(GETDATE(), -2))) AS start_date
        )
        SELECT 
            FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') AS date_of_service,
            SUM(ISNULL(p.submitted, 0)) AS total_submitted,
            SUM(ISNULL(p.contracted, 0)) AS total_contracted,
            SUM(ISNULL(p.insurance_paid, 0)) AS total_insurance_paid,
            CASE 
                WHEN SUM(ISNULL(p.submitted, 0)) > 0 
                THEN (SUM(ISNULL(p.contracted, 0)) / SUM(ISNULL(p.submitted, 0))) * 100
                ELSE 0
            END AS percent_of_charges,
            CASE 
                WHEN SUM(ISNULL(p.submitted, 0)) > 0
                THEN (SUM(ISNULL(p.insurance_paid, 0)) / SUM(ISNULL(p.submitted, 0))) * 100
                ELSE 0
            END AS percentage_of_payments,
            SUM(ISNULL(p.contracted, 0) - ISNULL(p.insurance_paid, 0)) AS total_uncollected
        FROM Procedures p
        CROSS JOIN DateRange dr -- Brings the dynamic date range into scope
        WHERE LOWER(p.payer) LIKE '%medicare%'
        AND p.date_of_service >= dr.start_date AND p.date_of_service < DATEADD(DAY, 1, dr.end_date)
        GROUP BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM')
        ORDER BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') ASC;

      `;
  
      // Execute the query with parameterized inputs
      const result: IResult<any> = await this.pool
        .request()
        // .input('customer_id', sql.Int, customer_id)
        // .input('payer', sql.VarChar, payer)
        // .input('formattedStartOfLastYear', sql.Date, formattedStartOfLastYear)
        // .input('formattedEndOfLastMonth', sql.Date, formattedEndOfLastMonth)
        .query(query);
  
      // Return the aggregated statistics that match the criteria, including the payer
      return res.status(200).json(result.recordset);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res
        .status(500)
        .json({ message: 'Internal server error', error: errorMessage });
    }
  };

  /**
   * Retrieves aggregated statistics for payer payments by the date of service (DOS).
   * The statistics include total contracted (allowed) charges, total insurance payments from the payer,
   * total uncollected amounts, and the percentage of charges paid.
   *
   * @param {Request} req - The HTTP request object containing:
   *   - `customer_id` (string): The ID of the customer.
   *   - `months_ago` (number | string): How far back to search, in months.
   *   - `payer` (string): The payer for which the data is requested.
   * @param {Response} res - The HTTP response object used to send the result.
   * @returns {Promise<Response>} A JSON response with the aggregated statistics for each month.
   *
   * @example
   * // Request body:
   * {
   *   "customer_id": "123",
   *   "months_ago": 6,
   *   "payer": "Medicare"
   * }
   * // Response:
   * [
   *   {
   *     "payer": "Medicare",
   *     "date_of_service": "2023-09",
   *     "total_contracted": 40000.00,
   *     "total_insurance_paid": 30000.00,
   *     "total_uncollected": 10000.00,
   *     "percent_of_charges": 75.00
   *   },
   *   {
   *     "payer": "Medicare",
   *     "date_of_service": "2023-08",
   *     "total_contracted": 38000.00,
   *     "total_insurance_paid": 32000.00,
   *     "total_uncollected": 6000.00,
   *     "percent_of_charges": 84.21
   *   }
   * ]
   */
  public getPayerPaymentsByDOS = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const months_ago = req.body.months_ago as string | number | undefined;
      const payer = req.body.payer as string | undefined;

      // Validate the input parameters
      if (!customer_id || !this.isPositiveInteger(months_ago) || !payer) {
        return res.status(400).json({
          message:
            'Invalid or missing customer_id, months_ago, or payer parameters.',
        });
      }

      // Calculate the correct date range for the query
      const endOfLastMonth = new Date();
      endOfLastMonth.setDate(0); // Sets the date to the last day of the previous month
      const startOfLastYear = new Date(new Date().getFullYear(), new Date().getMonth() - Number(months_ago), 1);

      const formattedStartOfLastYear = startOfLastYear.toISOString().split('T')[0]; // Format the start date as YYYY-MM-DD
      const formattedEndOfLastMonth = endOfLastMonth.toISOString().split('T')[0]; // Format the end date as YYYY-MM-DD
  
      // SQL query to get the aggregated statistics for each month, including the payer
      const query = `
       WITH DateRange AS (
            SELECT 
                EOMONTH(GETDATE(), -1) AS end_date, -- Last day of the previous month
                DATEADD(MONTH, -12, DATEADD(DAY, 1, EOMONTH(GETDATE(), -2))) AS start_date
        )
        SELECT 
            FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') AS date_of_service,
            SUM(ISNULL(p.submitted, 0)) AS total_submitted,
            SUM(ISNULL(p.contracted, 0)) AS total_contracted,
            SUM(ISNULL(p.insurance_paid, 0)) AS total_insurance_paid,
            CASE 
                WHEN SUM(ISNULL(p.submitted, 0)) > 0 
                THEN (SUM(ISNULL(p.contracted, 0)) / SUM(ISNULL(p.submitted, 0))) * 100
                ELSE 0
            END AS percent_of_charges,
            CASE 
                WHEN SUM(ISNULL(p.submitted, 0)) > 0
                THEN (SUM(ISNULL(p.insurance_paid, 0)) / SUM(ISNULL(p.submitted, 0))) * 100
                ELSE 0
            END AS percentage_of_payments,
            SUM(ISNULL(p.contracted, 0) - ISNULL(p.insurance_paid, 0)) AS total_uncollected
        FROM Procedures p
        CROSS JOIN DateRange dr -- Brings the dynamic date range into scope
        WHERE LOWER(p.payer) LIKE '%medicare%'
        AND p.date_of_service >= dr.start_date AND p.date_of_service < DATEADD(DAY, 1, dr.end_date)
        GROUP BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM')
        ORDER BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') ASC;


          `;
  
      // Execute the query with parameterized inputs
      const result: IResult<any> = await this.pool
        .request()
        // .input('customer_id', sql.Int, customer_id)
        // .input('payer', sql.VarChar, payer)
        // .input('formattedStartOfLastYear', sql.Date, formattedStartOfLastYear)
        // .input('formattedEndOfLastMonth', sql.Date, formattedEndOfLastMonth)
        .query(query);
  
      // Return the aggregated statistics that match the criteria, including the payer
      return res.status(200).json(result.recordset);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res
        .status(500)
        .json({ message: 'Internal server error', error: errorMessage });
    }
  };

  // Based on procedures
  public getPayerUncollectedDollarAmounts = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const months_ago = req.body.months_ago as string | number | undefined;
      const payer = req.body.payer as string | undefined;

      // Validate the input parameters
      if (!customer_id || !this.isPositiveInteger(months_ago) || !payer) {
        return res.status(400).json({
          message:
            'Invalid or missing customer_id, months_ago, or payer parameters.',
        });
      }

      // Calculate the correct date range for the query
      const endOfLastMonth = new Date();
      endOfLastMonth.setDate(0); // Sets the date to the last day of the previous month
      const startOfLastYear = new Date(new Date().getFullYear(), new Date().getMonth() - Number(months_ago), 1);

      const formattedStartOfLastYear = startOfLastYear.toISOString().split('T')[0]; // Format the start date as YYYY-MM-DD
      const formattedEndOfLastMonth = endOfLastMonth.toISOString().split('T')[0]; // Format the end date as YYYY-MM-DD
  
      // SQL query to fetch the categorized and total uncollected amounts
      const query = `
       WITH DateRange AS (
          SELECT 
              EOMONTH(GETDATE(), -1) AS end_date, -- Dynamically calculate the last day of the previous month.
              DATEADD(MONTH, -12, DATEADD(DAY, 1, EOMONTH(GETDATE(), -2))) AS start_date 
      )
      SELECT 
          FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') AS date_of_service, -- Group results by year and month.
          SUM(CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2))) AS total_uncollected_for_month, -- Total uncollected balances for the month.
          -- Break down uncollected balances by ranges
          SUM(CASE WHEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) > 500 
                  THEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) ELSE 0 END) AS 'Over $500',
          SUM(CASE WHEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) BETWEEN 400 AND 499.99 
                  THEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) ELSE 0 END) AS '$400-$499',
          SUM(CASE WHEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) BETWEEN 300 AND 399.99 
                  THEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) ELSE 0 END) AS '$300-$399',
          SUM(CASE WHEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) BETWEEN 200 AND 299.99 
                  THEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) ELSE 0 END) AS '$200-$299',
          SUM(CASE WHEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) BETWEEN 100 AND 199.99 
                  THEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) ELSE 0 END) AS '$100-$199',
          SUM(CASE WHEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) BETWEEN 50 AND 99.99 
                  THEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) ELSE 0 END) AS '$50-$99',
          SUM(CASE WHEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) BETWEEN 0 AND 49.99 
                  THEN CAST(p.contracted AS decimal(18, 2)) - CAST(p.insurance_paid AS decimal(18, 2)) ELSE 0 END) AS '$0-$49'
      FROM Procedures p
      CROSS JOIN DateRange dr -- Use the dynamically calculated date range for filtering.
      WHERE LOWER(p.payer) LIKE '%medicare%' -- Filter for Medicare-related procedures.
      AND CONVERT(DATE, p.date_of_service) BETWEEN dr.start_date AND dr.end_date -- Include only rows within the dynamic date range.
      GROUP BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') 
      ORDER BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') ASC; -- Sort results chronologically by month.

      `;
  
      // Execute the query with parameterized inputs
      const result: IResult<any> = await this.pool
        .request()
        // .input('customer_id', sql.Int, customer_id)
        // .input('payer', sql.VarChar, payer)
        // .input('formattedStartOfLastYear', sql.Date, formattedStartOfLastYear)
        // .input('formattedEndOfLastMonth', sql.Date, formattedEndOfLastMonth)
        .query(query);
  
      // Return the aggregated statistics that match the criteria, including the payer
      return res.status(200).json(result.recordset);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res
        .status(500)
        .json({ message: 'Internal server error', error: errorMessage });
    }
  };


  // Recommended for pie chart does not uncollected amount by month, only by price range category.
  public getPayerUncollectedDollarAmountsPerClaimByPercentage = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const months_ago = req.body.months_ago as string | number | undefined;
      const payer = req.body.payer as string | undefined;

      // Validate the input parameters
      if (!customer_id || !this.isPositiveInteger(months_ago) || !payer) {
        return res
          .status(400)
          .json({ message: 'Invalid or missing parameters.' });
      }

      // Calculate the date threshold based on the number of months ago specified
      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - Number(months_ago));
      const formattedDateThreshold = dateThreshold.toISOString().split('T')[0];

      // SQL query to aggregate the uncollected dollar amounts across all claims
      const query = `
      WITH DateRange AS (
          SELECT 
              -- Start date: The first day of the month 12 months prior to the last complete month
              DATEADD(DAY, 1, EOMONTH(GETDATE(), -13)) AS start_date,
              -- End date: The last day of the last complete month
              EOMONTH(GETDATE(), -1) AS end_date
      ),
      ClaimUncollected AS (
          SELECT 
              p.claim_id,  -- Claim ID referencing ClaimsTracking.uid
              SUM(p.submitted - p.insurance_paid) AS total_uncollected  -- Sum of uncollected amounts per claim
          FROM Procedures p
          CROSS JOIN DateRange dr
          WHERE LOWER(p.payer) LIKE '%medicare%'  -- Filter for Medicare-related procedures
              AND p.date_of_service >= dr.start_date AND p.date_of_service < DATEADD(DAY, 1, dr.end_date)  -- Filter by the dynamic date range
          GROUP BY p.claim_id  -- Group by claim to sum uncollected amounts per claim
      )
      SELECT 
          -- Aggregate the summed uncollected amounts into predefined dollar amount categories
          SUM(CASE 
                  WHEN cu.total_uncollected > 500 THEN cu.total_uncollected 
                  ELSE 0 
              END) AS [Over $500],
          
          SUM(CASE 
                  WHEN cu.total_uncollected BETWEEN 400 AND 499 THEN cu.total_uncollected 
                  ELSE 0 
              END) AS [$400-$499],
          
          SUM(CASE 
                  WHEN cu.total_uncollected BETWEEN 300 AND 399 THEN cu.total_uncollected 
                  ELSE 0 
              END) AS [$300-$399],
          
          SUM(CASE 
                  WHEN cu.total_uncollected BETWEEN 200 AND 299 THEN cu.total_uncollected 
                  ELSE 0 
              END) AS [$200-$299],
          
          SUM(CASE 
                  WHEN cu.total_uncollected BETWEEN 100 AND 199 THEN cu.total_uncollected 
                  ELSE 0 
              END) AS [$100-$199],
          
          SUM(CASE 
                  WHEN cu.total_uncollected BETWEEN 50 AND 99 THEN cu.total_uncollected 
                  ELSE 0 
              END) AS [$50-$99],
          
          SUM(CASE 
                  WHEN cu.total_uncollected BETWEEN 0 AND 49 THEN cu.total_uncollected 
                  ELSE 0 
              END) AS [$0-$49]
      FROM ClaimUncollected cu;
      `;

      // Execute the query with parameterized inputs
      const result: IResult<Record<string, number>> = await this.pool
        .request()
        .input('customer_id', sql.Int, customer_id)
        .input('payer', sql.VarChar, payer)
        .input('dateThreshold', sql.Date, formattedDateThreshold)
        .query(query);


      const totals = result.recordset[0];

      // Calculate total sum and handle TypeScript types safely
      const totalSum = Object.values(totals).reduce<number>(
        (acc, curr) => acc + (curr || 0),
        0,
      );

      // Add percentage for each category
      const responseWithPercentages = Object.entries(totals).reduce(
        (acc, [key, value]) => {
          const amount = value || 0;
          acc[key] = {
            amount,
            percentage: totalSum > 0 ? (amount / totalSum) * 100 : 0,
          };
          return acc;
        },
        {} as Record<string, { amount: number; percentage: number }>,
      );

      // Return the aggregated totals with percentages
      return res.status(200).json(responseWithPercentages);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res
        .status(500)
        .json({ message: 'Internal server error', error: errorMessage });
    }
  };

  /**
   * Retrieves the uncollected dollar amounts for a specific payer, categorized by ranges,
   * and returns the percentage of each category in relation to the total uncollected amount.
   *
   * Built exclusively for the T12M June 2024 Uncollected Medicare Per Claim Mix table (not the chart )
   *
   * @param {Request} req - The HTTP request object containing:
   *   - `customer_id` (string): The ID of the customer.
   *   - `months_ago` (number | string): The number of months in the past to consider.
   *   - `payer` (string): The payer whose uncollected amounts are being retrieved.
   * @param {Response} res - The HTTP response object used to send the result.
   * @returns {Promise<Response>} A JSON response containing the total uncollected dollar amount
   *   and the percentages for each category, grouped by month.
   *
   * @example
   * // Request body:
   * {
   *   "customer_id": "123",
   *   "months_ago": 12,
   *   "payer": "Medicare"
   * }
   * // Response:
   * [
   *   {
   *     "date_of_service": "2023-09",
   *     "total_uncollected_for_month": 52471.88,
   *     "percentages": {
   *       "Over $500": 17.71,
   *       "$400-$499": 10.96,
   *       "$300-$399": 17.5,
   *       "$200-$299": 17.77,
   *       "$100-$199": 20.73,
   *       "$50-$99": 8.28,
   *       "$0-$49": 7.05
   *     }
   *   }
   * ]
   */
  public getPayerUncollectedDollarAmountCategoriesByPercentage = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const months_ago = req.body.months_ago as string | number | undefined;
      const payer = req.body.payer as string | undefined;

      // Validate input parameters
      if (!customer_id || !this.isPositiveInteger(months_ago) || !payer) {
        return res.status(400).json({
          message:
            'Invalid or missing customer_id, months_ago, or payer parameters.',
        });
      }

      // Calculate the date threshold based on the months ago parameter
      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - Number(months_ago));
      const formattedDateThreshold = dateThreshold.toISOString().split('T')[0];

      // SQL query to fetch data
      const query = `
     WITH DateRange AS (
    SELECT 
        -- Start date: The first day of the month 13 months prior to the last complete month
        DATEADD(DAY, 1, EOMONTH(GETDATE(), -14)) AS start_date,
        -- End date: The last day of the last complete month
        EOMONTH(GETDATE(), -1) AS end_date
)
SELECT 
    FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') AS date_of_service,

    -- Calculate total uncollected amount for the month
    SUM(p.contracted - p.insurance_paid) AS total_uncollected_for_month,

    -- Uncollected amount greater than $500
    SUM(CASE 
            WHEN p.contracted - p.insurance_paid > 500 
            THEN p.contracted - p.insurance_paid 
            ELSE 0 
        END) AS 'Over $500',

    -- Uncollected amount between $400 and $499.99
    SUM(CASE 
            WHEN p.contracted - p.insurance_paid BETWEEN 400 AND 499.99 
            THEN p.contracted - p.insurance_paid 
            ELSE 0 
        END) AS '$400-$499',

    -- Uncollected amount between $300 and $399.99
    SUM(CASE 
            WHEN p.contracted - p.insurance_paid BETWEEN 300 AND 399.99 
            THEN p.contracted - p.insurance_paid 
            ELSE 0 
        END) AS '$300-$399',

    -- Uncollected amount between $200 and $299.99
    SUM(CASE 
            WHEN p.contracted - p.insurance_paid BETWEEN 200 AND 299.99 
            THEN p.contracted - p.insurance_paid 
            ELSE 0 
        END) AS '$200-$299',

    -- Uncollected amount between $100 and $199.99
    SUM(CASE 
            WHEN p.contracted - p.insurance_paid BETWEEN 100 AND 199.99 
            THEN p.contracted - p.insurance_paid 
            ELSE 0 
        END) AS '$100-$199',

    -- Uncollected amount between $50 and $99.99
    SUM(CASE 
            WHEN p.contracted - p.insurance_paid BETWEEN 50 AND 99.99 
            THEN p.contracted - p.insurance_paid 
            ELSE 0 
        END) AS '$50-$99',

    -- Uncollected amount between $0 and $49.99
    SUM(CASE 
            WHEN p.contracted - p.insurance_paid BETWEEN 0 AND 49.99 
            THEN p.contracted - p.insurance_paid 
            ELSE 0 
        END) AS '$0-$49'
FROM Procedures p
CROSS JOIN DateRange dr  -- Include the calculated date range in the scope
WHERE LOWER(p.payer) LIKE '%medicare%'  -- Filter for Medicare-related procedures
    AND CONVERT(DATE, p.date_of_service) BETWEEN dr.start_date AND dr.end_date  -- Filter by the dynamic date range
GROUP BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM')  -- Group data by month
ORDER BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') ASC;


    `;

      const result: IResult<any> = await this.pool
        .request()
        // .input('customer_id', sql.Int, customer_id)
        // .input('payer', sql.VarChar, payer)
        // .input('dateThreshold', sql.Date, formattedDateThreshold)
        .query(query);

      // Transform the result to calculate percentages
      const response = result.recordset.map((record: any) => {
        const totalUncollected = Math.abs(parseFloat(record.total_uncollected_for_month) || 0);

          const categories = {
            'Over $500': Math.abs(Math.floor(parseFloat(record['Over $500']) || 0)),
            '$400-$499': Math.abs(Math.floor(parseFloat(record['$400-$499']) || 0)),
            '$300-$399': Math.abs(Math.floor(parseFloat(record['$300-$399']) || 0)),
            '$200-$299': Math.abs(Math.floor(parseFloat(record['$200-$299']) || 0)),
            '$100-$199': Math.abs(Math.floor(parseFloat(record['$100-$199']) || 0)),
            '$50-$99': Math.abs(Math.floor(parseFloat(record['$50-$99']) || 0)),
            '$0-$49': Math.abs(Math.floor(parseFloat(record['$0-$49']) || 0)),
          };
          
        const percentages = Object.entries(categories).reduce(
          (acc, [key, value]) => {
            acc[key] =
              totalUncollected !== 0
                ? parseFloat(((value / totalUncollected) * 100).toFixed(2))
                : 0;
            return acc;
          },
          {} as Record<string, number>,
        );

        return {
          date_of_service: record.date_of_service,
          total_uncollected_for_month: parseFloat(totalUncollected.toFixed(2)),
          percentages,
        };
      });

      // Return the transformed result
      return res.status(200).json(response);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res
        .status(500)
        .json({ message: 'Internal server error', error: errorMessage });
    }
  };

  /**
   * Retrieves procedures billed, grouped by unique CPT category codes.
   *
   * This method fetches and returns the aggregated statistics of procedures and
   * unique claims grouped by `cpt_category_id` and `date_of_service`. It validates
   * input parameters, executes a SQL query to fetch data, and returns the results as JSON.
   *
   * @async
   * @function getProceduresBilledByCPTGroup
   * @param {Request} req - The Express request object, containing the following:
   *   @param {string} req.body.customer_id - The customer ID for which the data is requested.
   *   @param {string | number} req.body.months_ago - Number of months ago to calculate the date threshold.
   * @param {Response} res - The Express response object used to send the response.
   *
   * @returns {Promise<Response>} A promise that resolves to an HTTP response containing
   * either the aggregated data or an error message.
   *
   * @throws {Error} Throws an error if the SQL query fails or input validation fails.
   *
   * @example
   * // Example request body:
   * // {
   * //   "customer_id": "123",
   * //   "months_ago": 6
   * // }
   *
   * // Example response:
   * // [
   * //   {
   * //     "cpt_category_id": "Urology",
   * //     "procedure_count": 50,
   * //     "date_of_service": "2023-09"
   * //   }
   * // ]
   *
   *  * // Example response (using alphanumerica unique indentifier):
   * // [
   * //   {
   * //     "cpt_category_id": 9IR902FH",
   * //     "procedure_count": 50,
   * //     "date_of_service": "2023-09"
   * //   }
   * // ]
   *
   * @description
   * 1. Validates the `customer_id` and `months_ago` parameters.
   * 2. Calculates the date threshold based on the provided `months_ago`.
   * 3. Executes a SQL query to fetch the procedures grouped by CPT category codes.
   * 4. Returns the aggregated data as JSON or an error message.
   */
  public getProceduresBilledByCPTGroup = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const months_ago = req.body.months_ago as string | number | undefined;
      const payer = req.body.payer as string | undefined;

      // Validate input parameters
      if (!customer_id || !this.isPositiveInteger(months_ago) || !payer) {
        return res.status(400).json({
          message:
            'Invalid or missing customer_id, months_ago, or payer parameters.',
        });
      }

      // Calculate the date threshold based on the number of months ago specified
      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - Number(months_ago));
      const formattedDateThreshold = dateThreshold.toISOString().split('T')[0];

      // SQL query to aggregate procedures by CPT category and filter by payer_837
      const query = `
        WITH CategoryTotals AS (
          SELECT 
            p.cpt_category_id AS category,
            SUM(CAST(p.submitted AS FLOAT)) AS value
          FROM Procedures p
          WHERE LOWER(p.payer) LIKE '%medicare%'
          AND p.date_of_service >= @dateThreshold
          GROUP BY p.cpt_category_id
        ),
        TotalSum AS (
          SELECT SUM(value) AS total_value FROM CategoryTotals
        )
        SELECT 
          ct.category,
          ct.value,
          (ct.value / ts.total_value) * 100 AS percentage
        FROM CategoryTotals ct, TotalSum ts
        ORDER BY ct.category ASC;
    `;

      // Execute the query with parameterized inputs
      const result: IResult<any> = await this.pool
        .request()
        .input('customer_id', sql.Int, customer_id)
        .input('dateThreshold', sql.Date, formattedDateThreshold)
        .input('payer', sql.VarChar, payer)
        .query(query);

      // Format the data to match ProceduresBilledByCPTGroupDto
      const pieChartData = result.recordset.map((row: any) => ({
        category: row.category,
        payer: row.payer,
        value: row.value,
        percentage: parseFloat(row.percentage.toFixed(2)),
      }));

      // Return the formatted data for the pie chart
      return res.status(200).json(pieChartData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };

  public getProceduresUncollectedBilledByCPTGroup = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const months_ago = req.body.months_ago as string | number | undefined;
      const payer = req.body.payer as string | undefined;

      // Validate input parameters
      if (!customer_id || !this.isPositiveInteger(months_ago) || !payer) {
        return res.status(400).json({
          message:
            'Invalid or missing customer_id, months_ago, or payer parameters.',
        });
      }

      // Calculate the date threshold based on the number of months ago specified
      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - Number(months_ago));
      const formattedDateThreshold = dateThreshold.toISOString().split('T')[0];

      // SQL query to calculate uncollected amounts by CPT category and payer_837
      const query = `
        WITH CategoryTotals AS (
          SELECT 
            p.cpt_category_id AS category,
            SUM(CAST(p.submitted AS FLOAT) - CAST(ISNULL(p.insurance_paid, 0) AS FLOAT)) AS uncollected_amount
          FROM Procedures p
          WHERE LOWER(p.payer) LIKE '%medicare%'
          AND p.date_of_service >= @dateThreshold
          GROUP BY p.cpt_category_id
        ),
        TotalSum AS (
          SELECT SUM(uncollected_amount) AS total_value FROM CategoryTotals
        )
        SELECT 
          ct.category,
          
          ct.uncollected_amount AS value,
          (ct.uncollected_amount / ts.total_value) * 100 AS percentage
        FROM CategoryTotals ct, TotalSum ts
        ORDER BY ct.category ASC;
      `;

      // Execute the query with parameterized inputs
      const result: IResult<any> = await this.pool
        .request()
        .input('customer_id', sql.Int, customer_id)
        .input('dateThreshold', sql.Date, formattedDateThreshold)
        .input('payer', sql.VarChar, payer)
        .query(query);

      // Format the data to match ProceduresBilledByCPTGroupDto
      const pieChartData = result.recordset.map((row: any) => ({
        category: row.category,
        payer: row.payer,
        value: row.value,
        percentage: parseFloat(row.percentage.toFixed(2)),
      }));

      // Return the formatted data for the pie chart
      return res.status(200).json(pieChartData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };

  // PayMix Data Viz
  public getTotalInsuranceCollections = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const filters = req.body.filters || {};

      if (!customer_id) {
        return res.status(400).json({
          message: 'Invalid or missing customer_id parameter.',
        });
      }

      const filterResult = this.buildFilterConditions(filters);
      const filterConditions = filterResult.conditions;

      let dateFilterCondition: string;
      let priorYearDateFilterCondition: string;
      const dateParams: Array<{ name: string; type: any; value: any }> = [];

      // Handle date ranges based on filters - parameterized to prevent injection
      if (filters.payment_date?.start_date || filters.payment_date?.end_date) {
        /* istanbul ignore next */
        const startDate = filters.payment_date?.start_date?.trim();
        /* istanbul ignore next */
        const endDate = filters.payment_date?.end_date?.trim();

        if (startDate && endDate) {
          dateFilterCondition = `p.payment_date BETWEEN @dtStart AND @dtEnd`;
          priorYearDateFilterCondition = `p.payment_date BETWEEN DATEADD(YEAR, -1, @dtStart) AND DATEADD(YEAR, -1, @dtEnd)`;
          dateParams.push({ name: 'dtStart', type: sql.DateTime, value: startDate });
          dateParams.push({ name: 'dtEnd', type: sql.DateTime, value: `${endDate} 23:59:59` });
        } else if (startDate) {
          dateFilterCondition = `p.payment_date >= @dtStart`;
          priorYearDateFilterCondition = `p.payment_date >= DATEADD(YEAR, -1, @dtStart)`;
          dateParams.push({ name: 'dtStart', type: sql.DateTime, value: startDate });
        } else {
          dateFilterCondition = `p.payment_date <= @dtEnd`;
          priorYearDateFilterCondition = `p.payment_date <= DATEADD(YEAR, -1, @dtEnd)`;
          dateParams.push({ name: 'dtEnd', type: sql.DateTime, value: `${endDate} 23:59:59` });
        }
      } else {
        // Default behavior: current year up to today, prior year Jan 1 - Dec 31
        const currentYear = new Date().getFullYear();
        dateFilterCondition = `p.payment_date BETWEEN @dtStart AND GETDATE()`;
        priorYearDateFilterCondition = `p.payment_date BETWEEN @dtPriorStart AND @dtPriorEnd`;
        dateParams.push({ name: 'dtStart', type: sql.DateTime, value: `${currentYear}-01-01` });
        dateParams.push({ name: 'dtPriorStart', type: sql.DateTime, value: `${currentYear - 1}-01-01` });
        dateParams.push({ name: 'dtPriorEnd', type: sql.DateTime, value: `${currentYear - 1}-12-31` });
      }

      const query = `
        SELECT
          SUM(CASE
                WHEN YEAR(p.payment_date) = YEAR(GETDATE())
                  AND (${dateFilterCondition})
                THEN CAST(p.insurance_paid AS FLOAT)
                ELSE 0
              END) AS current_year_collections,
          SUM(CASE
                WHEN YEAR(p.payment_date) = YEAR(GETDATE()) - 1
                  AND (${priorYearDateFilterCondition})
                THEN CAST(p.insurance_paid AS FLOAT)
                ELSE 0
              END) AS prior_year_collections
        FROM Procedures p
        INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
        INNER JOIN Locations l ON c.location_id = l.uid
        WHERE l.customer_id = @customer_id
        ${filterConditions};
      `;

      const request = this.pool.request();
      request.input('customer_id', sql.Int, customer_id);
      dateParams.forEach(p => request.input(p.name, p.type, p.value));
      filterResult.applyParams(request);

      const result: IResult<any> = await request.query(query);

      const currentYearCollections =
        result.recordset[0]?.current_year_collections || 0;
      const priorYearCollections =
        result.recordset[0]?.prior_year_collections || 0;

      let percentageChange: string = '--';
      if (priorYearCollections > 0) {
        const change =
          ((currentYearCollections - priorYearCollections) /
            priorYearCollections) *
          100;
        const changeSymbol = change >= 0 ? '+' : '';
        percentageChange = `${changeSymbol}${change.toFixed(1)}%`;
      }

      const formattedCurrentTotal = this.formatToDollarAbbreviation(
        currentYearCollections,
      );
      const formattedPriorTotal =
        this.formatToDollarAbbreviation(priorYearCollections);

      const formattedPercentage = `${formattedPriorTotal} (${percentageChange})`;

      return res.status(200).json({
        total: formattedCurrentTotal,
        percentage: formattedPercentage,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Procedures Controller; getTotalInsuranceCollections; Unknown error occurred';
      return res.status(500).json({
        message:
          'Procedures Controller; getTotalInsuranceCollections; Internal server error',
        error: errorMessage,
      });
    }
  };

  // PayMix Data Viz
  public getTotalPatientCollections = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const filters = req.body.filters || {};

      if (!customer_id) {
        return res.status(400).json({
          message: 'Invalid or missing customer_id parameter.',
        });
      }

      const filterResult = this.buildFilterConditions(filters);
      const filterConditions = filterResult.conditions;

      const query = `
      SELECT
        SUM(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END) AS current_year_collections,
        SUM(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) - 1 THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END) AS prior_year_collections
      FROM Procedures p
      INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id
      ${filterConditions};
    `;

      const request = this.pool.request();
      request.input('customer_id', sql.Int, customer_id);
      filterResult.applyParams(request);

      const result: IResult<any> = await request.query(query);

      const currentYearCollections =
        result.recordset[0]?.current_year_collections || 0;
      const priorYearCollections =
        result.recordset[0]?.prior_year_collections || 0;

      let percentageChange: string = '--';
      if (priorYearCollections > 0) {
        const change =
          ((currentYearCollections - priorYearCollections) /
            priorYearCollections) *
          100;
        const changeSymbol = change >= 0 ? '+' : '';
        percentageChange = `${changeSymbol}${change.toFixed(1)}%`;
      }

      const formattedCurrentTotal = this.formatToDollarAbbreviation(
        currentYearCollections,
      );
      const formattedPriorTotal =
        this.formatToDollarAbbreviation(priorYearCollections);

      const formattedPercentage = `${formattedPriorTotal} (${percentageChange})`;

      return res.status(200).json({
        total: formattedCurrentTotal,
        percentage: formattedPercentage,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Procedures Controller; getTotalPatientCollections; Unknown error occurred';
      return res.status(500).json({
        message:
          'Procedures Controller; getTotalPatientCollections; Internal server error',
        error: errorMessage,
      });
    }
  };

  public getRevenueByLocation = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const { page = 1, limit = 10, sort } = req.body;

      if (!customer_id) {
        return res.status(400).json({
          message: 'Invalid or missing customer_id parameter.',
        });
      }

      const orderByClause =
        this.buildOrderByClauseAdvanced(sort, Object.keys(this.columnMap)) ||
        'ORDER BY l.uid';
      const offset = (page - 1) * limit;

      const query = `
      SELECT 
        l.uid AS location_id,
        l.name AS location_name,
        SUM(CASE WHEN p.submitted IS NOT NULL THEN CAST(p.submitted AS FLOAT) ELSE 0 END) AS total_submitted,
        SUM(CASE WHEN p.submitted IS NOT NULL AND c.date_submitted IS NOT NULL THEN CAST(p.submitted AS FLOAT) ELSE 0 END) AS total_submitted_with_date,
        COUNT(p.submitted) AS insurance_billed,
        SUM(CASE WHEN p.insurance_paid IS NOT NULL THEN CAST(p.insurance_paid AS FLOAT) ELSE 0 END) AS insurance_collections,
        SUM(CASE WHEN p.patient_paid IS NOT NULL THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END) AS patient_collections,
        SUM(CASE WHEN p.insurance_paid IS NOT NULL THEN CAST(p.insurance_paid AS FLOAT) ELSE 0 END) +
        SUM(CASE WHEN p.patient_paid IS NOT NULL THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END) AS gross_collections,
        CASE 
          WHEN SUM(CASE WHEN p.submitted IS NOT NULL THEN CAST(p.submitted AS FLOAT) ELSE 0 END) = 0 THEN 0
          ELSE (
            (
              SUM(CASE WHEN p.insurance_paid IS NOT NULL THEN CAST(p.insurance_paid AS FLOAT) ELSE 0 END) +
              SUM(CASE WHEN p.patient_paid IS NOT NULL THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END)
            ) / 
            SUM(CASE WHEN p.submitted IS NOT NULL THEN CAST(p.submitted AS FLOAT) ELSE 0 END)
          ) * 100
        END AS gross_collections_percentage,
        CASE 
          WHEN SUM(CASE WHEN p.submitted IS NOT NULL THEN CAST(p.submitted AS FLOAT) ELSE 0 END) = 0 THEN 0
          ELSE (
            (
              SUM(CASE WHEN p.insurance_paid IS NOT NULL THEN CAST(p.insurance_paid AS FLOAT) ELSE 0 END) +
              SUM(CASE WHEN p.patient_paid IS NOT NULL THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END)
            ) /
            SUM(CASE WHEN p.submitted IS NOT NULL THEN CAST(p.submitted AS FLOAT) ELSE 0 END)
          ) * 100
        END AS collection_rate,
        SUM(CASE WHEN p.other_adj IS NOT NULL THEN CAST(p.other_adj AS FLOAT) ELSE 0 END) AS Adjustment,
        SUM(CASE WHEN p.refunded IS NOT NULL THEN CAST(p.refunded AS FLOAT) ELSE 0 END) AS Refunded
      FROM Locations l
      LEFT JOIN ClaimsTracking c ON l.uid = c.location_id
      LEFT JOIN Procedures p ON c.uid = p.claim_id
      WHERE l.customer_id = @customer_id
      GROUP BY l.uid, l.name
      ${orderByClause} -- Ensures there is always an ORDER BY clause
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;

      const totalCountQuery = `
        SELECT COUNT(DISTINCT l.uid) AS totalRecords
        FROM Locations l
        LEFT JOIN ClaimsTracking c ON l.uid = c.location_id
        LEFT JOIN Procedures p ON c.uid = p.claim_id
        WHERE l.customer_id = @customer_id;
      `;

      const [result, totalCountResult] = await Promise.all([
        this.pool
          .request()
          .input('customer_id', sql.Int, customer_id)
          .input('offset', sql.Int, offset)
          .input('limit', sql.Int, limit)
          .query(query),
        this.pool
          .request()
          .input('customer_id', sql.Int, customer_id)
          .query(totalCountQuery),
      ]);

      const totalRecords = totalCountResult.recordset[0]?.totalRecords || 0;

      const locationsData = result.recordset.map((record) => ({
        id: record.location_id,
        name: record.location_name,
        charges: {
          display: `$${Number(record.total_submitted || 0).toLocaleString('en-US')}`,
          withDate: `$${Number(record.total_submitted_with_date || 0).toLocaleString('en-US')}`,
        },
        insuranceBilled: (record.insurance_billed || 0).toLocaleString('en-US'),
        insuranceCollections: `$${Number(record.insurance_collections || 0).toLocaleString('en-US')}`,
        patientCollections: `$${Number(record.patient_collections || 0).toLocaleString('en-US')}`,
        grossCollections: {
          display: `$${Number(record.gross_collections || 0).toLocaleString('en-US')}`,
          percentage: `${Number(record.gross_collections_percentage || 0).toFixed(2)}%`,
        },
        collectionRate: `${Number(record.collection_rate || 0).toFixed(2)}%`,
        adjustment: `$${Number(record.Adjustment || 0).toLocaleString('en-US')}`,
        refund: `$${Number(record.Refunded || 0).toLocaleString('en-US')}`,
      }));

      return res.status(200).json({
        data: locationsData,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalRecords,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };

  public getRCMSummary = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;

      // Step 1: Validate the presence of customer_id
      if (!customer_id) {
        return res.status(400).json({
          message: 'Invalid or missing customer_id parameter.',
        });
      }

      // Step 3: Define the SQL query to fetch the required stats
      const query = `
      SELECT 
        -- Collection Rates
        SUM(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) THEN CAST(p.submitted AS FLOAT) ELSE 0 END) AS current_year_submitted,
        SUM(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) THEN CAST(p.patient_paid AS FLOAT) + CAST(p.insurance_paid AS FLOAT) ELSE 0 END) AS current_year_collections,
        SUM(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) - 1 THEN CAST(p.submitted AS FLOAT) ELSE 0 END) AS previous_year_submitted,
        SUM(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) - 1 THEN CAST(p.patient_paid AS FLOAT) + CAST(p.insurance_paid AS FLOAT) ELSE 0 END) AS previous_year_collections,
        -- Claims Count
        COUNT(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) THEN 1 ELSE NULL END) AS current_year_claims,
        COUNT(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) - 1 THEN 1 ELSE NULL END) AS previous_year_claims,
        -- Total Gross Production
        SUM(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) THEN CAST(p.patient_paid AS FLOAT) + CAST(p.insurance_paid AS FLOAT) ELSE 0 END) AS current_year_gross_production,
        SUM(CASE WHEN YEAR(p.date_of_service) = YEAR(GETDATE()) - 1 THEN CAST(p.patient_paid AS FLOAT) + CAST(p.insurance_paid AS FLOAT) ELSE 0 END) AS previous_year_gross_production
      FROM Procedures p
      INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id;
    `;

      // Step 4: Execute the query
      const result: IResult<any> = await this.pool
        .request()
        .input('customer_id', sql.Int, customer_id)
        .query(query);

      // Step 5: Extract the data with fallbacks
      const {
        current_year_submitted = 0,
        current_year_collections = 0,
        previous_year_submitted = 0,
        previous_year_collections = 0,
        current_year_claims = 0,
        previous_year_claims = 0,
        current_year_gross_production = 0,
        previous_year_gross_production = 0,
      } = result.recordset[0] || {};

      // Step 6: Calculate Collection Rates
      const currentRate =
        current_year_submitted > 0
          ? (current_year_collections / current_year_submitted) * 100
          : 0;
      const previousRate =
        previous_year_submitted > 0
          ? (previous_year_collections / previous_year_submitted) * 100
          : 0;

      const rateChange = currentRate - previousRate;

      // Step 7: Calculate Claims Change (Percentage)
      const claimsPercentageChange =
        previous_year_claims > 0
          ? ((current_year_claims - previous_year_claims) /
              previous_year_claims) *
            100
          : 0;

      const claimsChangeSymbol = claimsPercentageChange >= 0 ? '+' : '';

      // Step 8: Calculate Gross Production Change (Percentage)
      const grossProductionPercentageChange =
        previous_year_gross_production > 0
          ? ((current_year_gross_production - previous_year_gross_production) /
              previous_year_gross_production) *
            100
          : 0;

      const grossProductionChangeSymbol =
        grossProductionPercentageChange >= 0 ? '+' : '';

      // Step 9: Format the Output Safely
      const formattedData = {
        collectionRate: {
          percentage: `${currentRate.toFixed(1)}%`,
          difference: `${rateChange >= 0 ? '+' : ''}${rateChange.toFixed(1)}%`,
        },
        claims: {
          count: current_year_claims || 0,
          difference: `${claimsChangeSymbol}${claimsPercentageChange.toFixed(1)}%`,
        },
        grossProduction: {
          total: this.formatToDollarAbbreviation(
            current_year_gross_production || 0,
          ),
          difference: `${grossProductionChangeSymbol}${grossProductionPercentageChange.toFixed(
            1,
          )}%`,
        },
      };

      // Step 10: Return the response
      return res.status(200).json(formattedData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Procedures Controller; getRCMSummary; Unknown error occurred';
      return res.status(500).json({
        message: 'Procedures Controller; getRCMSummary; Internal server error',
        error: errorMessage,
      });
    }
  };

  // Days in ar (wrong name)
  public getARSummary = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;

      // Queries to calculate the average days in AR for the current and prior year
      const query = `
      SELECT 
        AVG(DATEDIFF(DAY, c.date_of_service_837, c.payment_date)) AS average_days_in_ar
      FROM ClaimsTracking c
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id
        AND c.date_of_service_837 IS NOT NULL
        AND c.payment_date IS NOT NULL;
    `;

      const priorYearQuery = `
      SELECT 
        AVG(DATEDIFF(DAY, c.date_of_service_837, c.payment_date)) AS average_days_in_ar_prior_year
      FROM ClaimsTracking c
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id
        AND c.date_of_service_837 IS NOT NULL
        AND c.payment_date IS NOT NULL
        AND YEAR(c.date_of_service_837) = YEAR(GETDATE()) - 1;
    `;

      // Execute both queries in parallel
      const [currentResult, priorYearResult] = await Promise.all([
        this.pool
          .request()
          .input('customer_id', sql.Int, customer_id)
          .query(query),
        this.pool
          .request()
          .input('customer_id', sql.Int, customer_id)
          .query(priorYearQuery),
      ]);

      const averageDaysInAR =
        currentResult.recordset[0]?.average_days_in_ar || 0;
      const averageDaysInARPriorYear =
        priorYearResult.recordset[0]?.average_days_in_ar_prior_year || 0;

      // Calculate the percentage difference
      const percentageDifference =
        averageDaysInARPriorYear > 0
          ? ((averageDaysInAR - averageDaysInARPriorYear) /
              averageDaysInARPriorYear) *
            100
          : 0;

      // Determine the sign for the percentage difference
      const percentageSign =
        percentageDifference > 0 ? '+' : percentageDifference < 0 ? '' : '';

      // Format the values for response
      const formatDays = (value: number): string =>
        `${value.toFixed(0)} ${value === 1 ? 'day' : 'days'}`;

      return res.status(200).json({
        current_year_average_days_in_ar: formatDays(averageDaysInAR),
        prior_year_average_days_in_ar: averageDaysInARPriorYear.toFixed(0), // Only the number
        percentage_difference: `(${percentageSign}${percentageDifference.toFixed(2)}%)`,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };

  // AR COLLECTIONS BREAKDOWN TABLE (DONT DELETE)
  public getARAndCollections = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const { page = 1, limit = 10, sort } = req.body;

      if (!customer_id) {
        return res.status(400).json({
          message: 'Invalid or missing customer_id parameter.',
        });
      }

      const orderByClause =
        this.buildOrderByClauseAdvanced(sort, [
          'name',
          'totalCollections',
          'patientCollections',
          'insuranceCollections',
          'grossCollections',
          'collectionAdjustment',
          'productionDollarPerHour',
          'ARBalance',
        ]) || 'ORDER BY l.uid';

      const offset = (page - 1) * limit;

      const query = `
      WITH AggregatedProduction AS (
        SELECT 
          l.uid AS location_id,
          l.name AS location_name,
          COUNT(p.submitted) AS collection_count,
          SUM(CASE WHEN p.patient_paid IS NOT NULL THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END) AS patient_collections,
          SUM(CASE WHEN p.insurance_paid IS NOT NULL THEN CAST(p.insurance_paid AS FLOAT) ELSE 0 END) AS insurance_collections,
          SUM(CASE WHEN p.patient_paid IS NOT NULL THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END) +
          SUM(CASE WHEN p.insurance_paid IS NOT NULL THEN CAST(p.insurance_paid AS FLOAT) ELSE 0 END) AS gross_collections,
          SUM(CASE WHEN p.other_adj IS NOT NULL THEN CAST(p.other_adj AS FLOAT) ELSE 0 END) AS collection_adjustment,
          AVG(SUM(CASE 
            WHEN p.patient_paid IS NOT NULL THEN CAST(p.patient_paid AS FLOAT) ELSE 0 END) +
            SUM(CASE WHEN p.insurance_paid IS NOT NULL THEN CAST(p.insurance_paid AS FLOAT) ELSE 0 END)) / 8 AS production_dollar_per_hour,
          SUM(CASE WHEN p.ar_balance IS NOT NULL THEN CAST(p.ar_balance AS FLOAT) ELSE 0 END) AS ar_balance
        FROM Locations l
        LEFT JOIN ClaimsTracking c ON l.uid = c.location_id
        LEFT JOIN Procedures p ON c.uid = p.claim_id
        WHERE l.customer_id = @customer_id
        GROUP BY l.uid, l.name
      )
      SELECT * FROM AggregatedProduction
      ${orderByClause}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;

      const result: IResult<any> = await this.pool
        .request()
        .input('customer_id', sql.Int, customer_id)
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit)
        .query(query);

      const subQuery = `
      WITH DailyProduction AS (
          SELECT
              CONCAT(c.first_name_837, ' ', c.last_name_837) AS provider_name,
              p.date_of_service,
              SUM(
                  ISNULL(CAST(p.patient_paid AS FLOAT), 0) +
                  ISNULL(CAST(p.insurance_paid AS FLOAT), 0) +
                  ISNULL(CAST(p.co_pay AS FLOAT), 0) +
                  ISNULL(CAST(p.co_insurance AS FLOAT), 0)
              ) AS daily_total_dollar_value
          FROM
              ClaimsTracking c
          LEFT JOIN
              Procedures p ON c.uid = p.claim_id
          WHERE
              c.location_id = @location_id
          GROUP BY
              CONCAT(c.first_name_837, ' ', c.last_name_837),
              p.date_of_service
      ),
      HourlyProduction AS (
          SELECT
              provider_name,
              date_of_service,
              daily_total_dollar_value / 8 AS production_per_hour
          FROM
              DailyProduction
      ),
      AverageProduction AS (
          SELECT
              provider_name,
              SUM(production_per_hour) / COUNT(*) AS avg_production_per_hour
          FROM
              HourlyProduction
          GROUP BY
              provider_name
      )
      SELECT
          provider_name,
          ROUND(avg_production_per_hour, 2) AS avg_production_per_hour
      FROM
          AverageProduction;
  `;

      const locationsData = [];
      for (const record of result.recordset) {
        const subResult: IResult<any> = await this.pool
          .request()
          .input('location_id', sql.VarChar, record.location_id)
          .query(subQuery);

        const subRows = subResult.recordset.map((subRecord) => ({
          id: `${record.location_id}-${subRecord.provider_first_name}-${subRecord.provider_last_name}`,
          name: `${subRecord.provider_first_name} ${subRecord.provider_last_name}`,
          collectionCount: subRecord.collection_count || 0,
          patientCollections: `$${Number(subRecord.patient_collections || 0).toLocaleString('en-US')}`,
          insuranceCollections: `$${Number(subRecord.insurance_collections || 0).toLocaleString('en-US')}`,
          grossCollections: `$${Number(subRecord.gross_collections || 0).toLocaleString('en-US')}`,
          productionPerHour: `$${Number(subRecord.production_dollar_per_hour || 0).toFixed(2)}`,
          arBalance: `$${Number(subRecord.ar_balance || 0).toLocaleString('en-US')}`,
        }));
          //ts-expect-error - tech debt
        locationsData.push({
          id: record.location_id,
          name: record.location_name,
          collectionCount: record.collection_count || 0,
          patientCollections: `$${Number(record.patient_collections || 0).toLocaleString('en-US')}`,
          insuranceCollections: `$${Number(record.insurance_collections || 0).toLocaleString('en-US')}`,
          grossCollections: `$${Number(record.gross_collections || 0).toLocaleString('en-US')}`,
          productionPerHour: `$${Number(record.production_dollar_per_hour || 0).toFixed(2)}`,
          arBalance: `$${Number(record.ar_balance || 0).toLocaleString('en-US')}`,
          subRows,
        });
      }

      return res.status(200).json(locationsData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Procedures Controller; getARAndCollections; Unknown error occurred';
      return res.status(500).json({
        message:
          'Procedures Controller; getARAndCollections; Internal server error',
        error: errorMessage,
      });
    }
  };

  public getCollectionsByDateRange = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const { filters } = req.body;

      // Validate input parameters
      if (!customer_id) {
        return res.status(400).json({
          message: 'Invalid or missing customer_id parameter.',
        });
      }

      // Generate filter conditions using the buildFilterConditions method
      const filterResult = this.buildFilterConditions(filters);
      const filterConditions = filterResult.conditions;

      // Define the SQL query to calculate monthly totals of insurance and patient collections
      const query = `
      SELECT
        FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM') AS month,
        SUM(CAST(p.insurance_paid AS FLOAT)) AS total_insurance_paid,
        SUM(CAST(p.patient_paid AS FLOAT)) AS total_patient_paid
      FROM Procedures p
      INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id
        ${filterConditions}
      GROUP BY FORMAT(CONVERT(date, p.date_of_service), 'yyyy-MM')
      ORDER BY month ASC;
    `;

      // Prepare the database request
      const request = this.pool
        .request()
        .input('customer_id', sql.Int, customer_id);
      filterResult.applyParams(request);

      const result: IResult<any> = await request.query(query);

      // Format the result with plain number precision
      const formattedResult = result.recordset.map((record) => ({
        month: record.month,
        totalInsurancePaid:
          Math.round(parseFloat(record.total_insurance_paid) * 100) / 100,
        totalPatientPaid:
          Math.round(parseFloat(record.total_patient_paid) * 100) / 100,
      }));

      // Return the formatted data for the bar chart
      return res.status(200).json(formattedResult);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };

  // Helper method to build filters
  /* istanbul ignore next */
  private buildFilters(paymentReceived: {
    start_date?: string;
    end_date?: string;
  }): { start_date: string; end_date: string } {
    const start_date = paymentReceived?.start_date ?? '';
    const end_date = paymentReceived?.end_date ?? '';

    return { start_date, end_date };
  }

  // CHART DATAVIZ, WRONG TITLE AND DUPLICATE
  public getTotalARBalance = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const start_date = req.body.start_date
        ? new Date(req.body.start_date)
        : undefined;
      const end_date = req.body.end_date
        ? new Date(req.body.end_date)
        : undefined;

      if (!customer_id) {
        return res.status(400).json({
          message: 'Invalid or missing customer_id parameter.',
        });
      }

      const dateRangeCondition =
        start_date && end_date
          ? `AND p.date_of_service BETWEEN @start_date AND @end_date`
          : start_date
            ? `AND p.date_of_service >= @start_date`
            : end_date
              ? `AND p.date_of_service <= @end_date`
              : '';

      // Updated agingQuery to include ISNULL for null handling
      const agingQuery = `
      SELECT 
        SUM(CASE WHEN DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 0 AND 30 
                  THEN ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0) ELSE 0 END) AS total_0_30,
        SUM(CASE WHEN DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 31 AND 60 
                  THEN ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0) ELSE 0 END) AS total_31_60,
        SUM(CASE WHEN DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 61 AND 90 
                  THEN ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0) ELSE 0 END) AS total_61_90,
        SUM(CASE WHEN DATEDIFF(DAY, p.date_of_service, GETDATE()) > 90 
                  THEN ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0) ELSE 0 END) AS total_over_90,
        SUM(ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0)) AS total_outstanding
      FROM Procedures p
      INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id
      ${dateRangeCondition};
    `;

      // Updated specialtyQuery to include ISNULL for null handling
      const specialtyQuery = `
      SELECT 
        p.cpt_category_id AS category,
        SUM(ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0)) AS category_total
      FROM Procedures p
      INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id
      ${dateRangeCondition}
      GROUP BY p.cpt_category_id;
    `;

      // Updated arTrendsQuery to include ISNULL for null handling
      const arTrendsQuery = `
      SELECT 
        FORMAT(CAST(p.date_of_service AS DATE), 'yyyy-MM') AS month,
        SUM(CASE WHEN DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 0 AND 30 
                  THEN ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0) ELSE 0 END) AS total_0_30,
        SUM(CASE WHEN DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 31 AND 60 
                  THEN ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0) ELSE 0 END) AS total_31_60,
        SUM(CASE WHEN DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 61 AND 90 
                  THEN ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0) ELSE 0 END) AS total_61_90,
        SUM(CASE WHEN DATEDIFF(DAY, p.date_of_service, GETDATE()) > 90 
                  THEN ISNULL(CAST(p.submitted AS FLOAT), 0) - ISNULL(CAST(p.patient_paid AS FLOAT), 0) - ISNULL(CAST(p.insurance_paid AS FLOAT), 0) ELSE 0 END) AS total_over_90
      FROM Procedures p
      INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id
      ${dateRangeCondition}
      GROUP BY FORMAT(CAST(p.date_of_service AS DATE), 'yyyy-MM')
      ORDER BY month;
    `;

      const request = this.pool
        .request()
        .input('customer_id', sql.Int, customer_id);

      if (start_date) request.input('start_date', sql.Date, start_date);
      if (end_date) request.input('end_date', sql.Date, end_date);

      const [agingResult, specialtyResult, arTrendsResult] = await Promise.all([
        request.query(agingQuery),
        request.query(specialtyQuery),
        request.query(arTrendsQuery),
      ]);


      // Process and return response with proper null handling
      const agingData = agingResult.recordset[0];
      const totalOutstandingARBalance = agingData.total_outstanding ?? 0;
      const calculatePercentage = (value: number): string =>
        totalOutstandingARBalance > 0
          ? ((value / totalOutstandingARBalance) * 100).toFixed(2)
          : '0.00';

      const agingDetails = [
        {
          category: '< 30 Days',
          value: (agingData.total_0_30 ?? 0).toFixed(2),
          percentage: calculatePercentage(agingData.total_0_30 ?? 0),
        },
        {
          category: '31-60 Days',
          value: (agingData.total_31_60 ?? 0).toFixed(2),
          percentage: calculatePercentage(agingData.total_31_60 ?? 0),
        },
        {
          category: '61-90 Days',
          value: (agingData.total_61_90 ?? 0).toFixed(2),
          percentage: calculatePercentage(agingData.total_61_90 ?? 0),
        },
        {
          category: '> 90 Days',
          value: (agingData.total_over_90 ?? 0).toFixed(2),
          percentage: calculatePercentage(agingData.total_over_90 ?? 0),
        },
      ];

      const specialtyTotal = specialtyResult.recordset.reduce(
        (acc, row) => acc + parseFloat(row.category_total ?? 0),
        0,
      );
      const specialtyDetails = specialtyResult.recordset.map((row) => ({
        category: row.category,
        value: parseFloat(row.category_total ?? 0).toFixed(2),
        percentage:
          specialtyTotal > 0
            ? (
                (parseFloat(row.category_total ?? 0) / specialtyTotal) *
                100
              ).toFixed(2)
            : '0.00',
      }));

      const arTrendsDetails = arTrendsResult.recordset.map((row) => ({
        month: row.month,
        total_0_30: row.total_0_30 ?? 0,
        total_31_60: row.total_31_60 ?? 0,
        total_61_90: row.total_61_90 ?? 0,
        total_over_90: row.total_over_90 ?? 0,
      }));

      return res.status(200).json({
        ar_aging: {
          total: this.formatToDollarAbbreviation(totalOutstandingARBalance),
          details: agingDetails,
        },
        ar_specialty: {
          total: this.formatToDollarAbbreviation(specialtyTotal),
          details: specialtyDetails,
        },
        ar_trends: {
          details: arTrendsDetails,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };

  /**
 *
 * @param req
 * @param res
 * @returns
 *
 *
 *
 *
 * Example request object
 * {
      "customer_id":"1",
      "location_ids":["523"],
      "page": "2",
      "limit":"10"
  }
 */
  public getSourceData = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    const columnMappings: { [key: string]: string } = {
      payer: 'payer_837',
      'insurance-medicare-collected': 'insurance_paid',
      provider: 'location',
      patient: 'patient_last_name_837',
      submitted: 'submitted',
      contracted: 'contracted',
      total_paid: 'total_paid',
      ar_balance: 'ar_balance',
      code: 'code',
    };

    try {
      const customer_id = (req as any).actor?.customer_id as number | undefined;
      const {
        page = 1,
        limit = 10,
        sort,
        filters = {},
      } = req.body.params;

      if (!customer_id) {
        return res.status(400).json({
          message: 'Procedures Controller; Invalid or missing customer_id.',
        });
      }

      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Build location ID placeholders for the query

      // Map frontend sort column to database column
      const sortColumn = columnMappings[sort?.column] || 'payer_837'; // Default to payer_837
      const sortDirection = sort?.direction === 'desc' ? 'DESC' : 'ASC';

      /* istanbul ignore next */
      if (!Object.values(columnMappings).includes(sortColumn)) {
        return res
          .status(400)
          .json({ message: 'Invalid sort column provided.' });
      }

      // Build filter conditions
      const filterResult = this.buildFilterConditions(filters);
      const filterConditions = filterResult.conditions;

      // SQL query to get the total count of records for pagination
      const countQuery = `
        SELECT COUNT(*) AS totalRecords
        FROM ClaimsTracking c
        INNER JOIN Locations l ON c.location_id = l.uid
        INNER JOIN Procedures p ON p.claim_id = c.uid
        WHERE l.customer_id = @customer_id
          ${filterConditions}
      `;

      const orderByClause = this.buildOrderByClause(sort);

      const dataQuery = `
      SELECT
          CONCAT(LEFT(p.patient, 1), '. ', SUBSTRING(p.patient, CHARINDEX(' ', p.patient) + 1, LEN(p.patient))) AS patient, -- Abbreviate patient name from Procedures.patient
          LTRIM(RTRIM(l.name)) AS practice_provider,
          p.date_of_service AS dos_aging,
          DATEDIFF(DAY, p.date_of_service, GETDATE()) AS days_ago,
          p.payer AS payer, -- Use payer from Procedures
          p.carc AS carc,
          p.claim_id AS claim_id,
          p.code AS code,
          p.location AS location, -- Use location from Procedures
          p.provider AS provider,
          p.payment_date AS payment_date,
          p.cpt_category_id AS cpt_category,
          CAST(p.submitted AS FLOAT) AS submitted,
          CAST(p.contracted AS FLOAT) AS contracted,
          CAST(p.patient_paid AS FLOAT) AS patient_paid,
          CAST(p.insurance_paid AS FLOAT) AS insurance_paid,
          CAST(p.patient_paid AS FLOAT) + CAST(p.insurance_paid AS FLOAT) AS total_collected,
          CAST(p.total_paid AS FLOAT) AS total_paid,
          CAST(p.ar_balance AS FLOAT) AS ar_balance
      FROM ClaimsTracking c
      INNER JOIN Locations l ON c.location_id = l.uid -- Join ClaimsTracking with Locations
      INNER JOIN Procedures p ON p.claim_id = c.uid -- Join Procedures with ClaimsTracking
      WHERE l.customer_id = @customer_id
        ${filterConditions}
        ${orderByClause}
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`;

      // Query to fetch the unique list of providers
      const uniqueProvidersQuery = `
        SELECT DISTINCT provider
        FROM Procedures p
        INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
        INNER JOIN Locations l ON c.location_id = l.uid
        WHERE l.customer_id = @customer_id
      `;

      // Query to fetch the unique list of locations
      const uniqueLocationsQuery = `
        SELECT DISTINCT LTRIM(RTRIM(location)) AS location
        FROM Procedures p
        INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
        INNER JOIN Locations l ON c.location_id = l.uid
        WHERE l.customer_id = @customer_id
      `;

      // Query to fetch the unique list of CPT categories (NOT W)
      const uniqueCptCategoriesQuery = `
        SELECT DISTINCT cpt_category_id AS cpt_category
        FROM Procedures p
        INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
        INNER JOIN Locations l ON c.location_id = l.uid
        WHERE l.customer_id = @customer_id
      `;

      const uniquePayersQuery = `
      SELECT DISTINCT payer
      FROM Procedures p
      INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
      INNER JOIN Locations l ON c.location_id = l.uid
      WHERE l.customer_id = @customer_id
    `;

      // Prepare the SQL request
      const request = this.pool
        .request()
        .input('customer_id', sql.Int, customer_id)
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit);
      filterResult.applyParams(request);

      // Execute queries in parallel
      const [
        countResult,
        dataResult,
        providersResult,
        locationsResult,
        cptCategoriesResult,
        payersResult,
      ] = await Promise.all([
        request.query(countQuery),
        request.query(dataQuery),
        request.query(uniqueProvidersQuery),
        request.query(uniqueLocationsQuery),
        request.query(uniqueCptCategoriesQuery),
        request.query(uniquePayersQuery),
      ]);

      const totalRecords = countResult.recordset[0].totalRecords;
      const uniqueProviders = [
        'All',
        ...providersResult.recordset
          .map((row: { provider: string }) => row.provider)
          .filter((provider) => provider) // Ensure no null/undefined values
          .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      ];

      // Add "All" option and sort uniqueLocations alphabetically
      const uniqueLocations = [
        'All',
        ...locationsResult.recordset
          .map((row: { location: string }) => row.location)
          .filter((location) => location) // Ensure no null/undefined values
          .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      ];

      // Add "All" option and sort uniqueCptGroups alphabetically
      const uniqueCptGroups = [
        'All',
        ...cptCategoriesResult.recordset
          .map((row: { cpt_category: string }) => row.cpt_category)
          .filter((cptCategory) => cptCategory) // Ensure no null/undefined values
          .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      ];

      const uniquePayers = [
        'All',
        ...payersResult.recordset
          .map((row: { payer: string }) => row.payer)
          .filter((payer) => payer)
          .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      ];

      // console.log("recordset", dataResult.recordset)

      return res.status(200).json({
        data: dataResult.recordset,
        providers: uniqueProviders,
        locations: uniqueLocations,
        cptGroups: uniqueCptGroups,
        payers: uniquePayers,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalRecords,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };

  /* istanbul ignore next */
  private async countFilteredProcedures(
    customer_id: string,
    location_ids: string[],
    filterConditions: string,
  ): Promise<number> {
    const locationIdPlaceholders = location_ids
      .map((_, index) => `@locationId${index}`)
      .join(',');

    // const countQuery = `
    //     SELECT COUNT(*) AS total
    //     FROM Procedures
    //     INNER JOIN Locations ON ClaimsTracking.location_id = Locations.uid
    //     WHERE Locations.customer_id = @customerId
    //       AND ClaimsTracking.location_id IN (${locationIdPlaceholders})
    //       AND ${filterConditions};
    // `;

    const countQuery = ``;

    const request = this.pool.request();

    request.input('customerId', sql.VarChar, customer_id);

    location_ids.forEach((id, index) =>
      request.input(`locationId${index}`, sql.Int, id),
    );

    const result = await request.query(countQuery);

    return result.recordset[0].total; // Assumes there is always at least one row in the result
  }

  private buildFilterConditions(filters: any): { conditions: string; applyParams: (request: sql.Request) => void } {
    const params: Array<{ name: string; type: any; value: any }> = [];
    let filterConditions = '';

    const addCondition = (condition: string) => {
      filterConditions += ` ${condition}`;
    };

    // Aging filter - uses hardcoded DATEDIFF ranges, safe from injection
    if (filters.aging && filters.aging.toLowerCase() !== 'all') {
      addCondition(
        `AND ISNUMERIC(DATEDIFF(DAY, p.date_of_service, GETDATE())) = 1`,
      );
      switch (filters.aging) {
        case '0-30':
          addCondition(`AND DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 0 AND 30`);
          break;
        case '31-60':
          addCondition(`AND DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 31 AND 60`);
          break;
        case '61-90':
          addCondition(`AND DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 61 AND 90`);
          break;
        case '91-120':
          addCondition(`AND DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 91 AND 120`);
          break;
        case '121-150':
          addCondition(`AND DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 121 AND 150`);
          break;
        case '151-180':
          addCondition(`AND DATEDIFF(DAY, p.date_of_service, GETDATE()) BETWEEN 151 AND 180`);
          break;
        case '180+':
          addCondition(`AND DATEDIFF(DAY, p.date_of_service, GETDATE()) > 180`);
          break;
      }
    }

    // Location filter
    if (filters.location && filters.location.toLowerCase() !== 'all') {
      addCondition(`AND p.location = @fLocation`);
      params.push({ name: 'fLocation', type: sql.NVarChar(500), value: filters.location });
    }

    // Provider filter
    if (filters.provider && filters.provider.toLowerCase() !== 'all') {
      addCondition(`AND p.provider = @fProvider`);
      params.push({ name: 'fProvider', type: sql.NVarChar(500), value: filters.provider });
    }

    // Query filter (search-like functionality)
    if (filters.query && filters.query !== 'all') {
      addCondition(`AND (p.patient = @fQuery OR p.claim_id = @fQuery OR p.payer = @fQuery OR p.provider = @fQuery)`);
      params.push({ name: 'fQuery', type: sql.NVarChar(500), value: filters.query });
    }

    // Payer filter
    if (filters.payer && filters.payer.toLowerCase() !== 'all') {
      addCondition(`AND p.payer = @fPayer`);
      params.push({ name: 'fPayer', type: sql.NVarChar(500), value: filters.payer });
    }

    // Payment received date range
    if (
      filters.payment_received?.start_date ||
      filters.payment_received?.end_date
    ) {
      /* istanbul ignore next */
      const startDate = filters.payment_received?.start_date?.trim();
      /* istanbul ignore next */
      const endDate = filters.payment_received?.end_date?.trim();

      if (startDate && endDate) {
        addCondition(`AND p.payment_date BETWEEN @fPayStart AND @fPayEnd`);
        params.push({ name: 'fPayStart', type: sql.DateTime, value: startDate });
        params.push({ name: 'fPayEnd', type: sql.DateTime, value: `${endDate} 23:59:59` });
      } else if (startDate) {
        addCondition(`AND p.payment_date >= @fPayStart`);
        params.push({ name: 'fPayStart', type: sql.DateTime, value: startDate });
      } else if (endDate) {
        addCondition(`AND p.payment_date <= @fPayEnd`);
        params.push({ name: 'fPayEnd', type: sql.DateTime, value: `${endDate} 23:59:59` });
      }
    }

    // Date of service range
    if (
      filters.date_of_service?.start_date ||
      filters.date_of_service?.end_date
    ) {
      /* istanbul ignore next */
      const startDate = filters.date_of_service?.start_date?.trim();
      /* istanbul ignore next */
      const endDate = filters.date_of_service?.end_date?.trim();

      if (startDate && endDate) {
        addCondition(`AND p.date_of_service BETWEEN @fDosStart AND @fDosEnd`);
        params.push({ name: 'fDosStart', type: sql.DateTime, value: startDate });
        params.push({ name: 'fDosEnd', type: sql.DateTime, value: `${endDate} 23:59:59` });
      } else if (startDate) {
        addCondition(`AND p.date_of_service >= @fDosStart`);
        params.push({ name: 'fDosStart', type: sql.DateTime, value: startDate });
      } else if (endDate) {
        addCondition(`AND p.date_of_service <= @fDosEnd`);
        params.push({ name: 'fDosEnd', type: sql.DateTime, value: `${endDate} 23:59:59` });
      }
    }

    // CPT group filter
    if (filters.cpt_group && filters.cpt_group.toLowerCase() !== 'all') {
      addCondition(`AND p.cpt_category_id = @fCptGroup`);
      params.push({ name: 'fCptGroup', type: sql.NVarChar(100), value: filters.cpt_group });
    }

    // AR balance range - uses hardcoded numeric ranges, safe from injection
    if (filters.ar_balance && filters.ar_balance.toLowerCase() !== 'all') {
      addCondition(`AND ISNUMERIC(p.ar_balance) = 1`);
      switch (filters.ar_balance) {
        case 'Over $500':
          addCondition(`AND CAST(p.ar_balance AS FLOAT) > 500`);
          break;
        case '$400-$499':
          addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 400 AND 499`);
          break;
        case '$300-$399':
          addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 300 AND 399`);
          break;
        case '$200-$299':
          addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 200 AND 299`);
          break;
        case '$100-$199':
          addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 100 AND 199`);
          break;
        case '$50-$99':
          addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 50 AND 99`);
          break;
        case '$0-$49':
          addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 0 AND 49`);
          break;
      }
    }

    return {
      conditions: filterConditions,
      applyParams: (request: sql.Request) => {
        params.forEach(p => request.input(p.name, p.type, p.value));
      },
    };
  }

  private columnMap: { [key: string]: string } = {
    name: 'location_name',
    charges: 'total_submitted',
    insuranceBilled: 'insurance_billed',
    insuranceCollections: 'insurance_collections',
    patientCollections: 'patient_collections',
    grossCollections: 'gross_collections',
    collectionRate: 'collection_rate',
    adjustment: 'Adjustment',
    refund: 'Refunded',
  };

  private columnMapARAndCollections: { [key: string]: string } = {
    name: 'location_name',
    totalCollections: 'total_submitted',
    patientCollections: 'patient_collections',
    insuranceCollections: 'insurance_collections',
    grossCollections: 'gross_collections',
    collectionAdjustment: 'collection_adjustment',
    productionDollarPerHour: 'production_dollar_per_hour',
    ARBalance: 'ar_balance',
  };

  private buildOrderByClauseAdvanced(
    sort: { column: string; direction: 'ASC' | 'DESC' },
    validColumns: string[],
  ): string {
    // Check if sort object is valid
    if (!sort || !sort.column || !sort.direction) {
      return ''; // Default: No sorting
    }

    // Map user-facing column to database column
    const dbColumn = this.columnMap[sort.column];

    // Validate the mapped column
    if (!dbColumn || !validColumns.includes(sort.column)) {
      throw new Error(`Invalid sort column: ${sort.column}`);
    }

    // Sanitize the direction
    const direction = sort.direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    return `ORDER BY ${dbColumn} ${direction}`;
  }

  private buildOrderByClause(sort: any): string {
    let orderByClause = 'ORDER BY p.claim_id ASC'; // Default order

    /* istanbul ignore next */
    if (sort?.column && sort?.direction) {
      const direction = sort.direction === 'desc' ? 'DESC' : 'ASC';
      if (
        [
          'insurance_paid',
          'contracted',
          'submitted',
          'total_paid',
          'patient_paid',
          'ar_balance',
        ].includes(sort.column)
      ) {
        // Numeric sorting for financial columns
        orderByClause = `ORDER BY CAST(p.${sort.column} AS FLOAT) ${direction}`;
      } else if (
        [
          'code',
          'payer',
          'patient',
          'provider',
          'location',
          'date_of_service',
          'cpt_categort_id',
          'carc',
        ].includes(sort.column)
      ) {
        // Standard sorting for string columns
        orderByClause = `ORDER BY p.${sort.column} ${direction}`;
      }
    }

    return orderByClause;
  }

  /**
   * Helper method to check if a value is a positive integer.
   * @param value - The value to check.
   * @returns boolean indicating if the value is a positive integer.
   */
  private isPositiveInteger(value: string | number | undefined): boolean {
    const num = Number(value);
    return Number.isInteger(num) && num > 0;
  }

  private formatToDollarAbbreviation(amount: number): string {
    if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(1)}M`;
    } else if (amount >= 1_000) {
      return `$${(amount / 1_000).toFixed(1)}K`;
    } else {
      return `$${amount.toFixed(2)}`;
    }
  }
}

export const proceduresController = new ProceduresController();
