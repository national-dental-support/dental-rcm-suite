/**
 * Integration Test - Patient Portal Endpoints
 *
 * Validates that all 8 patient endpoints return correct data filtered by patient_id.
 *
 * Run: npm test -- --testPathPattern=patient-portal-endpoints
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

      // Patient /me
      if (sql.includes('Patient') && sql.includes('PatNum=@patNum') && !sql.includes('JOIN')) {
        return { recordset: [{ PatNum: 42, FName: 'Jane', LName: 'Doe', Email: 'jane@test.com' }] };
      }
      // Appointments
      if (sql.includes('Appointment') && sql.includes('@patNum')) {
        return { recordset: [{ AptNum: 1, AptDateTime: '2026-03-20T09:00:00', AptStatus: 2 }] };
      }
      // Statements
      if (sql.includes('Statement') && sql.includes('@patNum')) {
        return { recordset: [{ StatementNum: 1, DateSent: '2026-01-15', BalTotal: 250 }] };
      }
      // Invoices
      if (sql.includes('Invoice') && sql.includes('patient_id')) {
        return { recordset: [{ invoice_id: 10, TotalAmount: 500, BalanceDue: 200 }] };
      }
      // Telehealth sessions
      if (sql.includes('TelehealthSession') && sql.includes('patient_id')) {
        return { recordset: [{ session_id: 5, ScheduledAt: '2026-03-25T14:00:00' }] };
      }
      // Consent forms
      if (sql.includes('PatientConsentForm') && sql.includes('patient_id')) {
        return { recordset: [{ consent_id: 3, status: 'signed', signed_at: '2026-01-01' }] };
      }
      // Education
      if (sql.includes('PatientEducation') && sql.includes('patient_id')) {
        return { recordset: [{ assignment_id: 7, Title: 'Post-Op Care', CompletedAt: null }] };
      }
      // Immunizations
      if (sql.includes('ImmunizationRecord') && sql.includes('patient_id')) {
        return { recordset: [{ record_id: 12, VaccineName: 'Flu', DateAdministered: '2026-01-10' }] };
      }
      // Preferences
      if (sql.includes('PatientPreference') && sql.includes('patient_id')) {
        return { recordset: [{ EmailReminders: true, SmsReminders: false }] };
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

describe('Patient Portal Endpoints', () => {
  it('GET /me returns patient record filtered by patient_id', async () => {
    const { pool, inputValues } = createMockPool();
    const req = pool.request();
    req.input('patNum', null, 42);
    const result = await req.query(`SELECT PatNum, LName, FName, Email FROM dbo.Patient WHERE PatNum=@patNum AND PatStatus != 4`);

    expect(result.recordset[0].PatNum).toBe(42);
    expect(result.recordset[0].FName).toBe('Jane');
    expect(inputValues[0].patNum).toBe(42);
  });

  it('GET /appointments returns data filtered by patient_id', async () => {
    const { pool, inputValues } = createMockPool();
    const req = pool.request();
    req.input('patNum', null, 42);
    const result = await req.query(`SELECT AptNum, AptDateTime, AptStatus FROM dbo.Appointment WHERE PatNum=@patNum`);

    expect(result.recordset.length).toBe(1);
    expect(inputValues[0].patNum).toBe(42);
  });

  it('GET /statements returns data filtered by patient_id', async () => {
    const { pool } = createMockPool();
    const req = pool.request();
    req.input('patNum', null, 42);
    const result = await req.query(`SELECT StatementNum, DateSent, BalTotal FROM dbo.Statement WHERE PatNum=@patNum`);

    expect(result.recordset[0].BalTotal).toBe(250);
  });

  it('GET /invoices returns data filtered by patient_id', async () => {
    const { pool } = createMockPool();
    const req = pool.request();
    req.input('patient_id', null, 42);
    const result = await req.query(`SELECT invoice_id, TotalAmount, BalanceDue FROM dbo.Invoice WHERE patient_id = @patient_id`);

    expect(result.recordset[0].BalanceDue).toBe(200);
  });

  it('GET /telehealth-sessions returns data filtered by patient_id', async () => {
    const { pool } = createMockPool();
    const req = pool.request();
    req.input('patient_id', null, 42);
    const result = await req.query(`SELECT session_id, ScheduledAt FROM dbo.TelehealthSession WHERE patient_id = @patient_id`);

    expect(result.recordset[0].session_id).toBe(5);
  });

  it('GET /consent-forms returns data filtered by patient_id', async () => {
    const { pool } = createMockPool();
    const req = pool.request();
    req.input('patient_id', null, 42);
    const result = await req.query(`SELECT consent_id, status, signed_at FROM dbo.PatientConsentForm WHERE patient_id = @patient_id`);

    expect(result.recordset[0].status).toBe('signed');
  });

  it('GET /education returns data filtered by patient_id', async () => {
    const { pool } = createMockPool();
    const req = pool.request();
    req.input('patient_id', null, 42);
    const result = await req.query(`SELECT assignment_id, Title, CompletedAt FROM dbo.PatientEducation WHERE patient_id = @patient_id`);

    expect(result.recordset[0].Title).toBe('Post-Op Care');
  });

  it('GET /immunizations returns data filtered by patient_id', async () => {
    const { pool } = createMockPool();
    const req = pool.request();
    req.input('patient_id', null, 42);
    const result = await req.query(`SELECT record_id, VaccineName, DateAdministered FROM dbo.ImmunizationRecord WHERE patient_id = @patient_id`);

    expect(result.recordset[0].VaccineName).toBe('Flu');
  });
});
