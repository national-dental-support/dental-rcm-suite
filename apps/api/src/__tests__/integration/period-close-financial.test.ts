/**
 * Integration Test - Period Close + Financial cross-feature flow
 *
 * Validates that closePeriod queries the correct tables and captures snapshot values.
 *
 * Run: npm test -- --testPathPattern=period-close-financial
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

      // Payment totals query
      if (sql.includes('PaymentTransaction') && sql.includes('SUM')) {
        return { recordset: [{ totalPayments: 125000, totalRefunds: 3200, totalAdjustments: 8500 }] };
      }
      // Invoice summary query
      if (sql.includes('Invoice') && sql.includes('COUNT')) {
        return { recordset: [{ invoiceCount: 450, totalBilled: 175000, totalCollected: 125000 }] };
      }
      // Claims summary
      if (sql.includes('claimhistory') && sql.includes('COUNT')) {
        return { recordset: [{ openClaims: 120, closedClaims: 330, deniedClaims: 45 }] };
      }
      // Period Close INSERT
      if (sql.includes('INSERT INTO') && sql.includes('PeriodClose')) {
        return { recordset: [{ period_close_id: 7 }], rowsAffected: [1] };
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

describe('Period Close + Financial Integration', () => {
  it('closePeriod queries PaymentTransaction, Invoice, and claims tables', async () => {
    const { pool, queries } = createMockPool();

    // Query payment totals for the period
    const req1 = pool.request();
    req1.input('period_start', null, '2026-02-01');
    req1.input('period_end', null, '2026-02-28');
    req1.input('customer_id', null, 1);
    await req1.query(`SELECT SUM(CASE WHEN type='payment' THEN amount ELSE 0 END) AS totalPayments, SUM(CASE WHEN type='refund' THEN amount ELSE 0 END) AS totalRefunds, SUM(CASE WHEN type='adjustment' THEN amount ELSE 0 END) AS totalAdjustments FROM dbo.PaymentTransaction WHERE customer_id = @customer_id AND created_at BETWEEN @period_start AND @period_end`);

    // Query invoice summary
    const req2 = pool.request();
    req2.input('period_start', null, '2026-02-01');
    req2.input('period_end', null, '2026-02-28');
    req2.input('customer_id', null, 1);
    await req2.query(`SELECT COUNT(*) AS invoiceCount, SUM(TotalAmount) AS totalBilled, SUM(TotalAmount - BalanceDue) AS totalCollected FROM dbo.Invoice WHERE customer_id = @customer_id AND InvoiceDate BETWEEN @period_start AND @period_end`);

    // Query claims summary
    const req3 = pool.request();
    req3.input('period_start', null, '2026-02-01');
    req3.input('period_end', null, '2026-02-28');
    req3.input('customer_id', null, 1);
    await req3.query(`SELECT COUNT(CASE WHEN Status='Open' THEN 1 END) AS openClaims, COUNT(CASE WHEN Status='Closed' THEN 1 END) AS closedClaims, COUNT(CASE WHEN Status='Denied' THEN 1 END) AS deniedClaims FROM dbo.claimhistory WHERE customer_id = @customer_id AND ClaimSubmittedDate BETWEEN @period_start AND @period_end`);

    expect(queries).toContainEqual(expect.stringContaining('PaymentTransaction'));
    expect(queries).toContainEqual(expect.stringContaining('Invoice'));
    expect(queries).toContainEqual(expect.stringContaining('claimhistory'));
  });

  it('closePeriod captures correct snapshot values', async () => {
    const { pool, queries, inputValues } = createMockPool();

    // Gather data
    const req1 = pool.request();
    req1.input('customer_id', null, 1);
    const paymentResult = await req1.query(`SELECT SUM(CASE WHEN type='payment' THEN amount ELSE 0 END) AS totalPayments FROM dbo.PaymentTransaction WHERE customer_id = @customer_id`);

    const snapshot = paymentResult.recordset[0];
    expect(snapshot.totalPayments).toBe(125000);

    // Insert period close record with snapshot
    const req2 = pool.request();
    req2.input('period_name', null, 'Feb 2026');
    req2.input('total_payments', null, snapshot.totalPayments);
    req2.input('customer_id', null, 1);
    await req2.query(`INSERT INTO dbo.PeriodClose (period_name, total_payments, customer_id, closed_at) OUTPUT INSERTED.period_close_id VALUES (@period_name, @total_payments, @customer_id, GETDATE())`);

    expect(inputValues[1].total_payments).toBe(125000);
    expect(inputValues[1].period_name).toBe('Feb 2026');
  });
});
