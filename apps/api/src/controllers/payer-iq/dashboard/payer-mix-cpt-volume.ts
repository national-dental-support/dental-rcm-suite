import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { buildDateAndPayerFilters } from '../../../utils/global-filters';

export interface PayerMixCptVolumeRow {
  PayerName: string;
  ProcedureCode: string;
  ChargeRowCount: number;
}

export class PayerMixCptVolume extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      let built: ReturnType<typeof buildDateAndPayerFilters>;
      try {
        built = buildDateAndPayerFilters(req, { claims: 'r', payer: 'r' });
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_DATE') {
          return res.status(400).json({
            message: 'Invalid date format. Use YYYY-MM-DD for start/end.',
          });
        }
        throw e;
      }

      const where: string[] = [
        `r.TrxType = 'Charge'`,
        `s.CPT IS NOT NULL`,
        ...built.clauseParts,
      ];

      const query = `
        SELECT
          r.InsuranceName AS PayerName,
          CAST(s.CPT AS nvarchar(50)) AS ProcedureCode,
          COUNT(*) AS ChargeRowCount
        FROM dbo.recon_report r
        JOIN dbo.serviceline s
          ON s.ClaimID = r.ClaimID
         AND s.ServiceLineID = r.ServiceLineID
        WHERE ${where.join('\n          AND ')}
        GROUP BY
          r.InsuranceName,
          CAST(s.CPT AS nvarchar(50))
        ORDER BY
          r.InsuranceName,
          ChargeRowCount DESC;
      `;

      const request = this.pool.request();
      built.inputs.forEach(({ name, value }) => request.input(name, value));

      logger.info('PayerMixCptVolume.get \u2192 executing CPT volume query', {
        startDate: built.startDate,
        endDate: built.endDate,
        payers: built.payers,
      });

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Payer mix CPT volume data',
        data: (result.recordset ?? []) as PayerMixCptVolumeRow[],
      });
    } catch (error: unknown) {
      logger.error('PayerMixCptVolume.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Failed to fetch payer mix by CPT volume.',
      });
    }
  };
}
