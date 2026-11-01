import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId, buildCustomerFilter } from '../../utils/resolve-user-scope';

export class InsightFlowClaimContextController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/insightflow/claim-context/:reasonCode
   * Returns denial trend context for a given reason code.
   * Used by the InsightFlow enrichment panel in DenialIQ claim detail.
   */
  public get = async (req: Request, res: Response): Promise<Response> => {
    const { reasonCode } = req.params;

    try {
      const pool = this.pool;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custFilter = buildCustomerFilter(xenCustId, 'recon_report');
      const mkReq = () => {
        const r = pool.request();
        r.input('reasonCode', reasonCode);
        custFilter.addInputs(r);
        return r;
      };

      // Denial rate + count for this reason code over the last 90 days
      const statsResult = await mkReq()
        .query(`
          SELECT
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 THEN ClaimID END) AS denialCount90d,
            COUNT(DISTINCT ClaimID)                                        AS totalClaims90d,
            CASE
              WHEN COUNT(DISTINCT ClaimID) > 0
              THEN CAST(
                100.0 * COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 THEN ClaimID END)
                      / COUNT(DISTINCT ClaimID)
                AS DECIMAL(5,1))
              ELSE 0
            END AS denialRate90d
          FROM recon_report
          WHERE CARCCode = @reasonCode
            AND PostDate >= DATEADD(DAY, -90, GETDATE())
            ${custFilter.where}
        `);

      // Monthly denial trend (last 6 months) for this reason code
      const trendResult = await mkReq()
        .query(`
          SELECT
            FORMAT(PostDate, 'MMM yyyy') AS month,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 THEN ClaimID END) AS deniedCount
          FROM recon_report
          WHERE CARCCode = @reasonCode
            AND PostDate >= DATEADD(MONTH, -6, GETDATE())
            ${custFilter.where}
          GROUP BY FORMAT(PostDate, 'MMM yyyy'),
                   YEAR(PostDate), MONTH(PostDate)
          ORDER BY YEAR(PostDate), MONTH(PostDate)
        `);

      // Top 3 payers with this reason code (last 90 days)
      const payersResult = await mkReq()
        .query(`
          SELECT TOP 3
            InsuranceName AS payerName,
            COUNT(DISTINCT CASE WHEN IsClaimDenied = 1 THEN ClaimID END) AS deniedCount
          FROM recon_report
          WHERE CARCCode = @reasonCode
            AND PostDate >= DATEADD(DAY, -90, GETDATE())
            ${custFilter.where}
          GROUP BY InsuranceName
          ORDER BY deniedCount DESC
        `);

      const stats = statsResult.recordset[0] ?? { denialCount90d: 0, totalClaims90d: 0, denialRate90d: 0 };

      return res.json({
        reasonCode,
        denialCount90d: stats.denialCount90d,
        totalClaims90d: stats.totalClaims90d,
        denialRate90d:  stats.denialRate90d,
        trend:  trendResult.recordset,
        topPayers: payersResult.recordset,
      });
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
