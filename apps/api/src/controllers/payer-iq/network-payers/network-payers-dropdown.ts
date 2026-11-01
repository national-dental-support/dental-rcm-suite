import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId, buildClaimsCustomerWhere } from '../../../utils/resolve-user-scope';

export interface NetworkPayerRow {
  PayerID: number;
  InsuranceName: string;
}

/**
 * Returns distinct network names and payer-to-network mappings for dropdown
 * population in the global PayerIQ filters.
 *
 * Queries dimension tables only (no claim-level aggregation) so it is
 * near-instant regardless of claim volume.
 */
export class NetworkPayersDropdown extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(req);
      const custC = buildClaimsCustomerWhere(xenCustId, 'c');

      // Result set 1: distinct networks (from dimension table - no claim join needed)
      // Result set 2: payer->network mapping, filtered to payers that actually appear
      //               in the customer's claims within the past 12 months.
      const query = `
        DECLARE @EndDate   date = CAST(GETDATE() AS date);
        DECLARE @StartDate date = DATEADD(year, -1, @EndDate);

        -- Set 1: all lease networks
        SELECT DISTINCT
          n.NetworkName,
          CAST(0 AS decimal(18,2)) AS TotalChargeAmount,
          CAST(0 AS decimal(18,2)) AS TotalPayments,
          0 AS TotalPatientVolume,
          0 AS TotalCPTVolume
        FROM dbo.contractLeaseNetwork n
        ORDER BY n.NetworkName;

        -- Set 2: payers that appear in recent claims, with their network association
        SELECT DISTINCT
          COALESCE(n.NetworkName, 'Unknown Network') AS NetworkName,
          COALESCE(p.InsuranceName, p.payer)         AS PayerName,
          CAST(0 AS decimal(18,2)) AS TotalChargeAmount,
          CAST(0 AS decimal(18,2)) AS TotalPayments,
          0 AS TotalPatientVolume,
          0 AS TotalCPTVolume
        FROM dbo.claims c
        JOIN dbo.payer p
          ON p.PayerID = c.PayerID
        LEFT JOIN dbo.contractLeaseNetworkPayer np
          ON np.PayerID = p.PayerID
        LEFT JOIN dbo.contractLeaseNetwork n
          ON n.LeaseNetworkID = np.LeaseNetworkID
        WHERE c.DateOfService >= @StartDate
          AND c.DateOfService <  DATEADD(day, 1, @EndDate)
          ${custC.where}
        ORDER BY NetworkName, PayerName;
      `;

      logger.info('NetworkPayersDropdown.get \u2192 executing dropdown query');

      const npReq = this.pool.request();
      custC.addInputs(npReq);
      const result = await npReq.query(query);

      const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
      const networks = recordsets[0] ?? [];
      const networkPayers = recordsets[1] ?? [];

      return res.status(200).json({
        message: 'Network payers dropdown',
        networks,
        networkPayers,
      });

    } catch (error: unknown) {
      logger.error('NetworkPayersDropdown.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
