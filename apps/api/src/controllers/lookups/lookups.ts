import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class LookupsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * POST /api/analytics/lookups/locations-and-groups
   * Body: { practiceGroups?: string[] }
   * Returns: { locations: string[], practiceGroups: string[] }
   */
  public locationsAndGroups = async (req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(req);
      const custWhere = xenCustId != null ? 'AND c.customer_id = @CustId' : '';

      const locReq = this.pool.request();
      if (xenCustId != null) locReq.input('CustId', sql.Int, xenCustId);

      const [locResult] = await Promise.all([
        locReq.query(`
          SELECT DISTINCT LTRIM(RTRIM(Location)) AS location
          FROM dbo.recon_report rr
          JOIN dbo.claims c ON c.ClaimID = rr.ClaimID
          WHERE rr.Location IS NOT NULL AND LTRIM(RTRIM(rr.Location)) <> ''
            ${custWhere}
          ORDER BY location
        `),
      ]);

      const locationsOut = (locResult.recordset ?? []).map((r: any) => r.location as string);

      logger.info('Lookups.locationsAndGroups \u2192 ok', { count: locationsOut.length });
      return res.status(200).json({
        locations: locationsOut,
        practiceGroups: [],
      });
    } catch (err: any) {
      logger.error('Lookups.locationsAndGroups error', { err });
      return res.status(500).json({ message: 'Failed to fetch locations/practice groups' });
    }
  };

  /**
   * POST /api/analytics/lookups/providers
   * Body: { practiceGroups?: string[], locations?: string[] }
   * Returns: { providers: string[] }
   */
  public providers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(req);
      const locations: string[] = Array.isArray(req.body?.locations)
        ? req.body.locations.filter(Boolean)
        : [];
      const hasLocFilter = locations.length > 0 && !locations.map(s => s.toLowerCase()).includes('all');

      const r = this.pool.request();
      if (xenCustId != null) r.input('CustId', sql.Int, xenCustId);

      const custWhere = xenCustId != null ? 'AND c.customer_id = @CustId' : '';
      let locWhere = '';
      if (hasLocFilter) {
        const params = locations.map((v, i) => { r.input(`loc${i}`, sql.NVarChar(255), v); return `@loc${i}`; });
        locWhere = `AND rr.Location IN (${params.join(', ')})`;
      }

      const result = await r.query(`
        SELECT DISTINCT LTRIM(RTRIM(rr.ProviderName)) AS provider
        FROM dbo.recon_report rr
        JOIN dbo.claims c ON c.ClaimID = rr.ClaimID
        WHERE rr.ProviderName IS NOT NULL AND LTRIM(RTRIM(rr.ProviderName)) <> ''
          ${custWhere}
          ${locWhere}
        ORDER BY provider
      `);

      const providersOut = (result.recordset ?? []).map((r: any) => r.provider as string);
      logger.info('Lookups.providers \u2192 ok', { count: providersOut.length });
      return res.status(200).json({ providers: providersOut });
    } catch (err: any) {
      logger.error('Lookups.providers error', { err });
      return res.status(500).json({ message: 'Failed to fetch providers' });
    }
  };
}

export const lookupsController = new LookupsController();
