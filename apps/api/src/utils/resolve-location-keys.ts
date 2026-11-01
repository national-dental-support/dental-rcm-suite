import sql from 'mssql';

/**
 * Resolves org hierarchy names (OrgPractice.name or OrgLocation.name) to the
 * raw string keys used in recon_report.Operations / recon_report.Location via
 * the LocationNameMapping bridge table.
 *
 * Falls back to the orgName itself when no mapping row exists, so unmapped
 * names still produce a filter (pass-through behaviour).
 */
export async function resolveToReconKeys(
  pool: sql.ConnectionPool,
  customerId: number,
  orgNames: string[],
  entityType: 'practice' | 'location',
): Promise<string[]> {
  if (!orgNames.length) return [];

  const orgTable = entityType === 'practice' ? 'OrgPractice' : 'OrgLocation';
  const request = pool.request()
    .input('_cid', sql.Int, customerId)
    .input('_et',  sql.NVarChar(20), entityType);

  orgNames.forEach((n, i) => request.input(`_n${i}`, sql.NVarChar(255), n));
  const inList = orgNames.map((_, i) => `@_n${i}`).join(', ');

  const result = await request.query<{ recon_key: string }>(`
    SELECT DISTINCT COALESCE(lnm.recon_key, org.name) AS recon_key
    FROM dbo.${orgTable} org
    LEFT JOIN dbo.LocationNameMapping lnm
           ON lnm.org_id      = org.id
          AND lnm.customer_id = @_cid
          AND lnm.entity_type = @_et
          AND lnm.is_active   = 1
    WHERE org.name IN (${inList})
  `);

  return result.recordset.map((r) => r.recon_key);
}
