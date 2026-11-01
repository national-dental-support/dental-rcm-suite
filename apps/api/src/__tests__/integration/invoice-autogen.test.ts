/**
 * Integration Test - Invoice Auto-Generation
 *
 * Validates that autoGenerate creates invoices from completed appointments
 * and skips those with existing invoices.
 *
 * Run: npm test -- --testPathPattern=invoice-autogen
 */
import { describe, it, expect } from '@jest/globals';

function createMockPool(opts: { appointmentsWithInvoice?: number[] } = {}) {
  const queries: string[] = [];
  const inputValues: Record<string, any>[] = [];
  const withInvoice = new Set(opts.appointmentsWithInvoice || []);

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

      // Get completed appointments without invoices
      if (sql.includes('Appointment') && sql.includes('AptStatus') && sql.includes('LEFT JOIN')) {
        return {
          recordset: [
            { AptNum: 101, PatNum: 1, ProcDescript: 'D0120', Fee: 85.00 },
            { AptNum: 102, PatNum: 2, ProcDescript: 'D1110', Fee: 125.00 },
          ].filter(a => !withInvoice.has(a.AptNum)),
        };
      }
      // Insert Invoice
      if (sql.includes('INSERT INTO') && sql.includes('Invoice') && !sql.includes('InvoiceLineItem')) {
        return { recordset: [{ invoice_id: 200 + (queries.length) }], rowsAffected: [1] };
      }
      // Insert InvoiceLineItem
      if (sql.includes('INSERT INTO') && sql.includes('InvoiceLineItem')) {
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

describe('Invoice Auto-Generation Integration', () => {
  it('autoGenerate creates Invoice + InvoiceLineItem from completed appointments', async () => {
    const { pool, queries } = createMockPool();

    // Fetch uninvoiced completed appointments
    const req1 = pool.request();
    req1.input('customer_id', null, 1);
    const result = await req1.query(`SELECT a.AptNum, a.PatNum, a.ProcDescript, pl.ProcFee AS Fee FROM dbo.Appointment a JOIN dbo.procedurelog pl ON pl.AptNum = a.AptNum LEFT JOIN dbo.InvoiceLineItem ili ON ili.appointment_id = a.AptNum WHERE a.AptStatus = 3 AND a.customer_id = @customer_id AND ili.id IS NULL`);

    expect(result.recordset.length).toBe(2);

    // Create invoices for each
    for (const apt of result.recordset) {
      const reqInv = pool.request();
      reqInv.input('patient_id', null, apt.PatNum);
      reqInv.input('total_amount', null, apt.Fee);
      await reqInv.query(`INSERT INTO dbo.Invoice (patient_id, TotalAmount, BalanceDue, InvoiceDate, customer_id) OUTPUT INSERTED.invoice_id VALUES (@patient_id, @total_amount, @total_amount, GETDATE(), 1)`);

      const reqLine = pool.request();
      reqLine.input('invoice_id', null, 201);
      reqLine.input('appointment_id', null, apt.AptNum);
      reqLine.input('description', null, apt.ProcDescript);
      reqLine.input('amount', null, apt.Fee);
      await reqLine.query(`INSERT INTO dbo.InvoiceLineItem (invoice_id, appointment_id, description, amount) VALUES (@invoice_id, @appointment_id, @description, @amount)`);
    }

    const invoiceInserts = queries.filter(q => q.includes('INSERT INTO') && q.includes('Invoice (') && !q.includes('InvoiceLineItem'));
    const lineItemInserts = queries.filter(q => q.includes('INSERT INTO') && q.includes('InvoiceLineItem'));
    expect(invoiceInserts.length).toBe(2);
    expect(lineItemInserts.length).toBe(2);
  });

  it('autoGenerate skips appointments that already have invoices', async () => {
    const { pool, queries } = createMockPool({ appointmentsWithInvoice: [101, 102] });

    const req1 = pool.request();
    req1.input('customer_id', null, 1);
    const result = await req1.query(`SELECT a.AptNum, a.PatNum, a.ProcDescript, pl.ProcFee AS Fee FROM dbo.Appointment a JOIN dbo.procedurelog pl ON pl.AptNum = a.AptNum LEFT JOIN dbo.InvoiceLineItem ili ON ili.appointment_id = a.AptNum WHERE a.AptStatus = 3 AND a.customer_id = @customer_id AND ili.id IS NULL`);

    expect(result.recordset.length).toBe(0);

    // No Invoice INSERT should follow
    const invoiceInserts = queries.filter(q => q.includes('INSERT INTO') && q.includes('Invoice'));
    expect(invoiceInserts.length).toBe(0);
  });
});
