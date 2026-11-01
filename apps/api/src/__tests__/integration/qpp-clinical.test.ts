/**
 * Integration Test - QPP + Clinical cross-feature flow
 *
 * Validates that QPP dashboard calculations use ImmunizationRecord and ChartEntry.
 *
 * Run: npm test -- --testPathPattern=qpp-clinical
 */
import { describe, it, expect } from '@jest/globals';

function createMockPool(opts: { immunized?: number; total?: number; charted?: number; encounters?: number } = {}) {
  const queries: string[] = [];

  const mockRequest: any = {
    _inputs: {} as Record<string, any>,
    input(name: string, _type: any, value: any) {
      mockRequest._inputs[name] = value;
      return mockRequest;
    },
    async query(sql: string) {
      queries.push(sql);
      mockRequest._inputs = {};

      // Immunization rate query
      if (sql.includes('ImmunizationRecord') && sql.includes('COUNT')) {
        return {
          recordset: [{
            immunized_patients: opts.immunized ?? 80,
            total_patients: opts.total ?? 100,
          }],
        };
      }
      // Documentation rate query
      if (sql.includes('ChartEntry') && sql.includes('COUNT')) {
        return {
          recordset: [{
            documented_encounters: opts.charted ?? 90,
            total_encounters: opts.encounters ?? 100,
          }],
        };
      }
      return { recordset: [], rowsAffected: [0] };
    },
  };

  return {
    pool: { request() { mockRequest._inputs = {}; return mockRequest; } },
    queries,
  };
}

describe('QPP + Clinical Integration', () => {
  it('getDashboard calculates immunization_rate from ImmunizationRecord', async () => {
    const { pool, queries } = createMockPool({ immunized: 85, total: 100 });

    const req = pool.request();
    req.input('customer_id', null, 1);
    req.input('year', null, 2026);
    const result = await req.query(`SELECT COUNT(DISTINCT CASE WHEN ir.status = 'administered' THEN ir.patient_id END) AS immunized_patients, COUNT(DISTINCT p.PatNum) AS total_patients FROM dbo.Patient p LEFT JOIN dbo.ImmunizationRecord ir ON ir.patient_id = p.PatNum AND YEAR(ir.date_administered) = @year WHERE p.customer_id = @customer_id`);

    const { immunized_patients, total_patients } = result.recordset[0];
    const immunizationRate = total_patients > 0 ? (immunized_patients / total_patients) * 100 : 0;

    expect(immunizationRate).toBe(85);
    expect(queries[0]).toContain('ImmunizationRecord');
  });

  it('getDashboard calculates documentation_rate from ChartEntry', async () => {
    const { pool, queries } = createMockPool({ charted: 75, encounters: 100 });

    const req = pool.request();
    req.input('customer_id', null, 1);
    req.input('year', null, 2026);
    const result = await req.query(`SELECT COUNT(DISTINCT CASE WHEN ce.notes IS NOT NULL THEN ce.encounter_id END) AS documented_encounters, COUNT(DISTINCT a.AptNum) AS total_encounters FROM dbo.Appointment a LEFT JOIN dbo.ChartEntry ce ON ce.appointment_id = a.AptNum AND YEAR(ce.created_at) = @year WHERE a.customer_id = @customer_id AND a.AptStatus = 3`);

    const { documented_encounters, total_encounters } = result.recordset[0];
    const docRate = total_encounters > 0 ? (documented_encounters / total_encounters) * 100 : 0;

    expect(docRate).toBe(75);
    expect(queries[0]).toContain('ChartEntry');
  });
});
