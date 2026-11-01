import { Request } from 'express';
import { extractCustomerId } from './resolve-user-scope';

function asArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return [String(v)].map(s => s.trim()).filter(Boolean);
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toIsoDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export type DatePayerAliases = {
  claims: string; // e.g. "c"
  payer: string;  // e.g. "p" or "pd"
  /**
   * Column on the payer alias to filter by payer "name".
   * Defaults to 'InsuranceName' for most controllers that join dbo.Payer p.
   * Example: for a payer dimension CTE aliased as pd with a PayerName field, set to 'PayerName'.
   */
  payerNameColumn?: string;
  /**
   * Alias + column for provider filtering.
   * Defaults to `${claims}.ProviderName`.
   */
  providerAlias?: string;
  providerNameColumn?: string;
  /**
   * Alias + column for location filtering.
   * Defaults to `${claims}.Location`.
   */
  locationAlias?: string;
  locationColumn?: string;
};

export type SqlInput = { name: string; value: unknown };

export type GlobalFiltersResult = {
  clauseParts: string[];
  inputs: SqlInput[];
  startDate: string;
  endDate: string;
  payers: string[];
  providers: string[];
  locations: string[];
  payerInClause: string; // "" or "<payerAlias>.<payerCol> IN (@payer0, ...)"
  providerInClause: string; // "" or "<provAlias>.<provCol> IN (@provider0, ...)"
  locationInClause: string; // "" or "<locAlias>.<locCol> IN (@location0, ...)"
};

export type GlobalFiltersOptions = {
  startParam?: string;
  endParam?: string;
  payerParamPrefix?: string;
};

/**
 * Global (shared) filters for analytics queries.
 *
 * Current filters:
 * - Date range (start/end) applied to <claimsAlias>.DateOfService
 * - Payer filter (payer=...) applied to <payerAlias>.<payerNameColumn>
 *
 * Future filters (easy to add here):
 * - provider, location, practice, etc.
 */
export function applyGlobalFilters(
  req: Request,
  aliases: DatePayerAliases,
  opts?: GlobalFiltersOptions
): GlobalFiltersResult {
  const startParam = opts?.startParam ?? 'start';
  const endParam = opts?.endParam ?? 'end';
  const payerPrefix = opts?.payerParamPrefix ?? 'payer';

  const startQ = typeof req.query.start === 'string' ? req.query.start : null;
  const endQ = typeof req.query.end === 'string' ? req.query.end : null;

  const payers = asArray(req.query.payer);
  const providers = asArray(req.query.provider);
  const locations = asArray(req.query.location);

  let startDate: string | null = startQ && isIsoDate(startQ) ? startQ : null;
  let endDate: string | null = endQ && isIsoDate(endQ) ? endQ : null;

  // Default: last 365 days through today
  if (!startDate || !endDate) {
    const today = new Date();
    endDate = endDate ?? toIsoDate(today);

    const start = new Date(today);
    start.setDate(start.getDate() - 365);
    startDate = startDate ?? toIsoDate(start);
  }

  // Only error if user provided an invalid ISO date string
  /* istanbul ignore next */
  if ((startQ && !startDate) || (endQ && !endDate)) {
    throw new Error('INVALID_DATE');
  }

  const where: string[] = [
    `${aliases.claims}.DateOfService >= @${startParam}`,
    `${aliases.claims}.DateOfService < DATEADD(day, 1, @${endParam})`,
  ];

  const inputs: SqlInput[] = [
    { name: startParam, value: startDate },
    { name: endParam, value: endDate },
  ];

  let payerInClause = '';
  if (payers.length) {
    const payerParams = payers.map((_, i) => `@${payerPrefix}${i}`).join(', ');
    const payerCol = aliases.payerNameColumn ?? 'InsuranceName';

    payerInClause = `${aliases.payer}.${payerCol} IN (${payerParams})`;
    where.push(payerInClause);

    payers.forEach((payerName, i) => {
      inputs.push({ name: `${payerPrefix}${i}`, value: payerName });
    });
  }

  let providerInClause = '';
  if (providers.length) {
    const provAlias = aliases.providerAlias ?? aliases.claims;
    const provCol = aliases.providerNameColumn ?? 'ProviderName';
    const provParams = providers.map((_, i) => `@provider${i}`).join(', ');

    providerInClause = `${provAlias}.${provCol} IN (${provParams})`;
    where.push(providerInClause);

    providers.forEach((provName, i) => {
      inputs.push({ name: `provider${i}`, value: provName });
    });
  }

  let locationInClause = '';
  if (locations.length) {
    const locAlias = aliases.locationAlias ?? aliases.claims;
    const locCol = aliases.locationColumn ?? 'Location';
    const locParams = locations.map((_, i) => `@location${i}`).join(', ');

    locationInClause = `${locAlias}.${locCol} IN (${locParams})`;
    where.push(locationInClause);

    locations.forEach((locName, i) => {
      inputs.push({ name: `location${i}`, value: locName });
    });
  }

  // Enterprise (customer_id) isolation via x-xen-customer-id header
  const xenCustId = extractCustomerId(req);
  if (xenCustId != null) {
    where.push(`EXISTS (SELECT 1 FROM dbo.claims c_cust WHERE c_cust.ClaimID = ${aliases.claims}.ClaimID AND c_cust.customer_id = @_custId)`);
    inputs.push({ name: '_custId', value: xenCustId });
  }

  return {
    clauseParts: where,
    inputs,
    startDate,
    endDate,
    payers,
    providers,
    locations,
    payerInClause,
    providerInClause,
    locationInClause,
  };
}

/**
 * Backwards-compatible alias.
 * Safe to remove once all controllers are updated.
 */
export const buildDateAndPayerFilters = applyGlobalFilters;
