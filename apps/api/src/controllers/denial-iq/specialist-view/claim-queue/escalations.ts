import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildScopeFilter } from '../../../../utils/resolve-user-scope';
import { parsePagination, applyPagination } from '../../../../utils/pagination';

export class Escalations extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const scope = await resolveUserScope(this.pool, actorEmail);
      const scopeFilter = buildScopeFilter(scope, 'c');
      const pagination = parsePagination(req);

      const request = this.pool.request();
      scopeFilter.addInputs(request);
      const { offsetFetchSql } = applyPagination(request, pagination);

      const query = `
      ;WITH LatestHistory AS (
          -- Latest claimhistory row per claim (same ordering as my-queue)
          SELECT
              ch.*,
              ROW_NUMBER() OVER (
                  PARTITION BY ch.ClaimID
                  ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
              ) AS rn
          FROM dbo.claimhistory ch
          WHERE ch.AssignedTo IS NOT NULL
      ),
      EscalatedClaims AS (
          SELECT
              c.ClaimID,
              lh.AssignedTo             AS ManagerID,
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
          WHERE lh.ClaimStatus = 'Escalated'
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
      )

      SELECT
          ec.ClaimStatus AS EscalatedFor,

          LTRIM(RTRIM(
              COALESCE(
                  NULLIF(LTRIM(RTRIM(COALESCE(cf.SubscriberFirstName,'') + ' ' + COALESCE(cf.SubscriberLastName,''))), ''),
                  NULLIF(LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))), ''),
                  NULLIF(LTRIM(RTRIM(COALESCE(xp.LastName,'') + ', ' + COALESCE(xp.FirstName,''))), ''),
                  ''
              )
          )) AS PatientName,

          COALESCE(cf.InsuranceName, xi.Carrier, CONVERT(nvarchar(50), c.PayerID), 'Unknown') AS PayerName,

          ec.ClaimID,

          ec.ClaimSubmittedDate AS SubmittedDate,

          ISNULL(cf.TotalCharges, ec.ChargeAmt) AS Charged,

          COALESCE(cf.ARBalance, ec.ClaimBalanceDue, 0) AS InsuranceBalance,

          COALESCE(NULLIF(ec.CARCCode, ''), ec.ClaimStatus, 'Pending') AS Issue,

          carc.Description AS IssueDescription,

          (
            SELECT TOP 1 REPLACE(note_text, 'Claim escalated to manager. Reason: ', '')
            FROM dbo.ClaimStepNote
            WHERE claim_id = ec.ClaimID
              AND note_type = 'escalation'
            ORDER BY created_at DESC
          ) AS EscalationReason,

          DATEDIFF(DAY, ec.ClaimSubmittedDate, CAST(GETDATE() AS date)) AS AgingDays,

          CAST(ISNULL(ec.Progress, 0) AS decimal(5,2)) AS ProgressPercent,

          ec.DateOfService AS DateOfService,
          c.PatientID      AS AccountNumber,
          cf.ProviderName  AS ProviderName,
          cf.Location      AS Location,
          CASE
            WHEN ec.ClaimStatus IN ('Closed', 'Adjudicated') THEN ec.ClaimStatus
            WHEN ec.ClaimStatus = 'Pending'   THEN 'Pending'
            WHEN ec.ClaimStatus = 'Escalated' THEN 'Escalated'
            ELSE 'Open'
          END AS Status,
          ec.ClaimStatus   AS ClaimStatus,

          COUNT(*) OVER() AS _TotalCount

      FROM EscalatedClaims ec
      JOIN dbo.claims c
          ON ec.ClaimID = c.ClaimID
      LEFT JOIN ClaimFinancials cf
          ON ec.ClaimID = cf.ClaimID
      LEFT JOIN dbo.patient pt
          ON pt.PatientID = c.PatientID
      LEFT JOIN dbo.Patient xp
          ON xp.PatNum = c.xen_patient_num
      LEFT JOIN dbo.InsPlan xi
          ON xi.PlanNum = c.xen_plan_num
      LEFT JOIN dbo.carccodes carc
          ON carc.Category + carc.CARCCode = NULLIF(ec.CARCCode, '')
      ORDER BY
          AgingDays DESC,
          ec.ClaimID
      ${offsetFetchSql};
      `;

      logger.info('Escalations.get \u2192 executing escalations query');
      const result = await request.query(query);

      const rows = result.recordset || [];
      const totalCount = rows.length > 0 ? rows[0]._TotalCount : 0;
      return res.status(200).json({
        message: 'Escalations data',
        data: rows,
        totalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error: unknown) {
      logger.error('Escalations.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
