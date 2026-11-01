import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { buildDateAndPayerFilters } from '../../../utils/global-filters';

export class ChargeAmount extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      let whereParts: string[];
      let inputs: Array<{ name: string; value: unknown }>;
      let startDate: string;
      let endDate: string;
      let payers: string[];

      try {
        const built = buildDateAndPayerFilters(req, { claims: 'r', payer: 'r' });
        whereParts = built.clauseParts;
        inputs = built.inputs;
        startDate = built.startDate;
        endDate = built.endDate;
        payers = built.payers;
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_DATE') {
          return res.status(400).json({
            message: 'Invalid date format. Use YYYY-MM-DD for start/end.',
          });
        }
        throw e;
      }

      const query = `
        SELECT
          r.InsuranceName AS PayerName,
          SUM(CASE WHEN r.TrxType = 'Charge' THEN COALESCE(r.TrxAmt, 0.0) ELSE 0 END) AS TotalCharges
        FROM dbo.recon_report r
        WHERE ${whereParts.join('\n          AND ')}
        GROUP BY r.InsuranceName
        ORDER BY TotalCharges DESC;
      `;

      const request = this.pool.request();
      inputs.forEach(({ name, value }) => request.input(name, value));

      logger.info('ChargeAmount.get \u2192 executing charge amount query', {
        startDate,
        endDate,
        payers,
      });

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Charge amount data',
        data: result.recordset ?? [],
      });
    } catch (error: unknown) {
      logger.error('ChargeAmount.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
