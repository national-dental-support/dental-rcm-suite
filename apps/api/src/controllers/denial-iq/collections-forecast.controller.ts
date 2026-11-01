/**
 * Collections Forecast Controller
 *
 * Produces a 30/60/90-day forward-looking collections forecast by:
 * 1. Pulling open AR by payer
 * 2. Looking up each payer's average days-to-payment from PayerVelocityStats
 * 3. Distributing expected payments into forecast buckets
 *
 * Also exposes a velocity refresh endpoint (admin) that recalculates
 * PayerVelocityStats from raw recon_report data.
 */
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class CollectionsForecastController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/ai/collections-forecast */
  getForecast = async (req: Request, res: Response): Promise<Response> => {
    try {
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      if (custId != null) r.input('_custId', sql.Int, custId);

      // Open AR by payer with velocity stats
      const arResult = await r.query(`
        WITH OpenAR AS (
          SELECT
            rr.InsuranceName AS payer_name,
            SUM(CASE WHEN rr.TrxType = 'Charge' THEN rr.TrxAmt ELSE 0 END)
            - SUM(CASE WHEN rr.TrxType IN ('Payment','Adjustment') THEN rr.TrxAmt ELSE 0 END)
            AS open_balance,
            COUNT(DISTINCT rr.ClaimID) AS claim_count,
            MIN(rr.DateOfService) AS oldest_dos
          FROM dbo.recon_report rr
          WHERE rr.InsuranceName IS NOT NULL
            ${custId != null ? 'AND EXISTS (SELECT 1 FROM dbo.claims c WHERE c.ClaimID = rr.ClaimID AND c.customer_id = @_custId)' : ''}
          GROUP BY rr.InsuranceName
          HAVING SUM(CASE WHEN rr.TrxType = 'Charge' THEN rr.TrxAmt ELSE 0 END)
               - SUM(CASE WHEN rr.TrxType IN ('Payment','Adjustment') THEN rr.TrxAmt ELSE 0 END) > 0
        ),
        Velocity AS (
          SELECT payer_name, avg_payment_ratio, avg_days_to_payment, total_claims, paid_claims
          FROM dbo.PayerVelocityStats
          WHERE cpt_code IS NULL${custId != null ? ' AND customer_id = @_custId' : ''}
        )
        SELECT
          ar.payer_name,
          ar.open_balance,
          ar.claim_count,
          ar.oldest_dos,
          COALESCE(v.avg_payment_ratio, 0.75) AS avg_payment_ratio,
          COALESCE(v.avg_days_to_payment, 45) AS avg_days_to_payment,
          v.total_claims AS velocity_claim_count,
          v.paid_claims AS velocity_paid_count
        FROM OpenAR ar
        LEFT JOIN Velocity v ON v.payer_name = ar.payer_name
        ORDER BY ar.open_balance DESC
      `);

      // Bucket expected payments into 30/60/90-day windows
      const today = new Date();
      const d30 = new Date(today); d30.setDate(d30.getDate() + 30);
      const d60 = new Date(today); d60.setDate(d60.getDate() + 60);
      const d90 = new Date(today); d90.setDate(d90.getDate() + 90);

      let expected30 = 0, expected60 = 0, expected90 = 0, expectedBeyond = 0;
      const breakdown: Array<{
        payer_name: string;
        open_balance: number;
        expected_payment: number;
        expected_by_days: number;
        payment_ratio: number;
      }> = [];

      for (const row of arResult.recordset) {
        const expectedPayment = parseFloat(row.open_balance) * parseFloat(row.avg_payment_ratio);
        const daysToPayment = Math.round(parseFloat(row.avg_days_to_payment));
        const expectedDate = new Date(today);
        expectedDate.setDate(expectedDate.getDate() + daysToPayment);

        if (expectedDate <= d30) expected30 += expectedPayment;
        else if (expectedDate <= d60) expected60 += expectedPayment;
        else if (expectedDate <= d90) expected90 += expectedPayment;
        else expectedBeyond += expectedPayment;

        breakdown.push({
          payer_name: row.payer_name,
          open_balance: parseFloat(row.open_balance),
          expected_payment: parseFloat(expectedPayment.toFixed(2)),
          expected_by_days: daysToPayment,
          payment_ratio: parseFloat(parseFloat(row.avg_payment_ratio).toFixed(4)),
        });
      }

      return res.json({
        data: {
          computed_at: today.toISOString(),
          forecast: {
            next_30_days: parseFloat(expected30.toFixed(2)),
            next_60_days: parseFloat((expected30 + expected60).toFixed(2)),
            next_90_days: parseFloat((expected30 + expected60 + expected90).toFixed(2)),
            beyond_90_days: parseFloat(expectedBeyond.toFixed(2)),
          },
          breakdown: breakdown.slice(0, 25), // top 25 payers
          note: 'Forecast based on open AR \u00D7 payer average payment ratio. Velocity computed from ERA history.',
        },
      });
    } catch (err: any) {
      logger.error('[CollectionsForecast] getForecast error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/ai/collections-forecast/refresh-velocity - admin: recompute PayerVelocityStats */
  refreshVelocity = async (req: Request, res: Response): Promise<Response> => {
    try {
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      if (custId != null) r.input('_custId', sql.Int, custId);

      // Recompute from EraPayerFact - upsert into PayerVelocityStats
      await r.query(`
        MERGE dbo.PayerVelocityStats AS target
        USING (
          SELECT
            ${custId != null ? '@_custId' : 'NULL'} AS customer_id,
            payer_name,
            NULL AS cpt_code,
            COUNT(*) AS total_claims,
            SUM(CASE WHEN is_denied = 0 AND paid_amount > 0 THEN 1 ELSE 0 END) AS paid_claims,
            SUM(CASE WHEN is_denied = 1 THEN 1 ELSE 0 END) AS denied_claims,
            AVG(CASE WHEN is_denied = 0 AND billed_amount > 0 THEN paid_amount * 1.0 / billed_amount ELSE NULL END) AS avg_payment_ratio,
            AVG(CAST(days_to_payment AS FLOAT)) AS avg_days_to_payment
          FROM dbo.EraPayerFact
          WHERE 1=1${custId != null ? ' AND customer_id = @_custId' : ''}
          GROUP BY payer_name
        ) AS src (customer_id, payer_name, cpt_code, total_claims, paid_claims, denied_claims, avg_payment_ratio, avg_days_to_payment)
        ON target.payer_name = src.payer_name
          AND ISNULL(target.cpt_code,'') = ''
          AND target.customer_id = src.customer_id
        WHEN MATCHED THEN UPDATE SET
          total_claims = src.total_claims,
          paid_claims = src.paid_claims,
          denied_claims = src.denied_claims,
          avg_payment_ratio = src.avg_payment_ratio,
          avg_days_to_payment = src.avg_days_to_payment,
          computed_at = GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT
          (customer_id, payer_name, cpt_code, total_claims, paid_claims, denied_claims, avg_payment_ratio, avg_days_to_payment, computed_at)
          VALUES (src.customer_id, src.payer_name, src.cpt_code, src.total_claims, src.paid_claims, src.denied_claims, src.avg_payment_ratio, src.avg_days_to_payment, GETUTCDATE());
      `);

      return res.json({ ok: true, message: 'PayerVelocityStats refreshed from EraPayerFact.' });
    } catch (err: any) {
      logger.error('[CollectionsForecast] refreshVelocity error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/ai/collections-forecast/velocity - payer velocity table */
  getVelocity = async (req: Request, res: Response): Promise<Response> => {
    try {
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      if (custId != null) r.input('_custId', sql.Int, custId);

      const result = await r.query(`
        SELECT payer_name, cpt_code, total_claims, paid_claims, denied_claims,
               avg_payment_ratio, avg_days_to_payment, p25_days_to_payment, p75_days_to_payment, computed_at
        FROM dbo.PayerVelocityStats
        WHERE 1=1${custId != null ? ' AND customer_id = @_custId' : ''}
        ORDER BY total_claims DESC
      `);

      return res.json({ data: result.recordset });
    } catch (err: any) {
      logger.error('[CollectionsForecast] getVelocity error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
