import sql from 'mssql';

/**
 * The behavioural half of the tenant-isolation check.
 *
 * tenant-isolation-contract.test.ts asserts that the application and the
 * security policy agree on paper. It cannot prove the policy works: a mocked
 * mssql proves only that this code is internally consistent. This file connects
 * to a real SQL Server and checks that two tenants cannot see each other.
 *
 * It is skipped unless RLS_TEST_DB_PASSWORD is set, so `npm test` stays
 * database-free. To run it against the compose stack:
 *
 *   RLS_TEST_DB_SERVER=127.0.0.1 RLS_TEST_DB_PORT=14340 \
 *   RLS_TEST_DB_USER=dental_rcm_app RLS_TEST_DB_PASSWORD=... \
 *   npx jest tenant-isolation-live
 *
 * Point it at the RESTRICTED application login. Run as a database owner and
 * every assertion below passes whether or not the policy exists, because both
 * predicates exempt db_owner - which is the whole trap this file exists to
 * close.
 */

const password = process.env['RLS_TEST_DB_PASSWORD'];
const describeLive = password ? describe : describe.skip;

const config: sql.config = {
  server: process.env['RLS_TEST_DB_SERVER'] || '127.0.0.1',
  port: Number(process.env['RLS_TEST_DB_PORT'] || '1433'),
  user: process.env['RLS_TEST_DB_USER'] || 'dental_rcm_app',
  password: password || '',
  database: process.env['RLS_TEST_DB_NAME'] || 'dental_rcm',
  options: { trustServerCertificate: true, encrypt: true },
};

describeLive('tenant isolation, against a real database', () => {
  let pool: sql.ConnectionPool;

  beforeAll(async () => {
    pool = await new sql.ConnectionPool(config).connect();
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.close();
  });

  it('connects as a login that is NOT a database owner', async () => {
    const r = await pool.request().query<{ owner: number }>(
      "SELECT CAST(IS_ROLEMEMBER('db_owner') AS INT) AS owner",
    );

    // If this fails, nothing else in this file means anything.
    expect(r.recordset[0].owner).toBe(0);
  });

  // Deliberately no test that reads sys.security_policies. A login restricted
  // to db_datareader/db_datawriter cannot see that metadata, so such a test
  // fails on permissions whether or not the policy exists - and relaxing the
  // permissions to make it pass would weaken the very thing being tested. The
  // assertions below prove the policy by its behaviour instead.

  // dbo.appconfig is the probe: a key/value table whose tenant key is
  // customer_id, with no foreign keys, so a test can write to it with nothing
  // but db_datawriter.
  //
  // Its primary key is on [key] alone, not on ([key], customer_id), so two
  // tenants cannot hold the same key - an inherited limitation, not something
  // this test should paper over. Hence one key per tenant.
  const KEY_A = 'rls.probe.a';
  const KEY_B = 'rls.probe.b';
  const TENANT_A = 8001;
  const TENANT_B = 8002;

  const writeProbe = async (customerId: number, key: string, value: string) => {
    const req = pool.request();
    req.input('cid', sql.Int, customerId);
    req.input('k', sql.NVarChar(128), key);
    req.input('v', sql.NVarChar(256), value);
    await req.batch(`
      EXEC sp_set_session_context @key = N'customer_id', @value = @cid;
      DELETE FROM dbo.appconfig WHERE [key] = @k;
      INSERT INTO dbo.appconfig ([key], [value], updated_at, customer_id)
      VALUES (@k, @v, SYSUTCDATETIME(), @cid);
    `);
  };

  const readProbes = async (customerId: number): Promise<string[]> => {
    const req = pool.request();
    req.input('cid', sql.Int, customerId);
    const r = await req.batch(`
      EXEC sp_set_session_context @key = N'customer_id', @value = @cid;
      SELECT [value] FROM dbo.appconfig WHERE [key] LIKE 'rls.probe.%';
    `);
    return (r.recordset || []).map((row: any) => row.value);
  };

  it('shows a tenant only its own rows', async () => {
    await writeProbe(TENANT_A, KEY_A, 'belongs-to-a');
    await writeProbe(TENANT_B, KEY_B, 'belongs-to-b');

    const asA = await readProbes(TENANT_A);
    const asB = await readProbes(TENANT_B);

    // Each sees its own row.
    expect(asA).toContain('belongs-to-a');
    expect(asB).toContain('belongs-to-b');

    // Neither sees the other's. This is the assertion the whole second layer
    // exists for: without the policy both reads would return both rows.
    expect(asA).not.toContain('belongs-to-b');
    expect(asB).not.toContain('belongs-to-a');
  });

  it('refuses a write attributed to another tenant', async () => {
    const req = pool.request();
    req.input('k', sql.NVarChar(128), 'rls.probe.crossing');

    await expect(
      req.batch(`
        EXEC sp_set_session_context @key = N'customer_id', @value = ${TENANT_A};
        INSERT INTO dbo.appconfig ([key], [value], updated_at, customer_id)
        VALUES (@k, N'written across the boundary', SYSUTCDATETIME(), ${TENANT_B});
      `),
    ).rejects.toThrow();
  });

  it('returns nothing at all when the tenant context is cleared', async () => {
    // Session context lives for the life of the connection, so it has to be
    // cleared explicitly rather than merely not set - which is exactly why
    // rls-context.ts prepends the context to every batch rather than setting it
    // once per request.
    const r = await pool.request().batch(`
      EXEC sp_set_session_context @key = N'customer_id', @value = NULL;
      EXEC sp_set_session_context @key = N'see_all', @value = NULL;
      SELECT [value] FROM dbo.appconfig WHERE [key] LIKE 'rls.probe.%';
    `);

    // Fail closed: no tenant means none of the tenant-owned probe rows.
    expect(r.recordset || []).toHaveLength(0);
  });
});
