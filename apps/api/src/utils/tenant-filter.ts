import sql from 'mssql';
import type { ConnectionPool } from 'mssql';

// Cached client tenant customer_id - resolved once from DB on first request.
// undefined = not yet resolved; null = no CLIENT_TENANT_SLUG configured.
let _clientTenantCustomerId: number | null | undefined = undefined;

/**
 * Returns the customer_id for the CLIENT_TENANT_SLUG deployment, when one is set.
 * Result is cached permanently for the process lifetime since it never changes.
 * Returns null if no CLIENT_TENANT_SLUG is configured (unscoped/dev environments).
 */
export async function resolveClientTenantCustomerId(pool: ConnectionPool): Promise<number | null> {
  if (_clientTenantCustomerId !== undefined) return _clientTenantCustomerId;
  const slug = (process.env['CLIENT_TENANT_SLUG'] || '').trim().toLowerCase();
  if (!slug) { _clientTenantCustomerId = null; return null; }
  try {
    const r = await pool.request()
      .input('slug', sql.NVarChar, slug)
      .query(`SELECT TOP 1 customer_id FROM dbo.customers WHERE LOWER(slug) = @slug AND is_active = 1`);
    _clientTenantCustomerId = r.recordset[0]?.customer_id ?? null;
  } catch { _clientTenantCustomerId = null; }
  return _clientTenantCustomerId as number | null;
}

/**
 * Builds a SQL tenant isolation clause.
 * - If customerId is null (Super Admin), returns empty string (no filter = see all data)
 * - If customerId has a value, returns 'AND {alias}.customer_id = @_tenantCustId'
 *
 * Also binds the parameter to the request if needed.
 */
export function tenantWhere(
  request: sql.Request,
  customerId: number | null | undefined,
  alias = '',
): string {
  if (customerId == null) return ''; // Super Admin - no tenant filter
  const col = alias ? `${alias}.customer_id` : 'customer_id';
  request.input('_tenantCustId', sql.Int, customerId);
  return ` AND ${col} = @_tenantCustId`;
}

/**
 * Simple string-only version for when the request already has customerId bound.
 * Returns empty string for Super Admin (null customerId).
 */
export function tenantClause(customerId: number | null | undefined, alias = ''): string {
  if (customerId == null) return '';
  const col = alias ? `${alias}.customer_id` : 'customer_id';
  return ` AND ${col} = @customerId`;
}
