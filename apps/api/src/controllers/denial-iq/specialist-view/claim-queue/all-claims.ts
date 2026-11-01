import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildScopeFilter } from '../../../../utils/resolve-user-scope';
import { parsePagination, applyPagination } from '../../../../utils/pagination';

export class AllClaims extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId);
      const scopeFilter = buildScopeFilter(scope, 'c');
      const pagination = parsePagination(req);
      const search = (req.query.search as string | undefined)?.trim() || null;

      const request = this.pool.request();
      scopeFilter.addInputs(request);
      if (search) request.input('_search', sql.NVarChar(100), search);
      const { offsetFetchSql } = applyPagination(request, pagination);

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
              c.PatientID                 AS AccountNumber,

              -- Who is it assigned to?
              CASE
                  WHEN lh.AssignedTo IS NOT NULL AND lh.ClaimWorkEndedTime IS NULL
                  THEN NULLIF(LTRIM(RTRIM(
                      COALESCE(u.FirstName,'') + ' ' + COALESCE(u.LastName,'')
                  )), '')
                  ELSE NULL
              END AS AssignedToName,

              cf.ProviderName             AS ProviderName,
              cf.Location                 AS Location,
              CASE
                WHEN lh.ClaimStatus IN ('Closed', 'Adjudicated', 'Completed', 'Written Off', 'Patient Responsible', 'Accepted') THEN lh.ClaimStatus
                WHEN lh.ClaimStatus = 'Pending'               THEN 'Pending'
                WHEN lh.ClaimStatus = 'Escalated'             THEN 'Escalated'
                WHEN lh.ClaimStatus = 'Paid'                  THEN 'Paid'
                WHEN lh.ClaimStatus = 'Denied'                THEN 'Denied'
                WHEN lh.ClaimStatus = 'AwaitingAdjudication'  THEN 'Awaiting Adjudication'
                WHEN lh.ClaimStatus = 'NotSubmitted'          THEN 'Not Submitted'
                WHEN lh.ClaimStatus = 'Received'              THEN 'Received'
                ELSE 'Open'
              END AS Status,
              lh.ClaimStatus              AS ClaimStatus

          FROM dbo.claims c
          LEFT JOIN LatestHistory lh
              ON c.ClaimID = lh.ClaimID
             AND lh.rn = 1
          LEFT JOIN ClaimFinancials cf
              ON c.ClaimID = cf.ClaimID
          LEFT JOIN dbo.patient pt
              ON pt.PatientID = COALESCE(cf.PatientID, c.PatientID)
          LEFT JOIN dbo.Patient xp
              ON xp.PatNum = c.xen_patient_num
          LEFT JOIN dbo.InsPlan xi
              ON xi.PlanNum = c.xen_plan_num
          LEFT JOIN dbo.users u
              ON lh.AssignedTo = u.userID
          LEFT JOIN dbo.carccodes carc
              ON carc.Category + carc.CARCCode = NULLIF(lh.CARCCode, '')
          WHERE 1=1
            ${scopeFilter.sql}
            ${search ? `AND (c.ClaimID LIKE '%' + @_search + '%'
              OR LTRIM(RTRIM(COALESCE(cf.SubscriberFirstName,'') + ' ' + COALESCE(cf.SubscriberLastName,''))) LIKE '%' + @_search + '%')` : ''}
      )

      SELECT
          ROW_NUMBER() OVER (ORDER BY COALESCE(cp.priority_score, 0) DESC, AgingDays DESC, br.ClaimID) AS Priority,
          PatientName,
          br.ClaimID,
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
          AssignedToName,
          ProviderName,
          Location,
          Status,
          ROUND(cp.priority_score, 1) AS PriorityScore,
          DATEADD(DAY, COALESCE(pfd.deadline_days, 180), br.DateOfService) AS SlaDeadline,
          DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, COALESCE(pfd.deadline_days, 180), br.DateOfService)) AS DaysUntilSla,
          CASE
            WHEN DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, COALESCE(pfd.deadline_days, 180), br.DateOfService)) < 0  THEN 'OVERDUE'
            WHEN DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, COALESCE(pfd.deadline_days, 180), br.DateOfService)) <= 7  THEN 'URGENT'
            WHEN DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, COALESCE(pfd.deadline_days, 180), br.DateOfService)) <= 30 THEN 'WARNING'
            ELSE 'OK'
          END AS SlaStatus,
          COUNT(*) OVER() AS _TotalCount,
          COUNT(CASE WHEN DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, COALESCE(pfd.deadline_days, 180), br.DateOfService)) <= 7 THEN 1 END) OVER() AS _CriticalCount
      FROM BaseResult br
      LEFT JOIN dbo.ClaimPriority cp ON cp.ClaimID = br.ClaimID
      LEFT JOIN dbo.PayerFilingDeadlines pfd ON br.PayerName LIKE '%' + pfd.payer_name + '%'
      ORDER BY Priority
      ${offsetFetchSql};
      `;

      logger.info('AllClaims.get \u2192 executing all-claims query', {
        actorEmail,
        userId: scope.userId,
        scopeLocations: scope.locations.length,
        scopeProviders: scope.providers.length,
      });
      const result = await request.query(query);

      const rows = result.recordset || [];
      const totalCount = rows.length > 0 ? rows[0]._TotalCount : 0;
      const criticalCount = rows.length > 0 ? (rows[0]._CriticalCount ?? 0) : 0;
      return res.status(200).json({
        message: 'All claims data',
        data: rows,
        totalCount,
        criticalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error: unknown) {
      logger.error('AllClaims.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
