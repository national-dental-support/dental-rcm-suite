import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildScopeFilter } from '../../../../utils/resolve-user-scope';

type Tab = 'my' | 'all' | 'escalated' | 'unassigned' | 'pending' | 'awaiting-adjudication' | 'not-submitted';

const VALID_TABS: Set<string> = new Set(['my', 'all', 'escalated', 'unassigned', 'pending', 'awaiting-adjudication', 'not-submitted']);

function tabFilter(tab: Tab): string {
  switch (tab) {
    case 'my':
      return `AND lh.AssignedTo = @CurrentUserID
              AND lh.ClaimWorkEndedTime IS NULL
              AND lh.ClaimStatus NOT IN ('Closed', 'Adjudicated')`;
    case 'escalated':
      return `AND lh.ClaimStatus = 'Escalated'`;
    case 'unassigned':
      return `AND (lh.AssignedTo IS NULL OR lh.ClaimWorkEndedTime IS NOT NULL)
              AND lh.ClaimStatus NOT IN ('Closed', 'Adjudicated', 'Paid')`;
    case 'pending':
      return `AND lh.ClaimStatus = 'Pending'`;
    case 'awaiting-adjudication':
      return `AND lh.ClaimStatus = 'AwaitingAdjudication'`;
    case 'not-submitted':
      return `AND lh.ClaimStatus = 'NotSubmitted'`;
    case 'all':
    default:
      return '';
  }
}

export class ClaimQueueExport extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const rawTab = (req.query['tab'] as string | undefined) ?? 'all';
      const tab: Tab = VALID_TABS.has(rawTab) ? (rawTab as Tab) : 'all';

      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);
      const scopeFilter = buildScopeFilter(scope, 'c');

      const request = this.pool.request();
      scopeFilter.addInputs(request);

      if (tab === 'my') {
        if (scope.userId == null) {
          return res.status(200).json({ message: 'Export', data: [], totalCount: 0 });
        }
        request.input('CurrentUserID', scope.userId);
      }

      const extraFilter = tabFilter(tab);

      const query = `
      ;WITH LatestHistory AS (
          SELECT
              ch.*,
              ROW_NUMBER() OVER (
                  PARTITION BY ch.ClaimID
                  ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
              ) AS rn
          FROM dbo.claimhistory ch
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
                      NULLIF(LTRIM(RTRIM(COALESCE(xp.LastName,'') + ', ' + COALESCE(xp.FirstName,''))), ''),
                      ''
                  )
              )) AS PatientName,
              COALESCE(cf.InsuranceName, xi.Carrier, CONVERT(nvarchar(50), c.PayerID), 'Unknown') AS PayerName,
              c.ClaimSubmittedDate AS SubmittedDate,
              ISNULL(cf.TotalCharges, c.ChargeAmt) AS Charged,
              COALESCE(cf.ARBalance, lh.ClaimBalanceDue, 0) AS InsuranceBalance,
              COALESCE(NULLIF(lh.CARCCode, ''), lh.ClaimStatus, 'Pending') AS Issue,
              carc.Description AS IssueDescription,
              DATEDIFF(DAY, c.ClaimSubmittedDate, CAST(GETDATE() AS date)) AS AgingDays,
              CAST(ISNULL(lh.Progress, 0) AS decimal(5,2)) AS ProgressPercent,
              c.ClaimID,
              c.DateOfService,
              c.PatientID AS AccountNumber,
              CASE
                  WHEN lh.AssignedTo IS NOT NULL AND lh.ClaimWorkEndedTime IS NULL
                  THEN NULLIF(LTRIM(RTRIM(COALESCE(u.FirstName,'') + ' ' + COALESCE(u.LastName,''))), '')
                  ELSE NULL
              END AS AssignedToName,
              cf.ProviderName AS ProviderName,
              cf.Location AS Location,
              CASE
                WHEN lh.ClaimStatus IN ('Closed', 'Adjudicated', 'Completed', 'Written Off', 'Patient Responsible', 'Accepted') THEN lh.ClaimStatus
                WHEN lh.ClaimStatus = 'Pending'              THEN 'Pending'
                WHEN lh.ClaimStatus = 'Escalated'            THEN 'Escalated'
                WHEN lh.ClaimStatus = 'Paid'                 THEN 'Paid'
                WHEN lh.ClaimStatus = 'Denied'               THEN 'Denied'
                WHEN lh.ClaimStatus = 'AwaitingAdjudication' THEN 'Awaiting Adjudication'
                WHEN lh.ClaimStatus = 'NotSubmitted'         THEN 'Not Submitted'
                WHEN lh.ClaimStatus = 'Received'             THEN 'Received'
                ELSE 'Open'
              END AS Status,
              CASE
                WHEN DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, COALESCE(pfd.deadline_days, 180), c.DateOfService)) < 0  THEN 'OVERDUE'
                WHEN DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, COALESCE(pfd.deadline_days, 180), c.DateOfService)) <= 7  THEN 'URGENT'
                WHEN DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, COALESCE(pfd.deadline_days, 180), c.DateOfService)) <= 30 THEN 'WARNING'
                ELSE 'OK'
              END AS SlaStatus
          FROM dbo.claims c
          LEFT JOIN LatestHistory lh
              ON c.ClaimID = lh.ClaimID AND lh.rn = 1
          LEFT JOIN ClaimFinancials cf ON c.ClaimID = cf.ClaimID
          LEFT JOIN dbo.patient pt ON pt.PatientID = COALESCE(cf.PatientID, c.PatientID)
          LEFT JOIN dbo.Patient xp ON xp.PatNum = c.xen_patient_num
          LEFT JOIN dbo.InsPlan xi ON xi.PlanNum = c.xen_plan_num
          LEFT JOIN dbo.users u ON lh.AssignedTo = u.userID
          LEFT JOIN dbo.carccodes carc ON carc.Category + carc.CARCCode = NULLIF(lh.CARCCode, '')
          LEFT JOIN dbo.PayerFilingDeadlines pfd ON cf.InsuranceName LIKE '%' + pfd.payer_name + '%'
          WHERE 1=1
            ${scopeFilter.sql}
            ${extraFilter}
      )

      SELECT
          ROW_NUMBER() OVER (ORDER BY AgingDays DESC, ClaimID) AS Priority,
          PatientName, ClaimID, PayerName, SubmittedDate, Charged, InsuranceBalance,
          Issue, IssueDescription, AgingDays, ProgressPercent, DateOfService,
          AccountNumber, AssignedToName, ProviderName, Location, Status, SlaStatus
      FROM BaseResult
      ORDER BY AgingDays DESC, ClaimID;
      `;

      const result = await request.query(query);
      const rows = result.recordset || [];

      logger.info('ClaimQueueExport.get \u2192 exported claims', { tab, count: rows.length, actorEmail });

      return res.status(200).json({
        message: 'Export data',
        data: rows,
        totalCount: rows.length,
      });
    } catch (error: unknown) {
      logger.error('ClaimQueueExport.get \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
