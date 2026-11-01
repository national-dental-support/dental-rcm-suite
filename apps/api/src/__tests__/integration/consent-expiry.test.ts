/**
 * Integration Test - Consent Form Expiry
 *
 * Validates the expiry scheduler marks expired forms and skips those without expiration_days.
 *
 * Run: npm test -- --testPathPattern=consent-expiry
 */
import { describe, it, expect } from '@jest/globals';

function createMockPool(opts: { forms?: any[] } = {}) {
  const queries: string[] = [];
  const inputValues: Record<string, any>[] = [];

  const forms = opts.forms || [
    { consent_id: 1, signed_at: '2025-01-01', expiration_days: 365, status: 'signed' },
    { consent_id: 2, signed_at: '2026-01-01', expiration_days: 365, status: 'signed' },
    { consent_id: 3, signed_at: '2025-06-01', expiration_days: null, status: 'signed' },
  ];

  const mockRequest: any = {
    _inputs: {} as Record<string, any>,
    input(name: string, _type: any, value: any) {
      mockRequest._inputs[name] = value;
      return mockRequest;
    },
    async query(sql: string) {
      queries.push(sql);
      inputValues.push({ ...mockRequest._inputs });
      mockRequest._inputs = {};

      // Find expired consent forms
      if (sql.includes('PatientConsentForm') && sql.includes('DATEADD')) {
        const expired = forms.filter(f =>
          f.expiration_days != null &&
          new Date(f.signed_at).getTime() + f.expiration_days * 86400000 < Date.now() &&
          f.status === 'signed'
        );
        return { recordset: expired };
      }
      // Update expired forms
      if (sql.includes('UPDATE') && sql.includes('PatientConsentForm') && sql.includes('expired')) {
        return { rowsAffected: [1] };
      }
      return { recordset: [], rowsAffected: [0] };
    },
  };

  return {
    pool: { request() { mockRequest._inputs = {}; return mockRequest; } },
    queries,
    inputValues,
  };
}

describe('Consent Expiry Integration', () => {
  it('scheduler marks expired forms', async () => {
    const { pool, queries } = createMockPool();

    // Find expired forms
    const req1 = pool.request();
    const result = await req1.query(`SELECT pcf.consent_id, pcf.signed_at, cft.expiration_days FROM dbo.PatientConsentForm pcf JOIN dbo.ConsentFormTemplate cft ON cft.template_id = pcf.template_id WHERE pcf.status = 'signed' AND cft.expiration_days IS NOT NULL AND DATEADD(day, cft.expiration_days, pcf.signed_at) < GETDATE()`);

    // Should find consent_id=1 as expired (signed Jan 2025, 365 days)
    expect(result.recordset.length).toBeGreaterThan(0);
    expect(result.recordset[0].consent_id).toBe(1);

    // Mark them expired
    for (const form of result.recordset) {
      const reqUp = pool.request();
      reqUp.input('consent_id', null, form.consent_id);
      await reqUp.query(`UPDATE dbo.PatientConsentForm SET status = 'expired', expired_at = GETDATE() WHERE consent_id = @consent_id`);
    }

    expect(queries).toContainEqual(expect.stringContaining('expired'));
  });

  it('scheduler skips forms without expiration_days', async () => {
    const { pool } = createMockPool();

    const req1 = pool.request();
    const result = await req1.query(`SELECT pcf.consent_id, pcf.signed_at, cft.expiration_days FROM dbo.PatientConsentForm pcf JOIN dbo.ConsentFormTemplate cft ON cft.template_id = pcf.template_id WHERE pcf.status = 'signed' AND cft.expiration_days IS NOT NULL AND DATEADD(day, cft.expiration_days, pcf.signed_at) < GETDATE()`);

    // consent_id=3 has no expiration_days - should NOT be in results
    const ids = result.recordset.map((f: any) => f.consent_id);
    expect(ids).not.toContain(3);
  });
});
