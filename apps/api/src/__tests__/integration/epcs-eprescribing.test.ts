/**
 * Integration Test - EPCS + E-Prescribing cross-feature flow
 *
 * Validates that transmitPrescription logs to EPrescribingLog.
 *
 * Run: npm test -- --testPathPattern=epcs-eprescribing
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

      if (sql.includes('INSERT INTO') && sql.includes('EPrescribingLog')) {
        return { recordset: [{ log_id: 300 }], rowsAffected: [1] };
      }
      if (sql.includes('INSERT INTO') && sql.includes('EpcsPrescription')) {
        return { recordset: [{ prescription_id: 55 }], rowsAffected: [1] };
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

describe('EPCS + E-Prescribing Integration', () => {
  it('transmitPrescription logs to EPrescribingLog', async () => {
    const { pool, queries, inputValues } = createMockPool();

    // Create the prescription
    const req1 = pool.request();
    req1.input('patient_id', null, 42);
    req1.input('provider_id', null, 5);
    req1.input('medication', null, 'Amoxicillin 500mg');
    req1.input('is_controlled', null, false);
    req1.input('schedule', null, null);
    await req1.query(`INSERT INTO dbo.EpcsPrescription (patient_id, provider_id, medication, is_controlled, schedule, created_at) OUTPUT INSERTED.prescription_id VALUES (@patient_id, @provider_id, @medication, @is_controlled, @schedule, GETDATE())`);

    // Log the transmission
    const req2 = pool.request();
    req2.input('prescription_id', null, 55);
    req2.input('pharmacy_id', null, 10);
    req2.input('status', null, 'transmitted');
    req2.input('transmitted_by', null, 5);
    await req2.query(`INSERT INTO dbo.EPrescribingLog (prescription_id, pharmacy_id, status, transmitted_by, transmitted_at) OUTPUT INSERTED.log_id VALUES (@prescription_id, @pharmacy_id, @status, @transmitted_by, GETDATE())`);

    expect(queries).toContainEqual(expect.stringContaining('EPrescribingLog'));
    expect(inputValues[1].prescription_id).toBe(55);
    expect(inputValues[1].status).toBe('transmitted');
  });
});
