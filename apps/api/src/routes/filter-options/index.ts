import { Router, Request, Response } from 'express';
import sql, { ConnectionPool } from 'mssql';
import Database from '../../modules/db';

const router = Router();
const pool: ConnectionPool = Database.getInstance().getPool();

/**
 * POST /api/filter-options/refined
 *
 * Accepts current filter selections and returns the valid options for
 * each dimension, filtered by all OTHER active selections (faceted search).
 *
 * Body: { practices?: string[], locations?: string[], payers?: string[], providers?: string[] }
 * Returns: { practices: string[], locations: string[], payers: string[], providers: string[] }
 */
router.post('/refined', async (req: Request, res: Response) => {
  try {
    const custId: number | null = (req as any).actor?.customer_id ?? null;
    const { practices = [], locations = [], payers = [], providers = [] } = req.body || {};

    const toArr = (v: any): string[] =>
      Array.isArray(v) ? v.filter((x: any) => x && typeof x === 'string') : [];

    const selPractices = toArr(practices);
    const selLocations = toArr(locations);
    const selPayers    = toArr(payers);
    const selProviders = toArr(providers);

    // Helper: build WHERE fragment + binders for a string[] filter
    const buildIn = (
      col: string,
      values: string[],
      prefix: string,
    ): { clause: string; bind: (r: sql.Request) => void } => {
      if (!values.length) return { clause: '', bind: () => {} };
      const paramNames = values.map((_, i) => `@${prefix}${i}`);
      return {
        clause: `AND ${col} IN (${paramNames.join(', ')})`,
        bind: (r) => values.forEach((v, i) => r.input(`${prefix}${i}`, sql.NVarChar(255), v)),
      };
    };

    const custClause = custId != null ? 'AND customer_id = @_cid' : '';
    const bindCust = (r: sql.Request) => { if (custId != null) r.input('_cid', sql.Int, custId); };

    // For each dimension, apply all OTHER filters
    const practiceFilter  = buildIn('Operations',    selPractices, 'fp');
    const locationFilter  = buildIn('Location',      selLocations, 'fl');
    const payerFilter     = buildIn('InsuranceName', selPayers,    'fy');
    const providerFilter  = buildIn('ProviderName',  selProviders, 'fv');

    const makeReq = () => {
      const r = pool.request();
      bindCust(r);
      return r;
    };

    // Practices: filtered by location + payer + provider (NOT practice)
    const rPractices = makeReq();
    locationFilter.bind(rPractices);
    payerFilter.bind(rPractices);
    providerFilter.bind(rPractices);

    // Locations: filtered by practice + payer + provider (NOT location)
    const rLocations = makeReq();
    practiceFilter.bind(rLocations);
    payerFilter.bind(rLocations);
    providerFilter.bind(rLocations);

    // Payers: filtered by practice + location + provider (NOT payer)
    const rPayers = makeReq();
    practiceFilter.bind(rPayers);
    locationFilter.bind(rPayers);
    providerFilter.bind(rPayers);

    // Providers: filtered by practice + location + payer (NOT provider)
    const rProviders = makeReq();
    practiceFilter.bind(rProviders);
    locationFilter.bind(rProviders);
    payerFilter.bind(rProviders);

    const [pRes, lRes, yRes, vRes] = await Promise.all([
      rPractices.query(`
        SELECT DISTINCT Operations AS v FROM dbo.recon_report
        WHERE Operations IS NOT NULL AND LTRIM(RTRIM(Operations)) <> ''
        ${custClause} ${locationFilter.clause} ${payerFilter.clause} ${providerFilter.clause}
        ORDER BY Operations
      `),
      rLocations.query(`
        SELECT DISTINCT Location AS v FROM dbo.recon_report
        WHERE Location IS NOT NULL AND LTRIM(RTRIM(Location)) <> ''
        ${custClause} ${practiceFilter.clause} ${payerFilter.clause} ${providerFilter.clause}
        ORDER BY Location
      `),
      rPayers.query(`
        SELECT DISTINCT InsuranceName AS v FROM dbo.recon_report
        WHERE InsuranceName IS NOT NULL AND LTRIM(RTRIM(InsuranceName)) <> ''
        ${custClause} ${practiceFilter.clause} ${locationFilter.clause} ${providerFilter.clause}
        ORDER BY InsuranceName
      `),
      rProviders.query(`
        SELECT DISTINCT ProviderName AS v FROM dbo.recon_report
        WHERE ProviderName IS NOT NULL AND LTRIM(RTRIM(ProviderName)) <> ''
        ${custClause} ${practiceFilter.clause} ${locationFilter.clause} ${payerFilter.clause}
        ORDER BY ProviderName
      `),
    ]);

    res.json({
      practices: pRes.recordset.map((r: any) => r.v),
      locations: lRes.recordset.map((r: any) => r.v),
      payers:    yRes.recordset.map((r: any) => r.v),
      providers: vRes.recordset.map((r: any) => r.v),
    });
  } catch (err: any) {
    console.error('[filter-options] refined error:', err);
    res.status(500).json({ message: 'Failed to load refined filter options' });
  }
});

export default router;
