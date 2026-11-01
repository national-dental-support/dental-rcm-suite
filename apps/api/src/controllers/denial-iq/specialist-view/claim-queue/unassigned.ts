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
      DECLARE @AsOfDate date;

      -- "Today" = last day with any claim activity (from claimhistory; fall back to claim submitted dates)
      SELECT
          @AsOfDate = MAX(COALESCE(ch.ClaimWorkEndedTime, ch.ClaimWorkStartedTime, ch.ClaimSubmittedDate))
      FROM dbo.claimhistory ch;

      IF @AsOfDate IS NULL
      BEGIN
          SELECT @AsOfDate = MAX(c.ClaimSubmittedDate)
          FROM dbo.claims c;
      END;

      IF @AsOfDate IS NULL
      BEGIN
          SET @AsOfDate = CAST(GETDATE() AS date);
      END;

      ;WITH LatestHistoryAny AS (
          -- Latest history row per claim (status/carc/progress live here now)
          SELECT
              ch.*,
              ROW_NUMBER() OVER (
                  PARTITION BY ch.ClaimID
                  ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
              ) AS rn
          FROM dbo.claimhistory ch
      ),
      UnassignedClaims AS (
          -- Claims with NO open assignment row in claimhistory
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
               -- Real open assignment
               opench.AssignedTo IS NOT NULL
               -- OR: claim is in active pending hold (not yet expired)
               OR (opench.ClaimStatus = 'Pending'
                   AND opench.pending_until >= CAST(GETDATE() AS date))
             )
          LEFT JOIN LatestHistoryAny lh
              ON c.ClaimID = lh.ClaimID
             AND lh.rn = 1
          WHERE opench.ClaimID IS NULL                 -- not assigned and not in active pending
            AND (lh.ClaimStatus IS NULL OR lh.ClaimStatus NOT IN (
              -- Terminal / resolved states
              'Closed', 'Adjudicated', 'Completed', 'Written Off', 'Patient Responsible', 'Accepted', 'ACCEPTED',
              -- Paid claims: lifecycle is complete, visible in reconciliation not denial work
              'Paid',
              -- Pre-submission and awaiting-adjudication: have dedicated queues, not denial work
              'NotSubmitted', 'AwaitingAdjudication', 'Received',
              -- Escalated claims live in the escalations queue
              'Escalated'
            ))
            ${scopeFilter.sql}
      ),
      ClaimFinancials AS (
          SELECT
              rr.ClaimID,

              -- Patient / payer display info
              MIN(rr.PatientID)           AS PatientID,
              MIN(rr.SubscriberFirstName) AS SubscriberFirstName,
              MIN(rr.SubscriberLastName)  AS SubscriberLastName,
              MIN(rr.InsuranceName)       AS InsuranceName,
              MIN(rr.ProviderName)        AS ProviderName,
              MIN(rr.Location)            AS Location,

              -- Financials
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
              -- Patient name: recon_report first, then patient table, then Patient, then empty
              LTRIM(RTRIM(
                  COALESCE(
                      NULLIF(LTRIM(RTRIM(COALESCE(cf.SubscriberFirstName,'') + ' ' + COALESCE(cf.SubscriberLastName,''))), ''),
                      NULLIF(LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))), ''),
                      NULLIF(LTRIM(RTRIM(COALESCE(xp.LastName,'') + ', ' + COALESCE(xp.FirstName,''))), ''),
                      ''
                  )
              )) AS PatientName,

              COALESCE(cf.PatientID, c.PatientID) AS PatientID,

              -- Payer
              COALESCE(cf.InsuranceName, xi.Carrier, CONVERT(nvarchar(50), c.PayerID), 'Unknown') AS PayerName,

              -- Submitted Date
              ua.ClaimSubmittedDate AS SubmittedDate,

              -- Charged (prefer summarized charges, fall back to claims.ChargeAmt)
              ISNULL(cf.TotalCharges, ua.ChargeAmt) AS Charged,

              -- Insurance Balance (prefer recon ARBalance; fall back to claimhistory ClaimBalanceDue; else 0)
              COALESCE(cf.ARBalance, ua.ClaimBalanceDue, 0) AS InsuranceBalance,

              -- Issue = CARC denial code, or claim status if no code
              COALESCE(NULLIF(ua.CARCCode, ''), ua.ClaimStatus, 'Pending') AS Issue,
              carc.Description AS IssueDescription,

              -- Aging in days from submitted date to "today"
              DATEDIFF(DAY, ua.ClaimSubmittedDate, CAST(GETDATE() AS date)) AS AgingDays,

              -- Progress from claimhistory.Progress
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
              ON pt.PatientID = c.PatientID
          LEFT JOIN dbo.Patient xp
              ON xp.PatNum = c.xen_patient_num
          LEFT JOIN dbo.InsPlan xi
              ON xi.PlanNum = c.xen_plan_num
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
