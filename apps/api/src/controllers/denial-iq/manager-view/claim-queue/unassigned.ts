import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildScopeFilter } from '../../../../utils/resolve-user-scope';
import { parsePagination, applyPagination } from '../../../../utils/pagination';

export class Unassigned extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);
      const scopeFilter = buildScopeFilter(scope, 'c');
      const pagination = parsePagination(req);

      const request = this.pool.request();
      scopeFilter.addInputs(request);
      const { offsetFetchSql } = applyPagination(request, pagination);

      const query = `
      ;WITH LatestHistoryAny AS (
          SELECT
              ch.*,
              ROW_NUMBER() OVER (
                  PARTITION BY ch.ClaimID
                  ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
              ) AS rn
          FROM dbo.claimhistory ch
      ),
      UnassignedClaims AS (
          SELECT
              c.ClaimID,
              c.ClaimSubmittedDate,
              c.ChargeAmt,
              c.DateOfService,
              lh.ClaimStatus,
              lh.Progress,
              lh.CARCCode,
              lh.ClaimBalanceDue
          FROM dbo.claims c
          LEFT JOIN dbo.claimhistory opench
              ON c.ClaimID = opench.ClaimID
             AND opench.ClaimWorkEndedTime IS NULL
             AND (
               opench.AssignedTo IS NOT NULL
               OR (opench.ClaimStatus = 'Pending'
                   AND opench.pending_until >= CAST(GETDATE() AS date))
             )
          LEFT JOIN LatestHistoryAny lh
              ON c.ClaimID = lh.ClaimID
             AND lh.rn = 1
          WHERE opench.ClaimID IS NULL
            AND (lh.ClaimStatus IS NULL OR lh.ClaimStatus NOT IN (
              'Closed', 'Adjudicated', 'Completed', 'Written Off', 'Patient Responsible', 'Accepted', 'ACCEPTED',
              'Paid', 'NotSubmitted', 'AwaitingAdjudication', 'Received', 'Escalated'
            ))
            ${scopeFilter.sql}
      ),
      ClaimFinancials AS (
          SELECT
              rr.ClaimID,
              MIN(rr.PatientID)           AS PatientID,
              MIN(rr.SubscriberFirstName) AS SubscriberFirstName,
              MIN(rr.SubscriberLastName)  AS SubscriberLastName,
              MIN(rr.InsuranceName)       AS InsuranceName,
              MIN(rr.ProviderName)        AS ProviderName,
              MIN(rr.Location)            AS Location,
              SUM(CASE WHEN rr.TrxType = 'Charge'     THEN rr.TrxAmt ELSE 0 END) AS TotalCharges,
              SUM(CASE WHEN rr.TrxType = 'Payment'    THEN rr.TrxAmt ELSE 0 END) AS TotalPayments,
              SUM(CASE WHEN rr.TrxType = 'Adjustment' THEN rr.TrxAmt ELSE 0 END) AS TotalAdjustments,
              SUM(
                  CASE
                      WHEN rr.TrxType = 'Charge'     THEN rr.TrxAmt
                      WHEN rr.TrxType = 'Payment'    THEN -rr.TrxAmt
                      WHEN rr.TrxType = 'Adjustment' THEN -rr.TrxAmt
                      ELSE 0
                  END
              ) AS ARBalance
          FROM dbo.recon_report rr
          GROUP BY rr.ClaimID
      ),
      BaseResult AS (
          SELECT
              LTRIM(RTRIM(
                  COALESCE(
                      NULLIF(LTRIM(RTRIM(COALESCE(cf.SubscriberFirstName,'') + ' ' + COALESCE(cf.SubscriberLastName,''))), ''),
                      NULLIF(LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))), ''),
                      ''
                  )
              )) AS PatientName,

              COALESCE(cf.PatientID, c.PatientID) AS PatientID,

              COALESCE(cf.InsuranceName, CONVERT(nvarchar(50), c.PayerID)) AS PayerName,

              ua.ClaimSubmittedDate AS SubmittedDate,

              ISNULL(cf.TotalCharges, ua.ChargeAmt) AS Charged,

              COALESCE(cf.ARBalance, ua.ClaimBalanceDue, 0) AS InsuranceBalance,

              COALESCE(NULLIF(ua.CARCCode, ''), ua.ClaimStatus, 'Pending') AS Issue,
              carc.Description AS IssueDescription,

              DATEDIFF(DAY, ua.ClaimSubmittedDate, CAST(GETDATE() AS date)) AS AgingDays,

              CAST(ISNULL(ua.Progress, 0) AS decimal(5,2)) AS ProgressPercent,

              ua.ClaimID,
              ua.DateOfService,
              c.PatientID                 AS AccountNumber,
              cf.ProviderName             AS ProviderName,
              cf.Location                 AS Location,
              CASE
                WHEN ua.ClaimStatus IN ('Closed', 'Adjudicated', 'Completed', 'Written Off', 'Patient Responsible', 'Accepted') THEN ua.ClaimStatus
                WHEN ua.ClaimStatus = 'Pending'               THEN 'Pending'
                WHEN ua.ClaimStatus = 'Escalated'             THEN 'Escalated'
                WHEN ua.ClaimStatus = 'Paid'                  THEN 'Paid'
                WHEN ua.ClaimStatus = 'Denied'                THEN 'Denied'
                WHEN ua.ClaimStatus = 'AwaitingAdjudication'  THEN 'Awaiting Adjudication'
                WHEN ua.ClaimStatus = 'NotSubmitted'          THEN 'Not Submitted'
                WHEN ua.ClaimStatus = 'Received'              THEN 'Received'
                ELSE 'Open'
              END AS Status,
              ua.ClaimStatus              AS ClaimStatus
          FROM UnassignedClaims ua
          JOIN dbo.claims c
              ON ua.ClaimID = c.ClaimID
          LEFT JOIN ClaimFinancials cf
              ON ua.ClaimID = cf.ClaimID
          LEFT JOIN dbo.patient pt
              ON pt.PatientID = COALESCE(cf.PatientID, c.PatientID)
          LEFT JOIN dbo.carccodes carc
              ON carc.Category + carc.CARCCode = NULLIF(ua.CARCCode, '')
      )

      SELECT
          ROW_NUMBER() OVER (ORDER BY AgingDays DESC, ClaimID) AS Priority,
          PatientName,
          ClaimID,
          PayerName,
          SubmittedDate,
          Charged,
          InsuranceBalance,
          Issue,
          IssueDescription,
          AgingDays,
          ProgressPercent,
          DateOfService,
          AccountNumber,
          ProviderName,
          Location,
          Status,
          COUNT(*) OVER() AS _TotalCount
      FROM BaseResult
      ORDER BY Priority
      ${offsetFetchSql};
      `;

      logger.info('Unassigned.get \u2192 executing unassigned claims query');
      const result = await request.query(query);

      const rows = result.recordset || [];
      const totalCount = rows.length > 0 ? rows[0]._TotalCount : 0;
      return res.status(200).json({
        message: 'Unassigned claims data',
        data: rows,
        totalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error: unknown) {
      logger.error('Unassigned.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
