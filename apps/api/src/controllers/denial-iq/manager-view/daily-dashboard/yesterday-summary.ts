// controllers/analytics/yesterday-summary.ts
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class YesterdaySummary extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      // Build location filter for managers with team locations
      let locationFilter = '';
      const request = this.pool.request();
      if (scope.isManager && scope.teamLocations.length > 0) {
        const locParams = scope.teamLocations.map((loc, i) => {
          request.input(`_ysLoc${i}`, sql.NVarChar(255), loc);
          return `@_ysLoc${i}`;
        });
        locationFilter = `AND Location IN (${locParams.join(', ')})`;
      }

      // Enterprise isolation via claims table
      const custFilter = buildCustomerFilter(scope.customerId, 'rr');
      custFilter.addInputs(request);

      const query = `
        DECLARE @ReportDate date;

        -- Last DateOfService that has data
        SELECT @ReportDate = MAX(rr.DateOfService)
        FROM recon_report rr
        WHERE rr.DateOfService IS NOT NULL
          ${custFilter.where};

        WITH agg AS (
          SELECT
            SUM(
              CASE
                WHEN rr.TrxType IN ('Charge', 'CHARGE', 'CHG')
                  THEN ISNULL(rr.TrxAmt, 0)
                ELSE 0
              END
            ) AS TotalCharges,
            SUM(
              CASE
                WHEN rr.TrxType IN ('Payment', 'PAYMENT', 'PMT')
                  THEN ISNULL(rr.TrxAmt, 0)
                ELSE 0
              END
            ) AS TotalPostedPayments,
            SUM(
              CASE
                WHEN rr.TrxType IN ('Adjustment', 'ADJUSTMENT', 'ADJ')
                  THEN ISNULL(rr.TrxAmt, 0)
                ELSE 0
              END
            ) AS TotalAdjustments
          FROM recon_report rr
          WHERE rr.DateOfService = @ReportDate
            ${custFilter.where}
            ${locationFilter}
        )
        SELECT
          @ReportDate AS ReportDate,
          CAST(TotalCharges        AS decimal(18,2)) AS Charges,
          CAST(TotalPostedPayments AS decimal(18,2)) AS PostedPayments,
          CAST(TotalAdjustments    AS decimal(18,2)) AS Adjustments,
          CASE
            WHEN (TotalCharges - TotalAdjustments) = 0 THEN NULL
            ELSE CAST(
              100.0 * TotalPostedPayments
              / (TotalCharges - TotalAdjustments)
              AS decimal(5,2)
            )
          END AS NetCollectionsPct
        FROM agg;
      `;

      const result = await request.query(query);
      const row = result.recordset[0];

      if (!row) {
        return res.status(200).json({
          message: 'Yesterday summary data',
          data: null,
        });
      }

      // Count claims escalated in the last 24 hours for this manager's scope
      const escalRequest = this.pool.request();
      const escalCustFilter = buildCustomerFilter(scope.customerId, 'ch');
      escalCustFilter.addInputs(escalRequest);
      const escalResult = await escalRequest.query(`
        SELECT COUNT(*) AS EscalationCount
        FROM dbo.claimhistory ch
        WHERE ch.ClaimStatus = 'Escalated'
          AND ch.ClaimModifiedDate >= DATEADD(hour, -24, GETUTCDATE())
          ${escalCustFilter.where}
      `);
      const escalationCount24h = Number(escalResult.recordset[0]?.EscalationCount ?? 0);

      const payload = {
        reportDate: row.ReportDate,
        charges: Number(row.Charges),
        postedPayments: Number(row.PostedPayments),
        adjustments: Number(row.Adjustments),
        netCollectionsPct:
          row.NetCollectionsPct !== null ? Number(row.NetCollectionsPct) : null,
        escalationCount24h,
      };

      return res.status(200).json({
        message: 'Yesterday summary data',
        data: payload,
      });
    } catch (error: unknown) {
      logger.error('YesterdaySummary.get \u2013 error executing recon_report query', { error });
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export const yesterdaySummary = new YesterdaySummary();
