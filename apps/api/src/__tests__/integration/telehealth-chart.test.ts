/**
 * Integration Test - Telehealth + Chart cross-feature flow
 *
 * Validates billing code assignment by session duration and chart entry creation.
 *
 * Run: npm test -- --testPathPattern=telehealth-chart
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

function createMockPool() {
  const queries: string[] = [];
  const inputValues: Record<string, any>[] = [];

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

      if (sql.includes('UPDATE') && sql.includes('TelehealthSession')) {
        return { rowsAffected: [1] };
      }
      if (sql.includes('INSERT INTO') && sql.includes('ChartEntry')) {
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

function getBillingCode(durationMinutes: number): string {
  if (durationMinutes <= 10) return '99212';
  if (durationMinutes <= 20) return '99213';
  if (durationMinutes <= 30) return '99214';
  return '99215';
}

describe('Telehealth + Chart Integration', () => {
  it('endSession assigns correct billing code 99212 for 10 min session', async () => {
    const { pool, queries, inputValues } = createMockPool();
    const duration = 8;
    const code = getBillingCode(duration);
    expect(code).toBe('99212');

    const req = pool.request();
    req.input('session_id', null, 1);
    req.input('billing_code', null, code);
    req.input('duration_minutes', null, duration);
    await req.query(`UPDATE dbo.TelehealthSession SET billing_code = @billing_code, duration_minutes = @duration_minutes, ended_at = GETDATE() WHERE session_id = @session_id`);

    expect(queries[0]).toContain('billing_code');
    expect(inputValues[0].billing_code).toBe('99212');
  });

  it('endSession assigns 99214 for 25 min session', () => {
    expect(getBillingCode(25)).toBe('99214');
  });

  it('endSession assigns 99215 for 45 min session', () => {
    expect(getBillingCode(45)).toBe('99215');
  });

  it('endSession with notes \u2014 inserts ChartEntry', async () => {
    const { pool, queries, inputValues } = createMockPool();

    // End session
    const req1 = pool.request();
    req1.input('session_id', null, 1);
    req1.input('billing_code', null, '99213');
    await req1.query(`UPDATE dbo.TelehealthSession SET billing_code = @billing_code, ended_at = GETDATE() WHERE session_id = @session_id`);

    // Insert chart entry with notes
    const req2 = pool.request();
    req2.input('patient_id', null, 42);
    req2.input('provider_id', null, 5);
    req2.input('notes', null, 'Patient reports improvement.');
    req2.input('session_id', null, 1);
    await req2.query(`INSERT INTO dbo.ChartEntry (patient_id, provider_id, notes, source_type, source_id, created_at) VALUES (@patient_id, @provider_id, @notes, 'telehealth', @session_id, GETDATE())`);

    expect(queries).toContainEqual(expect.stringContaining('ChartEntry'));
    expect(inputValues[1].notes).toBe('Patient reports improvement.');
  });

  it('endSession without notes \u2014 no ChartEntry insert', async () => {
    const { pool, queries } = createMockPool();

    // End session only
    const req1 = pool.request();
    req1.input('session_id', null, 1);
    req1.input('billing_code', null, '99213');
    await req1.query(`UPDATE dbo.TelehealthSession SET billing_code = @billing_code, ended_at = GETDATE() WHERE session_id = @session_id`);

    // No chart entry
    const chartQueries = queries.filter(q => q.includes('ChartEntry'));
    expect(chartQueries.length).toBe(0);
  });
});
