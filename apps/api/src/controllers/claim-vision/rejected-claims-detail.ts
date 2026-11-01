import { Request, Response } from 'express';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import sql from 'mssql';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class ClaimVisionDetail extends DatabaseConnectionController {
  constructor() {
    super();
  }
  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ruleId = (req.query.ruleId as string) || null;
      const batchWeekStart = (req.query.batchWeekStart as string) || null;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? `AND EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = rcw.ClaimID AND c_cust.customer_id = @_custId)`
        : '';

      const request = this.pool.request();
      request.input('p_ruleId', sql.NVarChar, ruleId);
      request.input('p_batchWeekStart', sql.NVarChar, batchWeekStart);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const query = `
      DECLARE @RuleID nvarchar(50) = @p_ruleId;
      DECLARE @BatchWeekStart date = @p_batchWeekStart;

      -- If no batch week provided, default to most recent
      IF @BatchWeekStart IS NULL
      BEGIN
        SELECT
            @BatchWeekStart =
                DATEADD(
                    day,
                    1 - DATEPART(weekday, DATEADD(day, @@DATEFIRST - 1, MAX(CreateDate))),
                    CAST(MAX(CreateDate) AS date)
                )
        FROM dbo.rejectedclaims
        WHERE (@RuleID IS NULL OR RuleID = @RuleID);
      END

      -- If no rule provided, default to first rule in that batch week
      IF @RuleID IS NULL
      BEGIN
        SELECT TOP 1 @RuleID = rc.RuleID
        FROM dbo.rejectedclaims rc
        WHERE DATEADD(
                  day,
                  1 - DATEPART(weekday, DATEADD(day, @@DATEFIRST - 1, rc.CreateDate)),
                  CAST(rc.CreateDate AS date)
              ) = @BatchWeekStart
        ORDER BY rc.RuleID;
      END

      ;WITH rc_w AS (
          SELECT
              rc.RejectedClaimID,
              rc.ClaimID,
              rc.RuleID,
              rc.CreateDate,
              rc.customer_id,
              COALESCE(rc.Status, 'Not complete') AS Status,
              DATEADD(
                  day,
                  1 - DATEPART(weekday, DATEADD(day, @@DATEFIRST - 1, rc.CreateDate)),
                  CAST(rc.CreateDate AS date)
              ) AS BatchWeekStart
          FROM dbo.rejectedclaims rc
      ),
      detail AS (
          SELECT
              rcw.RejectedClaimID,
              rcw.ClaimID,
              rcw.Status,
              c.ClaimSubmittedDate                                     AS SubmittedDate,
              c.DateOfService,
              ISNULL(c.ChargeAmt, 0)                                   AS ChargeAmt,
              ISNULL(c.ChargeAmt, 0) - ISNULL(c.InsPayAmt, 0)         AS InsuranceBalance,
              ISNULL(DATEDIFF(DAY, c.ClaimSubmittedDate, CAST(GETDATE() AS date)), 0) AS AgingDays,
              LTRIM(RTRIM(COALESCE(pt.firstname, ''))) + ' ' + LTRIM(RTRIM(COALESCE(pt.lastname, ''))) AS PatientName,
              COALESCE(p.InsuranceName, p.payer)                       AS PayerName,
              rcw.CreateDate                                           AS RejectedDate,
              r.RuleName,
              r.Description                                            AS RejectionMessage,
              r.CreatedBy                                              AS RejectedBy,
              rcw.BatchWeekStart,
              ROW_NUMBER() OVER (ORDER BY rcw.CreateDate DESC, rcw.RejectedClaimID) AS Priority
          FROM rc_w rcw
          JOIN dbo.rules r
            ON r.RuleID = rcw.RuleID
           AND (r.customer_id = rcw.customer_id OR r.customer_id IS NULL OR rcw.customer_id IS NULL)
          LEFT JOIN dbo.claims c
            ON c.ClaimID = rcw.ClaimID
          LEFT JOIN dbo.patient pt
            ON pt.PatientID = c.PatientID
          LEFT JOIN dbo.payer p
            ON p.PayerID = c.PayerID
          WHERE
              rcw.RuleID = @RuleID
              AND rcw.BatchWeekStart = @BatchWeekStart
              ${custFilter}
      )
      SELECT
          RejectedClaimID                    AS [RejectedClaimID],
          Priority                           AS [Priority],
          PatientName                        AS [Patient],
          SubmittedDate                      AS [Submitted Date],
          DateOfService                      AS [Date Of Service],
          PayerName                          AS [Payer],
          ChargeAmt                          AS [Charge Amount],
          InsuranceBalance                   AS [Insurance Balance],
          AgingDays                          AS [Aging Days],
          Status                             AS [Status],
          ClaimID                            AS [ClaimID],
          RejectionMessage                   AS [Rejection Message],
          RejectedBy                         AS [Rejected by],
          BatchWeekStart                     AS [Batch Week Start]
      FROM detail
      ORDER BY
          Priority ASC,
          SubmittedDate DESC,
          ClaimID;
      `;

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Rejected claims detail',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('RejectedClaimsDetail.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
