import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import sql from 'mssql';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class ClaimDetailTable extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = (req.query.claimId as string) ?? '';

      if (!claimId) {
        return res.status(400).json({
          message: 'Missing required query parameter: claimId',
        });
      }
      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('ClaimIDParam', sql.NVarChar(50), claimId);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const custFilterRR = xenCustId != null ? ' AND rr.customer_id = @_custId' : '';
      const custFilterSL = xenCustId != null ? ' AND customer_id = @_custId' : '';

        const query = `
        DECLARE @ClaimID nvarchar(50) = @ClaimIDParam;

        ;WITH LatestHistory AS (
            SELECT
                ch.*,
                ROW_NUMBER() OVER (
                    PARTITION BY ch.ClaimID
                    ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
                ) AS rn
            FROM dbo.claimhistory ch
            WHERE ch.ClaimID = @ClaimID
        ),
        -- Aggregate recon_report per service line (may be empty if no recon data)
        ReconAgg AS (
            SELECT
                rr.ServiceLineID,
                SUM(CASE WHEN rr.TrxType = 'Charge'
                         THEN ISNULL(rr.TrxAmt, 0) ELSE 0 END)                             AS Charge,
                SUM(CASE WHEN rr.TrxType = 'Payment' AND rr.PayerType = 'Insurance'
                         THEN ISNULL(rr.TrxAmt, 0) ELSE 0 END)                             AS InsPaid,
                SUM(CASE WHEN rr.PayerType = 'Patient' AND rr.TrxType = 'Charge'
                              THEN  ISNULL(rr.TrxAmt, 0)
                         WHEN rr.PayerType = 'Patient' AND rr.TrxType IN ('Payment','Adjustment')
                              THEN -ISNULL(rr.TrxAmt, 0)
                         ELSE 0 END)                                                         AS PatientResp,
                MAX(rr.CARCCode)                                                             AS ReasonCode
            FROM dbo.recon_report rr
            WHERE rr.ClaimID = @ClaimID${custFilterRR}
            GROUP BY rr.ServiceLineID
        ),
        -- Total insurance payment from payerPaymentAllocation when recon_report is absent
        PayerPmt AS (
            SELECT ISNULL(SUM(ppa.AmountApplied), 0) AS TotalInsPaid
            FROM dbo.payerPaymentAllocation ppa
            INNER JOIN dbo.payerPayment pp
                ON pp.PayerPaymentID = ppa.PayerPaymentID
            WHERE ppa.ClaimID = @ClaimID
        ),
        LineCount AS (
            SELECT COUNT(*) AS Cnt
            FROM dbo.serviceline
            WHERE ClaimID = @ClaimID${custFilterSL}
        ),
        -- serviceline is the authoritative procedure source \u2014 always has rows when seeded
        LineAgg AS (
            SELECT
                sl.DateOfService,
                sl.ServiceLineID,
                sl.CPT                                                                       AS ProcedureCode,
                -- Prefer recon charge; fall back to contracted rate as best estimate
                ISNULL(ra.Charge, sl.ContractedRate)                                        AS Charge,
                -- Prefer recon InsPaid; fall back to evenly distributed payer payment
                COALESCE(
                    NULLIF(ra.InsPaid, 0),
                    CASE WHEN pp.TotalInsPaid > 0
                         THEN CAST(pp.TotalInsPaid AS decimal(18,2)) / NULLIF(lc.Cnt, 0)
                         ELSE 0 END
                )                                                                            AS InsPaid,
                sl.ContractedRate                                                            AS Allowed,
                sl.ContractualAdjustments                                                    AS ContractualAdjustment,
                CAST(0 AS decimal(18,2))                                                     AS TransactionAdjustment,
                ISNULL(ra.PatientResp, 0)                                                    AS PatientResp,
                CAST(0 AS decimal(18,2))                                                     AS Deductible,
                CAST(0 AS decimal(18,2))                                                     AS Copay,
                CAST(0 AS decimal(18,2))                                                     AS Coins,
                COALESCE(ra.ReasonCode, lh.CARCCode)                                        AS ReasonCode,
                LEFT(sl.ProcedureDescription, 100)                                          AS ProcDescription
            FROM dbo.serviceline sl
            CROSS JOIN PayerPmt pp
            CROSS JOIN LineCount lc
            LEFT JOIN ReconAgg ra
                ON ra.ServiceLineID = sl.ServiceLineID
            LEFT JOIN LatestHistory lh
                ON lh.rn = 1
            WHERE sl.ClaimID = @ClaimID${xenCustId != null ? ' AND sl.customer_id = @_custId' : ''}
        )

        -- Final output: detail rows + TOTALS row
        SELECT
            CAST(la.DateOfService AS date)          AS DOS,
            CAST(la.ProcedureCode AS nvarchar(50))  AS ProcCode,
            la.Charge,
            la.InsPaid,
            la.Allowed,
            la.ContractualAdjustment,
            la.TransactionAdjustment,
            la.PatientResp,
            la.Deductible,
            la.Copay,
            la.Coins,
            la.ReasonCode,
            la.ProcDescription
        FROM LineAgg la

        UNION ALL

        SELECT
            NULL AS DOS,
            CAST('TOTALS' AS nvarchar(50)) AS ProcCode,
            SUM(la.Charge),
            SUM(la.InsPaid),
            SUM(la.Allowed),
            SUM(la.ContractualAdjustment),
            SUM(la.TransactionAdjustment),
            SUM(la.PatientResp),
            SUM(la.Deductible),
            SUM(la.Copay),
            SUM(la.Coins),
            NULL AS ReasonCode,
            NULL AS ProcDescription
        FROM LineAgg la;
      `;

     logger.info('ClaimInformation.get \u2192 executing claim information query', {
        claimId,
      });

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Claim information data',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('ClaimInformation.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
