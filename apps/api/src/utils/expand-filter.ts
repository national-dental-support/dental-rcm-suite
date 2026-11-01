import sql from 'mssql';

/**
 * Expands a list of canonical names to include any dirty/alias names
 * that are mapped to those canonicals in DataAliasMapping.
 *
 * Use before building a WHERE ... IN (...) clause so that data tagged
 * with dirty variants is captured alongside canonical-name data.
 */
export async function expandWithAliases(
  pool: sql.ConnectionPool,
  entityType: 'location' | 'provider' | 'payer',
  names: string[]
): Promise<string[]> {
  if (!names.length) return names;

  const safeNames = names.map(n => `N'${n.replace(/'/g, "''")}'`).join(',');

  // entityType is parameterized to prevent SQL injection even though it's
  // constrained to a union type at compile time.
  const result = await pool.request()
    .input('entityType', sql.NVarChar(50), entityType)
    .query(`
    SELECT dirty_name
    FROM dbo.DataAliasMapping
    WHERE entity_type = @entityType
      AND canonical_name IN (${safeNames})
  `);

  const aliases = (result.recordset as { dirty_name: string }[]).map(r => r.dirty_name);
  return [...new Set([...names, ...aliases])];
}
