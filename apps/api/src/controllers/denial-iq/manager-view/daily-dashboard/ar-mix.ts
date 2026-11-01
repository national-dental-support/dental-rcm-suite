// controllers/analytics/.../daily-dashboard/ar-mix.ts
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class ARMix extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      let locationFilter = '';
      const request = this.pool.request();
      if (scope.isManager && scope.teamLocations.length > 0) {
        const locParams = scope.teamLocations.map((loc, i) => {
          request.input(`_arLoc${i}`, sql.NVarChar(255), loc);
          return `@_arLoc${i}`;
        });
        locationFilter = `AND Location IN (${locParams.join(', ')})`;
      }

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'recon_report');
      custFilter.addInputs(request);

      const query = `
        DECLARE @Today     date = CAST(GETDATE() AS date);
        DECLARE @AsOfDate  date = @Today;
        DECLARE @PriorAsOf date = DATEADD(DAY, -30, @AsOfDate);

        WITH CurrentAR AS (
            SELECT
                SUM(
                    CASE
                        WHEN TrxType = 'Charge'     THEN ISNULL(TrxAmt, 0)
                        WHEN TrxType = 'Payment'    THEN -ISNULL(TrxAmt, 0)
                        WHEN TrxType = 'Adjustment' THEN -ISNULL(TrxAmt, 0)
                        ELSE 0
                    END
                ) AS TotalAR,
                SUM(
                    CASE
                        WHEN PayerType = 'Insurance' THEN
                            CASE
                                WHEN TrxType = 'Charge'     THEN ISNULL(TrxAmt, 0)
                                WHEN TrxType = 'Payment'    THEN -ISNULL(TrxAmt, 0)
                                WHEN TrxType = 'Adjustment' THEN -ISNULL(TrxAmt, 0)
                                ELSE 0
                            END
                        ELSE 0
                    END
                ) AS InsuranceAR,
                SUM(
                    CASE
                        WHEN PayerType = 'Patient' THEN
                            CASE
                                WHEN TrxType = 'Charge'     THEN ISNULL(TrxAmt, 0)
                                WHEN TrxType = 'Payment'    THEN -ISNULL(TrxAmt, 0)
                                WHEN TrxType = 'Adjustment' THEN -ISNULL(TrxAmt, 0)
                                ELSE 0
                            END
                        ELSE 0
                    END
                ) AS PatientAR
            FROM recon_report
            WHERE DateOfService <= @AsOfDate
              ${locationFilter}
              ${custFilter.where}
        ),
        PriorAR AS (
            SELECT
                SUM(
                    CASE
                        WHEN TrxType = 'Charge'     THEN ISNULL(TrxAmt, 0)
                        WHEN TrxType = 'Payment'    THEN -ISNULL(TrxAmt, 0)
                        WHEN TrxType = 'Adjustment' THEN -ISNULL(TrxAmt, 0)
                        ELSE 0
                    END
                ) AS TotalAR30
            FROM recon_report
            WHERE DateOfService <= @PriorAsOf
              ${locationFilter}
              ${custFilter.where}
        )
        SELECT
            @AsOfDate AS AsOfDate,
            c.TotalAR,
            c.InsuranceAR,
            c.PatientAR,
            CASE 
                WHEN c.TotalAR = 0 THEN NULL
                ELSE CAST(100.0 * c.InsuranceAR / c.TotalAR AS decimal(5,2))
            END AS InsurancePctOfTotal,
            CASE 
                WHEN c.TotalAR = 0 THEN NULL
                ELSE CAST(100.0 * c.PatientAR / c.TotalAR AS decimal(5,2))
            END AS PatientPctOfTotal,
            p.TotalAR30,
            CASE 
                WHEN p.TotalAR30 IS NULL OR p.TotalAR30 = 0 THEN NULL
                ELSE CAST(100.0 * (c.TotalAR - p.TotalAR30) / p.TotalAR30 AS decimal(5,2))
            END AS PctChangeLast30Days
        FROM CurrentAR c
        CROSS JOIN PriorAR p;
      `;

      const result = await request.query(query);
      const row = result.recordset[0];

      if (!row) {
        return res.status(200).json({
          message: 'AR mix data',
          data: null,
        });
      }

      const payload = {
        asOfDate: row.AsOfDate,
        totalAR: Number(row.TotalAR ?? 0),
        insuranceAR: Number(row.InsuranceAR ?? 0),
        patientAR: Number(row.PatientAR ?? 0),
        insurancePctOfTotal:
          row.InsurancePctOfTotal !== null
            ? Number(row.InsurancePctOfTotal)
            : null,
        patientPctOfTotal:
          row.PatientPctOfTotal !== null
            ? Number(row.PatientPctOfTotal)
            : null,
        priorTotalAR:
          row.TotalAR30 !== null ? Number(row.TotalAR30) : null,
        pctChangeLast30Days:
          row.PctChangeLast30Days !== null
            ? Number(row.PctChangeLast30Days)
            : null,
      };

      return res.status(200).json({
        message: 'AR mix data',
        data: payload,
      });
    } catch (error: unknown) {
      logger.error('ARMix.get \u2013 error executing recon_report query', { error });
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export const arMix = new ARMix();
