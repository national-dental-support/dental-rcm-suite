import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildScopeFilter } from '../../../../utils/resolve-user-scope';
import { parsePagination, applyPagination } from '../../../../utils/pagination';

export class MyQueue extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      // My Queue is personal - if we can't identify the user, return empty
      if (scope.userId == null) {
        logger.info('MyQueue.get \u2192 no user found for email, returning empty queue', { actorEmail });
        return res.status(200).json({ message: 'My queue data', data: [] });
      }

      const scopeFilter = buildScopeFilter(scope, 'c');
      const pagination = parsePagination(req);
      const request = this.pool.request();
      request.input('CurrentUserID', scope.userId);
      scopeFilter.addInputs(request);
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
      MyClaims AS (
          SELECT
              c.ClaimID,
              lh.AssignedTo           AS AssignedUserID,
              c.ClaimSubmittedDate,
              c.ChargeAmt,
              lh.ClaimStatus,
              c.DateOfService,
              lh.Progress,
              lh.CARCCode,
              lh.ClaimBalanceDue
          FROM dbo.claims c
          JOIN LatestHistory lh
              ON c.ClaimID = lh.ClaimID
             AND lh.rn = 1
          WHERE lh.ClaimWorkEndedTime IS NULL
            AND lh.AssignedTo = @CurrentUserID
            AND lh.ClaimStatus NOT IN ('Closed', 'Adjudicated')
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
              sc.AssignedUserID,

              LTRIM(RTRIM(
                  COALESCE(
                      NULLIF(LTRIM(RTRIM(COALESCE(cf.SubscriberFirstName,'') + ' ' + COALESCE(cf.SubscriberLastName,''))), ''),
                      NULLIF(LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))), ''),
                      NULLIF(LTRIM(RTRIM(COALESCE(xp.LastName,'') + ', ' + COALESCE(xp.FirstName,''))), ''),
                      ''
                  )
              )) AS PatientName,

              COALESCE(cf.PatientID, c.PatientID) AS PatientID,

              COALESCE(cf.InsuranceName, xi.Carrier, CONVERT(nvarchar(50), c.PayerID), 'Unknown') AS PayerName,

              sc.ClaimSubmittedDate AS SubmittedDate,

              ISNULL(cf.TotalCharges, sc.ChargeAmt) AS Charged,

              COALESCE(cf.ARBalance, sc.ClaimBalanceDue, 0) AS InsuranceBalance,

              COALESCE(
                  NULLIF(sc.CARCCode, ''),
                  sc.ClaimStatus
              ) AS Issue,

              carc.Description AS IssueDescription,

              DATEDIFF(DAY, sc.ClaimSubmittedDate, CAST(GETDATE() AS date)) AS AgingDays,

              CAST(ISNULL(sc.Progress, 0) AS decimal(5,2)) AS ProgressPercent,

              sc.ClaimID,
              sc.DateOfService,
              c.PatientID                 AS AccountNumber,
              cf.ProviderName             AS ProviderName,
              cf.Location                 AS Location,
              CASE
                WHEN sc.ClaimStatus IN ('Closed', 'Adjudicated') THEN sc.ClaimStatus
                WHEN sc.ClaimStatus = 'Pending'   THEN 'Pending'
                WHEN sc.ClaimStatus = 'Escalated' THEN 'Escalated'
                ELSE 'Open'
              END AS Status,
              sc.ClaimStatus              AS ClaimStatus
          FROM MyClaims sc
          JOIN dbo.claims c
              ON sc.ClaimID = c.ClaimID
          LEFT JOIN ClaimFinancials cf
              ON sc.ClaimID = cf.ClaimID
          LEFT JOIN dbo.patient pt
              ON pt.PatientID = c.PatientID
          LEFT JOIN dbo.Patient xp
              ON xp.PatNum = c.xen_patient_num
          LEFT JOIN dbo.InsPlan xi
              ON xi.PlanNum = c.xen_plan_num
          LEFT JOIN dbo.carccodes carc
              ON carc.Category + carc.CARCCode = NULLIF(sc.CARCCode, '')
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

      logger.info('MyQueue.get \u2192 executing my queue query', {
        actorEmail,
        userId: scope.userId,
        scopeLocations: scope.locations.length,
      });
      const result = await request.query(query);

      const rows = result.recordset || [];
      const totalCount = rows.length > 0 ? rows[0]._TotalCount : 0;
      const criticalCount = rows.length > 0 ? (rows[0]._CriticalCount ?? 0) : 0;
      return res.status(200).json({
        message: 'My queue data',
        data: rows,
        totalCount,
        criticalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error: unknown) {
      logger.error('MyQueue.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
