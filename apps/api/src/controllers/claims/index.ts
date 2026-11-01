import { Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';
export interface RequestObject {
  customer_id: number | string;
  location_ids: number[] | string[];
  page?: number;
  limit?: number;
  filters?: {};
  sort?: {};
  archived?: number;
}
/**
 * Interface representing the structure of the claims data returned from the API.
 *
 * @interface ClaimsDto
 *
 * @property {string} uid - The unique identifier for the claim.
 * @property {string} location_id - The ID of the location associated with the claim.
 * @property {string} patient_first_name - The first name of the patient.
 * @property {string} patient_last_name - The last name of the patient.
 * @property {string} patient_date_of_birth - The date of birth of the patient
 * @property {string} provider_first_name - The first name of the dental provider associated with the claim.
 * @property {string} provider_last_name - The last name of the dental provider associated with the claim.
 * @property {string} subscriber_id - The ID of the subscriber
 * @property {string} subscriber_first_name - The first name of the subscriber.
 * @property {string} subscriber_last_name - The last name of the subscriber.
 * @property {string} payer - The insurance payer/provider responsible for paying the claim.
 * @property {string} date_of_service - The date of service associated with the claim.
 * @property {string} total_dollar_value - The total submitted dollar value of the claim that the insurance company will pay.
 * @property {string} total_contracted - The total contracted dollar value of the claim.
 * @property {string} total_deductible - The total deductible amount.
 * @property {string} total_copay - The total copay amount.
 * @property {string} total_coinsurance - The total coinsurance amount.
 * @property {string} total_pi_reduction - The total PI reduction amount.
 * @property {string} total_patient_responsibility - The total patient responsibility amount.
 * @property {string} total_adjustments - The total adjustments amount.
 * @property {string} total_insurance_paid - The total insurance paid amount.
 * @property {string} total_patient_paid - The total patient paid amount.
 * @property {string} total_write_off - The total write-off amount.
 * @property {string} progress - The progress of the claim. Returns `null` if progress is not available.
 * @property {string} assigned_user_first_name - The first name of the assigned user responsible for the claim.
 * @property {string} assigned_user_last_name - The last name of the assigned user responsible for the claim.
 * @property {string} assigned_user_email - The email of the assigned user responsible for the claim.
 * @property {string} assigned_user_avatar_image_url - The avatar image URL of the assigned user responsible for the claim.
 * @property {number} archived - Indicates whether the claim is archived (0 for not archived, 1 for archived).
 * @property {string} carc - The CARC (Claim Adjustment Reason Code) for the claim.
 * @property {string} eft - The Electronic Funds Transfer (EFT) number for the claim.
 * @property {string} check_number - The check number associated with the claim.
 * @property {string} status - The status of the claim.
 * @property {string} payment_date - date of the service
 */
export interface ClaimsDto {
  uid: string;
  location_id: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_date_of_birth: string;
  provider_first_name: string;
  provider_last_name: string;
  subscriber_id: string;
  subscriber_first_name: string;
  subscriber_last_name: string;
  payer: string;
  date_of_service: string;
  date_submitted: string;
  total_dollar_value: string | number;
  total_contracted: string;
  total_deductible: string;
  total_copay: string;
  total_coinsurance: string;
  total_pi_reduction: string;
  total_patient_responsibility: string;
  total_adjustments: string;
  total_insurance_paid: string;
  total_patient_paid: string;
  total_write_off: string;
  progress: string;
  assigned_user_first_name: string;
  assigned_user_last_name: string;
  assigned_user_email: string;
  assigned_user_avatar_image_url: string;
  archived: number;
  carc: string;
  eft: string;
  check_number: string;
  status: string;
  payment_date?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Awaiting Payor Response
 * - Has a date of service, subscriber information, and total dollar value. Insurance paid is null (not zer), no CARC code
 *
 * Denied Rejected
 * - status has not been recorded, has a CARC code (excluding custom carcs) and number value for insurance paid
 *
 * NCOF
 * - no submitted date
 *
 * Underpayment
 * Total submitted value  is greater than insurance paid with no CARC code
 */

export class ClaimsController {
  private pool: sql.ConnectionPool;

  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
    this.get = this.get.bind(this);
    this.updateClaimStatusOverAPI = this.updateClaimStatusOverAPI.bind(this);
    this.handleError = this.handleError.bind(this); // Bind handleError
  }

  public async get(req: Request, res: Response): Promise<void> {
    /**
     * Handles the retrieval of claims based on customer ID, location IDs, and other filtering parameters.
     *
     * @param {Request} req - The request object containing the body with the following parameters:
     *  @param {number} req.body.customer_id - The ID of the customer (must be a number).
     *  @param {number[]} req.body.location_ids - An array of location IDs to filter claims (must be a non-empty array).
     *  @param {number} [req.body.page=1] - The page number for pagination (default is 1).
     *  @param {number} [req.body.limit=10] - The number of records per page for pagination (default is 10).
     *  @param {Object} [req.body.filters={}] - Additional filter conditions to apply.
     *  @param {Object} [req.body.sort={}] - Sorting options for the claims data.
     *  @param {number} [req.body.archived=0] - Indicator to include archived claims (default is 0).
     *
     * @param {Response} res - The response object to send the result or errors.
     *
     * @returns {Promise<void>} Sends a JSON response with the claims data, payers list, and pagination details,
     * or an error message if validation fails or an exception occurs.
     *
     * @throws {Error} Returns an error response with status 400 for invalid parameters or 500 for internal server errors.
     *
     * @example
     * // Example request body
     * {
     *   "customer_id": 123,
     *   "location_ids": [1, 2, 3],
     *   "page": 1,
     *   "limit": 20,
     *   "filters": { "status": "Approved" },
     *   "sort": { "date_submitted": "desc" },
     *   "archived": 0
     * }
     *
     * // Example response
     * {
     *   "claims": [...],
     *   "payers": [...],
     *   "pagination": {
     *     "currentPage": 1,
     *     "pageSize": 20,
     *     "totalRecords": 100
     *   }
     * }
     */
    const {
      customer_id,
      location_ids,
      page = 1,
      limit = 10,
      filters = {},
      sort = {},
      archived = 0,
      expired_days,
    } = req.body;

    if (!Array.isArray(location_ids) || location_ids.length === 0) {
      res.status(400).json({
        message: 'Invalid parameters. Provide a non-empty array of location IDs.',
      });
      return;
    }

    if (typeof customer_id !== 'number') {
      res.status(400).json({
        message: 'Invalid parameters. Expecting a valid customer ID as a number.',
      });
      return;
    }

    const pageNumber = page;
    const pageSize = limit;
    const offset = (pageNumber - 1) * pageSize;

    try {
      // Convert expired_days (fraction of a day) to minutes
      const minutesThreshold = expired_days ? expired_days * 1440 : 3; // 1 day = 1440 minutes

      console.log(
        chalk.blue(
          `Checking for claims last updated more than ${minutesThreshold.toFixed(0)} minutes ago.`,
        ),
      );

      // Count total records and fetch claims
      const filter = this.buildFilterConditions(filters, archived);

      const totalRecords = await this.countFilteredClaims(
        customer_id.toString(),
        location_ids,
        filter,
      );

      // Fetch claims
      const claims = await this.fetchClaims(
        customer_id.toString(),
        location_ids,
        filter,
        this.buildOrderByClause(sort),
        0,
        totalRecords,
      );

      const currentDate = new Date();
      const expiredDaysInMs = minutesThreshold * 60 * 1000; // Convert minutes to milliseconds

      // Separate pending claims based on expired_days
      const pendingClaims = [];
      const otherClaims = [];

      for (const claim of claims) {
        const updatedAt = claim.updated_at ? new Date(claim.updated_at) : null;
        const isPending = claim.status === 'Pending';
        const isWithinExpiredDays =
          isPending &&
          (!updatedAt ||
            currentDate.getTime() - updatedAt.getTime() < expiredDaysInMs);

        if (isPending && isWithinExpiredDays) {
          //ts-expect-error - tech debt
          pendingClaims.push(claim); // Push to pending list only if within expired days
        } else {
          //ts-expect-error - tech debt
          otherClaims.push(claim); // Otherwise, treat like all other claims
        }
      }

      // Combine non-pending claims first, followed by pending claims
      const sortedClaims = [...otherClaims, ...pendingClaims];

      // Paginate the sorted claims
      const paginatedClaims = sortedClaims.slice(offset, offset + pageSize);

      // Fetch payers
      const payers = await this.fetchPayers(location_ids, archived);

      // SLOW
      // for (const claim of paginatedClaims)
      // {
      //     const newStatus = await this.determineNewStatus(claim);
      //     await this.updateClaimStatus(claim.uid, newStatus);
      //     claim.status = newStatus; // Update the status in the local object to return the updated status
      // }

      res.status(200).json({
        claims: paginatedClaims,
        payers, // Include the distinct list of payers in the response
        pagination: {
          currentPage: pageNumber,
          pageSize,
          totalRecords,
        },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }
  public async updateClaimStatusOverAPI(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { claim_id, status } = req.body;

    console.log(chalk.blue('Received request to update claim status over API'));
    console.log(chalk.green('Claim ID:'), claim_id);
    console.log(chalk.green('Status:'), status);

    if (!claim_id) {
      console.log(chalk.red('Error: Missing claim ID'));
      res.status(400).json({ message: 'Missing claim ID' });
      return;
    }

    if (!status) {
      console.log(chalk.red('Error: Missing status'));
      res.status(400).json({ message: 'Missing status' });
      return;
    }

    try {
      console.log(
        chalk.yellow('Attempting to update claim status in the database...'),
      );
      await this.updateClaimStatus(claim_id, status);
      await this.updateUpdatedAt(claim_id);
      console.log(chalk.green('Claim status updated successfully'));

      res.status(200).json({ message: 'Claim status updated successfully' });
    } catch (error) {
      console.log(chalk.red('Error updating claim status:', error));
      this.handleError(res, error);
    }
  }
  private async countFilteredClaims(
    customer_id: string,
    location_ids: string[],
    filter: { conditions: string; applyParams: (request: sql.Request) => void },
  ): Promise<number> {
    const locationIdPlaceholders = location_ids
      .map((_, index) => `@locationId${index}`)
      .join(',');
    const countQuery = `
            SELECT COUNT(*) AS total
            FROM ClaimsTracking
            INNER JOIN Locations ON ClaimsTracking.location_id = Locations.uid
            WHERE Locations.customer_id = @customerId
              AND ClaimsTracking.location_id IN (${locationIdPlaceholders})
              AND ${filter.conditions};
        `;
    const request = this.pool.request();
    request.input('customerId', sql.VarChar, customer_id);
    location_ids.forEach((id, index) => {
      request.input(`locationId${index}`, sql.Int, id);
    });
    filter.applyParams(request);

    const result = await request.query(countQuery);
    return result.recordset[0]?.total ?? 0;
  }
  private async fetchClaims(
    customer_id: string,
    location_ids: string[],
    filter: { conditions: string; applyParams: (request: sql.Request) => void },
    orderByClause: string,
    offset: number,
    pageSize: number,
  ): Promise<ClaimsDto[]> {
    console.log('Location IDs: ', location_ids);

    // Prepare the location ID placeholders for the SQL IN clause
    const locationIdPlaceholders = location_ids
      .map((_, index) => `@locationId${index}`)
      .join(',');

    const query = `
            SELECT 
                ClaimsTracking.uid,
                ClaimsTracking.location_id,
                ClaimsTracking.patient_first_name_837 AS patient_first_name,
                ClaimsTracking.patient_last_name_837 AS patient_last_name,
                ClaimsTracking.patient_birthdate AS patient_date_of_birth,
                ClaimsTracking.first_name_837 AS provider_first_name,
                ClaimsTracking.last_name_837 AS provider_last_name,
                ClaimsTracking.subscriber_id AS subscriber_id,
                ClaimsTracking.subscriber_first_name AS subscriber_first_name,
                ClaimsTracking.subscriber_last_name AS subscriber_last_name,
                ClaimsTracking.payer_837 AS payer,
                ClaimsTracking.date_of_service_837 AS date_of_service,
                ClaimsTracking.date_submitted,
                ClaimsTracking.total_dollar_value,
                ClaimsTracking.total_contracted,
                ClaimsTracking.total_deductible,
                ClaimsTracking.total_copay,
                ClaimsTracking.total_coinsurance,
                ClaimsTracking.total_pi_reduction,
                ClaimsTracking.total_patient_responsibility,
                ClaimsTracking.total_adjustments,
                ClaimsTracking.total_insurance_paid,
                ClaimsTracking.total_patient_paid,
                ClaimsTracking.total_write_off,
                ClaimsTracking.assigned_user_first_name,
                ClaimsTracking.assigned_user_last_name,
                ClaimsTracking.assigned_user_email,
                ClaimsTracking.assigned_user_avatar_image_url,
                COALESCE(ClaimsTracking.archived, 0) AS archived,
                COALESCE(ClaimsTracking.progress, NULL) AS progress,
                ClaimsTracking.carc,
                ClaimsTracking.eft,
                ClaimsTracking.check_number,
                ClaimsTracking.status,
                ClaimsTracking.payment_date,
                ClaimsTracking.created_at,
                ClaimsTracking.updated_at
            FROM ClaimsTracking
            INNER JOIN Locations ON ClaimsTracking.location_id = Locations.uid
            WHERE Locations.customer_id = @customerId
              AND ClaimsTracking.location_id IN (${locationIdPlaceholders})
              AND ${filter.conditions}
            ${orderByClause}
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `;
    const request = this.pool.request();
    request.input('customerId', sql.VarChar, customer_id);
    location_ids.forEach((id, index) => {
      // Ensure each location ID is added as an integer parameter
      request.input(`locationId${index}`, sql.Int, id);
    });
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, pageSize);
    filter.applyParams(request);

    try {
      const result = await request.query(query);
      return result.recordset as ClaimsDto[];
    } catch (error) {
      console.error('Failed to fetch claims:', error);
      throw error;
    }
  }
  private async fetchPayers(
    location_ids: string[],
    archived: number,
  ): Promise<string[]> {
    const payersQuery = `
            SELECT DISTINCT payer_837 AS payer
            FROM ClaimsTracking
            WHERE location_id IN (${location_ids.map((_, index) => `@locationId${index}`).join(',')})
            AND archived = @archived
        `;

    const payersRequest = this.pool.request();
    location_ids.forEach((id, index) => {
      payersRequest.input(`locationId${index}`, sql.Int, id);
    });
    payersRequest.input('archived', sql.Int, archived);

    try {
      const payersResult = await payersRequest.query(payersQuery);
      return payersResult.recordset.map((record) => record.payer);
    } catch (error) {
      console.error('Failed to fetch payers:', error);
      throw error; // Re-throwing the error to handle it appropriately in the calling context
    }
  }
  private buildFilterConditions(filters: any, archived: number): { conditions: string; applyParams: (request: sql.Request) => void } {
    const params: Array<{ name: string; type: any; value: any }> = [];
    let filterConditions = 'ClaimsTracking.archived = @fArchived';
    params.push({ name: 'fArchived', type: sql.Int, value: archived });

    if (filters.query && filters.query !== 'all') {
      filterConditions += ` AND (ClaimsTracking.patient_first_name_837 LIKE @fQuery OR ClaimsTracking.patient_last_name_837 LIKE @fQuery OR ClaimsTracking.uid LIKE @fQuery OR ClaimsTracking.eft LIKE @fQuery OR ClaimsTracking.check_number LIKE @fQuery)`;
      params.push({ name: 'fQuery', type: sql.NVarChar(500), value: `%${filters.query}%` });
    }
    if (filters.payer && filters.payer !== 'all') {
      filterConditions += ` AND ClaimsTracking.payer_837 LIKE @fPayer`;
      params.push({ name: 'fPayer', type: sql.NVarChar(500), value: `%${filters.payer}%` });
    }
    if (filters.issue_type && filters.issue_type !== 'all') {
      filterConditions += ` AND ClaimsTracking.status = @fIssueType`;
      params.push({ name: 'fIssueType', type: sql.NVarChar(100), value: filters.issue_type });
    }
    if (filters.total_dollar_value && filters.total_dollar_value !== 'all') {
      filterConditions += ` AND ClaimsTracking.total_dollar_value = @fDollarVal`;
      params.push({ name: 'fDollarVal', type: sql.Float, value: parseFloat(filters.total_dollar_value) || 0 });
    }
    if (filters.aging && filters.aging !== 'all') {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      let daysAgo90 = new Date(currentDate);
      daysAgo90.setDate(daysAgo90.getDate() - 90);
      let daysAgo60 = new Date(currentDate);
      daysAgo60.setDate(daysAgo60.getDate() - 60);
      let daysAgo30 = new Date(currentDate);
      daysAgo30.setDate(daysAgo30.getDate() - 30);

      switch (filters.aging) {
        case '0-30':
          filterConditions += ` AND ClaimsTracking.date_of_service_837 >= @fAgingDate1`;
          params.push({ name: 'fAgingDate1', type: sql.Date, value: daysAgo30 });
          break;
        case '30-60':
          filterConditions += ` AND ClaimsTracking.date_of_service_837 BETWEEN @fAgingDate1 AND @fAgingDate2`;
          params.push({ name: 'fAgingDate1', type: sql.Date, value: daysAgo60 });
          params.push({ name: 'fAgingDate2', type: sql.Date, value: daysAgo30 });
          break;
        case '60-90':
          filterConditions += ` AND ClaimsTracking.date_of_service_837 BETWEEN @fAgingDate1 AND @fAgingDate2`;
          params.push({ name: 'fAgingDate1', type: sql.Date, value: daysAgo90 });
          params.push({ name: 'fAgingDate2', type: sql.Date, value: daysAgo60 });
          break;
        case '90+':
          filterConditions += ` AND ClaimsTracking.date_of_service_837 < @fAgingDate1`;
          params.push({ name: 'fAgingDate1', type: sql.Date, value: daysAgo90 });
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
  private buildOrderByClause(sort: any): string {
    let orderByClause = 'ORDER BY ClaimsTracking.uid ASC'; // Default order
    if (
      sort.column &&
      [
        'patient_first_name',
        'patient_last_name',
        'payer',
        'date_of_service',
        'total_dollar_value',
        'status',
      ].includes(sort.column)
    ) {
      const direction = sort.direction === 'desc' ? 'DESC' : 'ASC';
      if (sort.column === 'total_dollar_value') {
        // Ensure numeric sorting by casting the column as FLOAT
        orderByClause = `ORDER BY CAST(ClaimsTracking.total_dollar_value AS FLOAT) ${direction}`;
      } else if (sort.column === 'status') {
        // Sorting by status without casting
        orderByClause = `ORDER BY ClaimsTracking.status ${direction}`;
      } else {
        // Regular sorting for other columns that include _837 suffix
        orderByClause = `ORDER BY ClaimsTracking.${sort.column}_837 ${direction}`;
      }
    }
    return orderByClause;
  }
  public async updateClaimStatus(
    pClaimId: string,
    pStatus: string,
  ): Promise<void> {
    // Step 1: Retrieve the current status of the claim
    const checkStatusQuery = `
            SELECT status
            FROM ClaimsTracking
            WHERE uid = @uid;
        `;
    const request = this.pool.request();
    request.input('uid', sql.VarChar, pClaimId);

    try {
      const result = await request.query(checkStatusQuery);
      const currentStatus = result.recordset[0]?.status;

      console.log(
        chalk.blue(`Current status of claim ID ${pClaimId}: ${currentStatus}`),
      );

      // // Step 2: Check if the status is "PENDING" or "Pending" and prevent update if so
      // if (currentStatus?.toUpperCase() === "PENDING") {
      //     console.log(chalk.yellow(`Claim ID ${pClaimId} status is already PENDING. Update aborted.`));
      //     return;
      // }

      // Step 3: Proceed with the update if status is not "PENDING"
      const updateQuery = `
                UPDATE ClaimsTracking
                SET status = @status
                WHERE uid = @uid;
            `;
      const updateRequest = this.pool.request();
      updateRequest.input('uid', sql.VarChar, pClaimId);
      updateRequest.input('status', sql.VarChar, pStatus);

      await updateRequest.query(updateQuery);

      console.log(
        chalk.green(`Claim ID ${pClaimId} status updated to: ${pStatus}`),
      );
    } catch (error) {
      console.log(
        chalk.red(`Error updating status for claim ID ${pClaimId}:`, error),
      );
      throw error;
    }
  }
  /* istanbul ignore next */
  private async anyProceduresHaveCarc(claimUid: string): Promise<boolean> {
    const query = `
            SELECT COUNT(*) AS count
            FROM Procedures
            WHERE claim_id = @claimId AND NULLIF(carc, '') IS NOT NULL;
        `;

    try {
      const request = this.pool.request();
      request.input('claimId', sql.VarChar, claimUid); // Use the appropriate type for claim_id

      const result = await request.query(query);
      const count = result.recordset[0].count;

      console.log(
        chalk.blue(
          `Procedure query for claim UID: ${claimUid} returned count: ${count}`,
        ),
      );

      return count > 0; // If count is greater than 0, it means there are procedures with a non-null CARC
    } catch (error) {
      console.error(
        chalk.red(
          `Error querying procedures for claim UID ${claimUid}:`,
          error,
        ),
      );
      return false; // In case of error, return false (consider error handling as per application needs)
    }
  }
  /* istanbul ignore next */
  private async determineNewStatus(claim: ClaimsDto): Promise<string> {
    /** The total amount billed to the insurance company*/
    const IS_SUBMITTED: boolean = !!claim.date_submitted;
    const STATUS = claim.status?.toUpperCase() ?? '--';
    const HAS_CARC: boolean = !!claim.carc && claim.carc.trim() !== '';
    const DID_INSURANCE_PAY = claim.total_insurance_paid?.trim() !== '';
    const ANY_PROCEDURES_HAVE_CARC = await this.anyProceduresHaveCarc(
      claim.uid,
    );
    const IS_ARCHIVED = claim.archived === 1;
    const CHARGED = parseFloat(claim.total_dollar_value as string) || 0;
    const CONTRACTED = parseFloat(claim.total_contracted as string) || 0;
    const INSURANCE_PAID =
      parseFloat(claim.total_insurance_paid as string) || 0;

    console.log(
      `Does CLAIM ID: ${claim.uid} have carc on the claim level?; ${HAS_CARC ? 'Yes' : 'No'}`,
    );
    console.log(
      `Does CLAIM ID: ${claim.uid} have carc on the procedure?; ${ANY_PROCEDURES_HAVE_CARC ? 'Yes' : 'No'}`,
    );
    // Handle the fixed status "PENDING" first
    if (STATUS === 'PENDING') {
      return 'Pending';
    }

    // Define business rules as prioritized checks
    if (
      IS_SUBMITTED &&
      !HAS_CARC &&
      !ANY_PROCEDURES_HAVE_CARC &&
      !DID_INSURANCE_PAY
    ) {
      console.log(
        chalk.yellow(`Claim UID: ${claim.uid} is awaiting payor response.`),
      );
      return 'Awaiting Payor Response';
    }

    if (CHARGED > INSURANCE_PAID && (HAS_CARC || ANY_PROCEDURES_HAVE_CARC)) {
      console.log(
        chalk.red(`Claim UID: ${claim.uid} has been denied/rejected.`),
      );
      return 'Denied/Rejected';
    }

    if (!IS_SUBMITTED) {
      console.log(
        chalk.yellow(`Claim UID: ${claim.uid} has no claim on file.`),
      );
      return 'NCOF';
    }

    if (
      INSURANCE_PAID < CONTRACTED &&
      (!HAS_CARC ||
        !ANY_PROCEDURES_HAVE_CARC ||
        !['SE-01', 'SE-02'].includes(claim.carc))
    ) {
      console.log(chalk.red(`Claim UID: ${claim.uid} has been underpaid.`));
      return 'Underpayment';
    }

    if (claim.progress === '100' && IS_ARCHIVED) {
      console.log(chalk.blue(`Claim UID: ${claim.uid} is pending review.`));
      return 'Pending';
    }

    if (
      INSURANCE_PAID === CONTRACTED &&
      !ANY_PROCEDURES_HAVE_CARC &&
      !DID_INSURANCE_PAY
    ) {
      console.log(chalk.yellow(`Claim UID: ${claim.uid} has been recovered.`));
      return 'Recovered';
    }

    console.log(
      chalk.yellow(`Claim UID: ${claim.uid} status is not determined.`),
    );
    return 'Other'; // Default fallback
  }
  private async updateUpdatedAt(pClaimId: string): Promise<void> {
    // Step 1: Construct the query to update the updated_at column
    const updateQuery = `
            UPDATE ClaimsTracking
            SET updated_at = @updatedAt
            WHERE uid = @uid;
        `;

    const request = this.pool.request();
    const now = new Date(); // Current timestamp

    // Step 2: Add input parameters
    request.input('uid', sql.VarChar, pClaimId);
    request.input('updatedAt', sql.DateTime, now);

    try {
      // Step 3: Execute the query
      await request.query(updateQuery);
      console.log(
        chalk.green(
          `Updated updated_at for claim ID ${pClaimId} to ${now.toISOString()}`,
        ),
      );
    } catch (error) {
      console.log(
        chalk.red(`Error updating updated_at for claim ID ${pClaimId}:`, error),
      );
      throw error;
    }
  }
  private handleError(res: Response, error: any, service?: string): void {
    console.error(`Error in ${service}: ${error.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export const claimsController = new ClaimsController();
