import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { buildDateAndPayerFilters } from '../../../utils/global-filters';

export interface PayerMixPatientVolumeRow {
  PayerName: string;
  PatientEncounter: number;
}

export class PayerMixPatientVolume extends DatabaseConnectionController {
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
        ...built.clauseParts,
      ];

      const query = `
        SELECT
          r.InsuranceName AS PayerName,
          COUNT(DISTINCT r.ClaimID) AS PatientEncounter
        FROM dbo.recon_report r
        WHERE ${where.join('\n          AND ')}
        GROUP BY r.InsuranceName
        ORDER BY PatientEncounter DESC;
      `;

      const request = this.pool.request();
      built.inputs.forEach(({ name, value }) => request.input(name, value));

      logger.info('PayerMixPatientVolume.get \u2192 executing patient volume query', {
        startDate: built.startDate,
        endDate: built.endDate,
        payers: built.payers,
      });

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Payer mix patient volume data',
        data: (result.recordset ?? []) as PayerMixPatientVolumeRow[],
      });
    } catch (error: unknown) {
      logger.error('PayerMixPatientVolume.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
