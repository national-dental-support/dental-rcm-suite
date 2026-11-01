import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class ARByLocation extends DatabaseConnectionController {
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
          request.input(`_ablLoc${i}`, sql.NVarChar(255), loc);
          return `@_ablLoc${i}`;
        });
        locationFilter = `WHERE Location IN (${locParams.join(', ')})`;
      }

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'recon_report');
      custFilter.addInputs(request);

      const query = `
      WITH Base AS (
        SELECT
            COALESCE(Location, 'Main Office') AS Location,
            PayerType,
            TrxType,
            ISNULL(TrxAmt, 0) AS TrxAmt
        FROM recon_report
        ${locationFilter ? locationFilter : (custFilter.where ? 'WHERE 1=1' : '')}
            ${custFilter.where}
    ),

    Agg AS (
        SELECT
            Location,
            -- Patient Collections
            SUM(CASE WHEN TrxType = 'Payment' AND PayerType = 'Patient' THEN TrxAmt ELSE 0 END) AS PatientCollections,
            -- Insurance Collections (NULL PayerType rows are insurance payments from ERA matching)
            SUM(CASE WHEN TrxType = 'Payment' AND (PayerType = 'Insurance' OR PayerType IS NULL) THEN TrxAmt ELSE 0 END) AS InsuranceCollections,
            -- AR Balance
            SUM(
                CASE 
                    WHEN TrxType = 'Charge'     THEN TrxAmt
                    WHEN TrxType = 'Payment'    THEN -TrxAmt
                    WHEN TrxType = 'Adjustment' THEN -TrxAmt
                    ELSE 0
                END
            ) AS ARBalance
        FROM Base
        GROUP BY Location
    ),
    
    Totals AS (
        SELECT
            'Total' AS Location,
            SUM(PatientCollections)   AS PatientCollections,
            SUM(InsuranceCollections) AS InsuranceCollections,
            SUM(ARBalance)            AS ARBalance
        FROM Agg
    )
    
    SELECT
        Location,
        PatientCollections,
        InsuranceCollections,
        ARBalance,
        CASE WHEN Location = 'Total' THEN 1 ELSE 0 END AS SortKey
    FROM Agg
    
    UNION ALL
    
    SELECT
        Location,
        PatientCollections,
        InsuranceCollections,
        ARBalance,
        CASE WHEN Location = 'Total' THEN 1 ELSE 0 END AS SortKey
    FROM Totals
    
    ORDER BY
        SortKey,     -- puts Total at the bottom
        Location;    -- alphabetical for everything else    
      `;

      logger.info('ARByLocation.get \u2192 executing AR by location query');
      const result = await request.query(query);

      return res.status(200).json({
        message: 'AR by location data',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('ARByLocation.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
