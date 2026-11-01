import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildScopeFilter } from '../../../../utils/resolve-user-scope';
import { parsePagination, applyPagination } from '../../../../utils/pagination';

export class PendingQueue extends DatabaseConnectionController {
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
      ;WITH PendingClaims AS (
          SELECT
              c.ClaimID,
              c.ClaimSubmittedDate,
              c.ChargeAmt,
              c.DateOfService,
              lh.ClaimStatus,
              lh.Progress,
              lh.CARCCode,
              lh.ClaimBalanceDue,
              lh.pending_until
          FROM dbo.claims c
          INNER JOIN dbo.claimhistory lh
              ON lh.ClaimID = c.ClaimID
             AND lh.ClaimStatus = 'Pending'
             AND lh.ClaimWorkEndedTime IS NULL
             AND lh.pending_until >= CAST(GETDATE() AS date)
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
              SUM(CASE
                  WHEN rr.TrxType = 'Charge'     THEN  rr.TrxAmt
                  WHEN rr.TrxType = 'Payment'    THEN -rr.TrxAmt
                  WHEN rr.TrxType = 'Adjustment' THEN -rr.TrxAmt
                  ELSE 0
              END) AS ARBalance
          FROM dbo.recon_report rr
          GROUP BY rr.ClaimID
      ),
      BaseResult AS (
          SELECT
              LTRIM(RTRIM(COALESCE(
                  NULLIF(LTRIM(RTRIM(COALESCE(cf.SubscriberFirstName,'') + ' ' + COALESCE(cf.SubscriberLastName,''))), ''),
                  NULLIF(LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))), ''),
                  NULLIF(LTRIM(RTRIM(COALESCE(xp.LastName,'') + ', ' + COALESCE(xp.FirstName,''))), ''),
                  ''
              ))) AS PatientName,
              COALESCE(cf.InsuranceName, CONVERT(nvarchar(50), c.PayerID), 'Unknown') AS PayerName,
              sc.ClaimSubmittedDate AS SubmittedDate,
              ISNULL(cf.TotalCharges, sc.ChargeAmt) AS Charged,
              COALESCE(cf.ARBalance, sc.ClaimBalanceDue, 0) AS InsuranceBalance,
              COALESCE(NULLIF(sc.CARCCode, ''), sc.ClaimStatus) AS Issue,
              carc.Description AS IssueDescription,
              DATEDIFF(DAY, sc.ClaimSubmittedDate, CAST(GETDATE() AS date)) AS AgingDays,
              CAST(ISNULL(sc.Progress, 0) AS decimal(5,2)) AS ProgressPercent,
              sc.ClaimID,
              sc.DateOfService,
              c.PatientID                 AS AccountNumber,
              sc.pending_until AS PendingUntil,
              DATEDIFF(DAY, CAST(GETDATE() AS date), sc.pending_until) AS DaysUntilRelease,
              cf.ProviderName             AS ProviderName,
              cf.Location                 AS Location,
              CASE
                WHEN sc.ClaimStatus IN ('Closed', 'Adjudicated') THEN sc.ClaimStatus
                WHEN sc.ClaimStatus = 'Pending'   THEN 'Pending'
                WHEN sc.ClaimStatus = 'Escalated' THEN 'Escalated'
                ELSE 'Open'
              END AS Status,
              sc.ClaimStatus              AS ClaimStatus
          FROM PendingClaims sc
          JOIN dbo.claims c ON sc.ClaimID = c.ClaimID
          LEFT JOIN ClaimFinancials cf ON sc.ClaimID = cf.ClaimID
          LEFT JOIN dbo.patient pt ON pt.PatientID = c.PatientID
          LEFT JOIN dbo.Patient xp ON xp.PatNum = c.xen_patient_num
          LEFT JOIN dbo.carccodes carc
              ON carc.Category + carc.CARCCode = NULLIF(sc.CARCCode, '')
      )
      SELECT
          ROW_NUMBER() OVER (ORDER BY DaysUntilRelease ASC, AgingDays DESC) AS Priority,
          PatientName, ClaimID, PayerName, SubmittedDate, Charged,
          InsuranceBalance, Issue, IssueDescription, AgingDays, ProgressPercent,
          DateOfService,
          AccountNumber,
          ProviderName, Location, Status,
          PendingUntil, DaysUntilRelease,
          COUNT(*) OVER() AS _TotalCount
      FROM BaseResult
      ORDER BY Priority
      ${offsetFetchSql};
      `;

      const result = await request.query(query);
      const rows = result.recordset || [];
      const totalCount = rows.length > 0 ? rows[0]._TotalCount : 0;

      return res.status(200).json({
        message: 'Pending queue data',
        data: rows,
        totalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error: unknown) {
      logger.error('PendingQueue.get \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
