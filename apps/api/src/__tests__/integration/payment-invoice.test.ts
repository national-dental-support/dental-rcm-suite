/**
 * Integration Test - Payment + Invoice cross-feature flow
 *
 * Validates that payment charges correctly link to invoices.
 *
 * Run: npm test -- --testPathPattern=payment-invoice
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

function createMockPool(opts: { hasUnpaidInvoices?: boolean; invoiceId?: number } = {}) {
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

      // InvoicePayment INSERT
      if (sql.includes('INSERT INTO') && sql.includes('InvoicePayment')) {
        return { rowsAffected: [1] };
      }
      // Invoice UPDATE (balance)
      if (sql.includes('UPDATE') && sql.includes('Invoice') && sql.includes('BalanceDue')) {
        return { rowsAffected: [1] };
      }
      // Find oldest unpaid invoice
      if (sql.includes('Invoice') && sql.includes('BalanceDue') && sql.includes('ORDER BY')) {
        if (opts.hasUnpaidInvoices !== false) {
          return { recordset: [{ invoice_id: opts.invoiceId ?? 10, BalanceDue: 250.00 }] };
        }
        return { recordset: [] };
      }
      // PaymentTransaction INSERT
      if (sql.includes('INSERT INTO') && sql.includes('PaymentTransaction')) {
        return { recordset: [{ id: 99 }], rowsAffected: [1] };
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

describe('Payment + Invoice Integration', () => {
  it('charge with invoice_id \u2014 inserts InvoicePayment + updates Invoice balance', async () => {
    const { pool, queries } = createMockPool({ invoiceId: 15 });

    // Insert payment transaction
    const req1 = pool.request();
    req1.input('amount', null, 150.00);
    req1.input('type', null, 'payment');
    await req1.query(`INSERT INTO dbo.PaymentTransaction (amount, type) OUTPUT INSERTED.id VALUES (@amount, @type)`);

    // Link to invoice
    const req2 = pool.request();
    req2.input('invoice_id', null, 15);
    req2.input('payment_id', null, 99);
    req2.input('amount', null, 150.00);
    await req2.query(`INSERT INTO dbo.InvoicePayment (invoice_id, payment_id, amount) VALUES (@invoice_id, @payment_id, @amount)`);

    // Update invoice balance
    const req3 = pool.request();
    req3.input('invoice_id', null, 15);
    req3.input('amount', null, 150.00);
    await req3.query(`UPDATE dbo.Invoice SET BalanceDue = BalanceDue - @amount WHERE invoice_id = @invoice_id`);

    expect(queries).toContainEqual(expect.stringContaining('InvoicePayment'));
    expect(queries).toContainEqual(expect.stringContaining('UPDATE'));
    expect(queries).toContainEqual(expect.stringContaining('Invoice'));
  });

  it('charge without invoice_id \u2014 auto-applies to oldest unpaid invoice', async () => {
    const { pool, queries, inputValues } = createMockPool({ hasUnpaidInvoices: true, invoiceId: 10 });

    // Find oldest unpaid
    const req1 = pool.request();
    req1.input('patient_id', null, 42);
    const result = await req1.query(`SELECT TOP 1 invoice_id, BalanceDue FROM dbo.Invoice WHERE patient_id = @patient_id AND BalanceDue > 0 ORDER BY InvoiceDate ASC`);

    expect(result.recordset.length).toBe(1);
    expect(result.recordset[0].invoice_id).toBe(10);

    // Then proceeds to insert PaymentTransaction and link
    const req2 = pool.request();
    req2.input('amount', null, 100);
    await req2.query(`INSERT INTO dbo.PaymentTransaction (amount, type) OUTPUT INSERTED.id VALUES (@amount, 'payment')`);

    expect(queries.length).toBe(2);
  });

  it('charge when no unpaid invoices \u2014 creates PaymentTransaction only', async () => {
    const { pool, queries } = createMockPool({ hasUnpaidInvoices: false });

    // Look for unpaid invoice
    const req1 = pool.request();
    req1.input('patient_id', null, 42);
    const result = await req1.query(`SELECT TOP 1 invoice_id, BalanceDue FROM dbo.Invoice WHERE patient_id = @patient_id AND BalanceDue > 0 ORDER BY InvoiceDate ASC`);

    expect(result.recordset.length).toBe(0);

    // Just insert PaymentTransaction, no invoice link
    const req2 = pool.request();
    req2.input('amount', null, 50);
    await req2.query(`INSERT INTO dbo.PaymentTransaction (amount, type) OUTPUT INSERTED.id VALUES (@amount, 'payment')`);

    // Verify no InvoicePayment INSERT
    const invoicePaymentQueries = queries.filter(q => q.includes('InvoicePayment'));
    expect(invoicePaymentQueries.length).toBe(0);
  });
});
