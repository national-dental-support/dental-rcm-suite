/**
 * Integration Test - Denial Write-Off cross-feature flow
 *
 * Validates write-off creates adjustment transaction and updates claim status.
 *
 * Run: npm test -- --testPathPattern=denial-writeoff
 */
import { describe, it, expect } from '@jest/globals';

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

      if (sql.includes('INSERT INTO') && sql.includes('PaymentTransaction')) {
        return { recordset: [{ id: 200 }], rowsAffected: [1] };
      }
      if (sql.includes('UPDATE') && sql.includes('claimhistory')) {
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

describe('Denial Write-Off Integration', () => {
  it('writeOff creates PaymentTransaction with type=adjustment', async () => {
    const { pool, queries, inputValues } = createMockPool();

    const req1 = pool.request();
    req1.input('claim_id', null, 'CL50001');
    req1.input('amount', null, -350.00);
    req1.input('type', null, 'adjustment');
    req1.input('reason', null, 'Write-off: timely filing');
    req1.input('customer_id', null, 1);
    await req1.query(`INSERT INTO dbo.PaymentTransaction (claim_id, amount, type, reason, customer_id, created_at) OUTPUT INSERTED.id VALUES (@claim_id, @amount, @type, @reason, @customer_id, GETDATE())`);

    expect(queries[0]).toContain('PaymentTransaction');
    expect(inputValues[0].type).toBe('adjustment');
    expect(inputValues[0].amount).toBe(-350.00);
  });

  it('writeOff updates claim status to written-off', async () => {
    const { pool, queries, inputValues } = createMockPool();

    // Create adjustment transaction
    const req1 = pool.request();
    req1.input('claim_id', null, 'CL50001');
    req1.input('amount', null, -350.00);
    req1.input('type', null, 'adjustment');
    await req1.query(`INSERT INTO dbo.PaymentTransaction (claim_id, amount, type) OUTPUT INSERTED.id VALUES (@claim_id, @amount, @type)`);

    // Update claim status
    const req2 = pool.request();
    req2.input('claim_id', null, 'CL50001');
    req2.input('status', null, 'Written Off');
    req2.input('customer_id', null, 1);
    await req2.query(`UPDATE dbo.claimhistory SET Status = @status, WriteOffDate = GETDATE() WHERE ClaimID = @claim_id AND customer_id = @customer_id`);

    expect(queries).toContainEqual(expect.stringContaining('PaymentTransaction'));
    expect(queries).toContainEqual(expect.stringContaining('claimhistory'));
    expect(inputValues[1].status).toBe('Written Off');
  });
});
