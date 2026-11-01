import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildScopeFilter } from '../../../../utils/resolve-user-scope';
import { parsePagination, applyPagination } from '../../../../utils/pagination';

// Claims sent to a payer but not yet adjudicated (status = 'AwaitingAdjudication').
// Claims originating in the practice-management system, in the 'S' lifecycle state.
export class AwaitingAdjudication extends DatabaseConnectionController {
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
      ;WITH LatestHistory AS (
          SELECT
              ch.*,
              ROW_NUMBER() OVER (
                  PARTITION BY ch.ClaimID
                  ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
              ) AS rn
          FROM dbo.claimhistory ch
          WHERE ch.ClaimStatus = 'AwaitingAdjudication'
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
              SUM(
                  CASE
                      WHEN rr.TrxType = 'Charge'     THEN  rr.TrxAmt
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
              COALESCE(cf.PatientID, c.PatientID) AS PatientID,
              COALESCE(cf.InsuranceName, xi.Carrier, CONVERT(nvarchar(50), c.PayerID), 'Unknown') AS PayerName,
              lh.ClaimSubmittedDate   AS SubmittedDate,
              ISNULL(cf.TotalCharges, c.ChargeAmt) AS Charged,
              COALESCE(cf.ARBalance, lh.ClaimBalanceDue, c.ChargeAmt, 0) AS InsuranceBalance,
              'Awaiting Adjudication' AS Issue,
              NULL                    AS IssueDescription,
              DATEDIFF(DAY, lh.ClaimSubmittedDate, CAST(GETDATE() AS date)) AS AgingDays,
              CAST(ISNULL(lh.Progress, 0) AS decimal(5,2)) AS ProgressPercent,
              c.ClaimID,
              c.DateOfService,
              c.PatientID             AS AccountNumber,
              cf.ProviderName,
              cf.Location,
              'Awaiting Adjudication' AS Status,
              lh.ClaimStatus
          FROM dbo.claims c
          JOIN LatestHistory lh    ON lh.ClaimID = c.ClaimID AND lh.rn = 1
          LEFT JOIN ClaimFinancials cf ON cf.ClaimID = c.ClaimID
          LEFT JOIN dbo.patient pt ON pt.PatientID = c.PatientID
          LEFT JOIN dbo.Patient xp ON xp.PatNum = c.xen_patient_num
          LEFT JOIN dbo.InsPlan xi ON xi.PlanNum = c.xen_plan_num
          WHERE 1=1
            ${scopeFilter.sql}
      )

      SELECT
          ROW_NUMBER() OVER (ORDER BY AgingDays DESC, ClaimID) AS Priority,
          PatientName, ClaimID, PayerName, SubmittedDate, Charged,
          InsuranceBalance, Issue, IssueDescription, AgingDays,
          ProgressPercent, DateOfService, AccountNumber, ProviderName,
          Location, Status,
          COUNT(*) OVER() AS _TotalCount
      FROM BaseResult
      ORDER BY Priority
      ${offsetFetchSql};
      `;

      logger.info('AwaitingAdjudication.get \u2192 executing query');
      const result = await request.query(query);
      const rows = result.recordset || [];
      const totalCount = rows.length > 0 ? rows[0]._TotalCount : 0;
      return res.status(200).json({
        message: 'Awaiting adjudication claims',
        data: rows,
        totalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error: unknown) {
      logger.error('AwaitingAdjudication.get \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
