import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

interface SimCondition { field: string; operator: string; value: string; }

function evalCondition(claim: Record<string, any>, c: SimCondition): boolean {
  const raw = claim[c.field];
  const target = (c.value ?? '').trim();
  const str = raw == null ? '' : String(raw).trim();
  switch (c.operator) {
    case 'Is missing':       return raw == null || str === '';
    case 'Is present':       return raw != null && str !== '';
    case 'Equals':           return str.toLowerCase() === target.toLowerCase();
    case 'Does not equal':   return str.toLowerCase() !== target.toLowerCase();
    case 'Contains':         return str.toLowerCase().includes(target.toLowerCase());
    case 'Does not contain': return !str.toLowerCase().includes(target.toLowerCase());
    default:                 return false;
  }
}

export class SimulateRule extends DatabaseConnectionController {
  constructor() { super(); }

  public post = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { conditions = [], matchType = 'any' } = req.body as {
        conditions?: SimCondition[];
        matchType?: 'any' | 'all';
      };

      if (!conditions.length) {
        return res.status(400).json({ message: 'At least one condition is required' });
      }

      const actor = (req as any).actor;
      const custId: number | null = actor?.customer_id ?? null;

      const req90 = this.pool.request();
      if (custId != null) req90.input('custId', sql.Int, custId);

      const result = await req90.query(`
        SELECT TOP 200
          c.ClaimID,
          COALESCE(pt.firstname + ' ' + pt.lastname, c.ClaimID) AS patientName,
          COALESCE(p.InsuranceName, p.payer)                     AS payerName,
          COALESCE(c.ClaimStatus, ch.ClaimStatus)                AS claimStatus,
          CONVERT(varchar(10), c.DateOfService, 120)             AS lineItemDateOfService,
          CAST(ISNULL(c.ChargeAmt, 0) AS varchar(20))            AS totalChargeAmount,
          p.ElectronicID                                         AS payerId
        FROM dbo.claims c
        LEFT JOIN dbo.patient pt  ON pt.PatientID = c.PatientID
        LEFT JOIN dbo.payer p     ON p.PayerID    = c.PayerID
        LEFT JOIN (
          SELECT ClaimID, ClaimStatus,
                 ROW_NUMBER() OVER (PARTITION BY ClaimID ORDER BY ClaimModifiedDate DESC) AS rn
          FROM dbo.claimhistory
        ) ch ON ch.ClaimID = c.ClaimID AND ch.rn = 1
        WHERE c.ClaimID IS NOT NULL
          AND c.ClaimSubmittedDate >= DATEADD(day, -90, GETDATE())
          ${custId != null ? 'AND c.customer_id = @custId' : ''}
      `);

      const claims: Record<string, any>[] = result.recordset;

      const matched = claims.filter(claim => {
        const results = conditions.map(c => evalCondition(claim, c));
        return matchType === 'all' ? results.every(Boolean) : results.some(Boolean);
      });

      return res.json({
        matchCount: matched.length,
        sampleClaims: matched.slice(0, 10).map(c => ({
          id: c.ClaimID,
          patient: c.patientName,
          payer: c.payerName,
          status: c.claimStatus,
          dos: c.lineItemDateOfService,
          charged: c.totalChargeAmount,
        })),
      });
    } catch (error: unknown) {
      logger.error('SimulateRule.post \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
