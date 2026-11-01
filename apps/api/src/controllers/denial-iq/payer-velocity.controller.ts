/**
 * Payer Velocity / Predictive Payer Model Controller
 *
 * Surfaces per-claim payment probability and expected payment amount
 * based on payer historical velocity data. Also handles EraPayerFact ingestion
 * for building the velocity model from ERA 835 data.
 */
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class PayerVelocityController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/ai/payer-velocity/score/:claimId - predicted payment for a single claim */
  scoreClam = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('ClaimId', sql.NVarChar(50), claimId);
      if (custId != null) r.input('_custId', sql.Int, custId);

      // Get claim + payer velocity
      const result = await r.query(`
        SELECT
          c.ClaimID,
          c.ChargeAmt,
          COALESCE(rr.InsuranceName, '') AS PayerName,
          COALESCE(rr.CPTCode, '') AS CPTCode,
          v_payer.avg_payment_ratio AS payer_avg_ratio,
          v_payer.avg_days_to_payment AS payer_avg_days,
          v_payer.paid_claims * 1.0 / NULLIF(v_payer.total_claims, 0) AS payer_pay_rate,
          v_cpt.avg_payment_ratio AS cpt_avg_ratio,
          v_cpt.avg_days_to_payment AS cpt_avg_days
        FROM dbo.claims c
        LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID AND rr.TrxType = 'Charge'
        LEFT JOIN dbo.PayerVelocityStats v_payer
          ON v_payer.payer_name = COALESCE(rr.InsuranceName, '')
          AND v_payer.cpt_code IS NULL
          ${custId != null ? 'AND v_payer.customer_id = @_custId' : ''}
        LEFT JOIN dbo.PayerVelocityStats v_cpt
          ON v_cpt.payer_name = COALESCE(rr.InsuranceName, '')
          AND v_cpt.cpt_code = COALESCE(rr.CPTCode, '')
          ${custId != null ? 'AND v_cpt.customer_id = @_custId' : ''}
        WHERE c.ClaimID = @ClaimId${custId != null ? ' AND c.customer_id = @_custId' : ''}
      `);

      if (!result.recordset.length) return res.status(404).json({ message: 'Claim not found' });
      const row = result.recordset[0];

      const payerRatio = parseFloat(row.payer_avg_ratio) || 0.75;
      const cptRatio = parseFloat(row.cpt_avg_ratio) || null;
      const effectiveRatio = cptRatio != null ? (payerRatio * 0.4 + cptRatio * 0.6) : payerRatio;
      const chargeAmt = parseFloat(row.ChargeAmt) || 0;
      const expectedPayment = chargeAmt * effectiveRatio;
      const payRate = parseFloat(row.payer_pay_rate) || 0.65;

      return res.json({
        data: {
          claim_id: claimId,
          payer_name: row.PayerName,
          charge_amount: chargeAmt,
          expected_payment: parseFloat(expectedPayment.toFixed(2)),
          payment_probability: parseFloat(payRate.toFixed(4)),
          avg_days_to_payment: Math.round(parseFloat(row.payer_avg_days) || 45),
          confidence: cptRatio != null ? 'high' : 'medium',
          note: cptRatio != null
            ? 'Blended payer + CPT code velocity'
            : 'Payer-level velocity only (no CPT history)',
        },
      });
    } catch (err: any) {
      logger.error('[PayerVelocity] scoreClam error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/ai/payer-velocity/ingest - ingest ERA fact records */
  ingest = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { facts } = req.body as {
        facts: Array<{
          payer_name: string;
          cpt_code?: string;
          billed_amount: number;
          allowed_amount?: number;
          paid_amount: number;
          is_denied: boolean;
          days_to_payment?: number;
          denial_reason_code?: string;
          date_of_service?: string;
          payment_date?: string;
          era_file_id?: string;
        }>;
      };

      if (!Array.isArray(facts) || !facts.length) {
        return res.status(400).json({ message: 'facts array is required' });
      }

      const custId = extractCustomerId(req);
      let inserted = 0;

      // Batch insert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < facts.length; i += chunkSize) {
        const chunk = facts.slice(i, i + chunkSize);
        const r = this.pool.request();
        r.input('CustId', sql.Int, custId);

        const rows = chunk.map((f, idx) => {
          r.input(`pn${idx}`, sql.NVarChar(255), f.payer_name);
          r.input(`cc${idx}`, sql.NVarChar(20), f.cpt_code ?? null);
          r.input(`ba${idx}`, sql.Decimal(12, 2), f.billed_amount);
          r.input(`aa${idx}`, sql.Decimal(12, 2), f.allowed_amount ?? null);
          r.input(`pa${idx}`, sql.Decimal(12, 2), f.paid_amount);
          r.input(`id${idx}`, sql.Bit, f.is_denied ? 1 : 0);
          r.input(`dp${idx}`, sql.Int, f.days_to_payment ?? null);
          r.input(`dr${idx}`, sql.NVarChar(20), f.denial_reason_code ?? null);
          r.input(`ds${idx}`, sql.Date, f.date_of_service ? new Date(f.date_of_service) : null);
          r.input(`pd${idx}`, sql.Date, f.payment_date ? new Date(f.payment_date) : null);
          r.input(`ef${idx}`, sql.NVarChar(100), f.era_file_id ?? null);
          return `(@CustId, @pn${idx}, @cc${idx}, @ba${idx}, @aa${idx}, @pa${idx}, @id${idx}, @dp${idx}, @dr${idx}, @ds${idx}, @pd${idx}, @ef${idx})`;
        });

        await r.query(`
          INSERT INTO dbo.EraPayerFact
            (customer_id, payer_name, cpt_code, billed_amount, allowed_amount, paid_amount, is_denied, days_to_payment, denial_reason_code, date_of_service, payment_date, era_file_id)
          VALUES ${rows.join(',')}
        `);
        inserted += chunk.length;
      }

      return res.status(201).json({ ok: true, inserted });
    } catch (err: any) {
      logger.error('[PayerVelocity] ingest error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
