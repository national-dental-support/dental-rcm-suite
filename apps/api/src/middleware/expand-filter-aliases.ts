import { Request, Response, NextFunction } from 'express';
import Database from '../modules/db';
import { expandWithAliases } from '../utils/expand-filter';

/**
 * Middleware that expands payers/providers/locations to include their alias
 * mappings from DataAliasMapping. Handles BOTH query params (?providers=X)
 * and POST body filters (req.body.filters.provider). Runs once per request
 * so individual controllers don't need to call expandWithAliases themselves.
 */
export async function expandFilterAliases(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const pool = Database.getInstance().getPool();

    const toArr = (v: unknown): string[] => {
      if (!v || v === 'all') return [];
      return (Array.isArray(v) ? v as string[] : [String(v)]).map(s => s.trim()).filter(Boolean);
    };

    // -- Query params (used by InsightFlow, Financial Overview, KPIs) -----
    const qPayers    = toArr(req.query.payers);
    const qProviders = toArr(req.query.providers);
    const qLocations = toArr(req.query.locations);

    // -- Body filters (used by AR, Revenue Cycle, Payer Mix) --------------
    const bodyFilters = (req as any).body?.filters;
    const bPayers    = bodyFilters ? toArr(bodyFilters.payer)    : [];
    const bProviders = bodyFilters ? toArr(bodyFilters.provider) : [];
    const bLocations = bodyFilters ? toArr(bodyFilters.location) : [];

    const hasSomething = qPayers.length || qProviders.length || qLocations.length
                      || bPayers.length || bProviders.length || bLocations.length;
    if (!hasSomething) { next(); return; }

    const [ePayers, eProviders, eLocations, ebPayers, ebProviders, ebLocations] = await Promise.all([
      qPayers.length    ? expandWithAliases(pool, 'payer',    qPayers)    : Promise.resolve(qPayers),
      qProviders.length ? expandWithAliases(pool, 'provider', qProviders) : Promise.resolve(qProviders),
      qLocations.length ? expandWithAliases(pool, 'location', qLocations) : Promise.resolve(qLocations),
      bPayers.length    ? expandWithAliases(pool, 'payer',    bPayers)    : Promise.resolve(bPayers),
      bProviders.length ? expandWithAliases(pool, 'provider', bProviders) : Promise.resolve(bProviders),
      bLocations.length ? expandWithAliases(pool, 'location', bLocations) : Promise.resolve(bLocations),
    ]);

    // Overwrite query params
    if (qPayers.length)    (req.query as any).payers    = ePayers;
    if (qProviders.length) (req.query as any).providers  = eProviders;
    if (qLocations.length) (req.query as any).locations  = eLocations;

    // Overwrite body filters
    if (bodyFilters) {
      if (bPayers.length)    bodyFilters.payer    = ebPayers;
      if (bProviders.length) bodyFilters.provider = ebProviders;
      if (bLocations.length) bodyFilters.location = ebLocations;
    }
  } catch {
    // Non-fatal - continue with original filter values
  }

  next();
}
