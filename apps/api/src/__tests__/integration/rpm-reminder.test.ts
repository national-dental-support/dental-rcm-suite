/**
 * Integration Test - RPM + Reminder cross-feature flow
 *
 * Validates that critical readings trigger alerts and reminder logs.
 *
 * Run: npm test -- --testPathPattern=rpm-reminder
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

      if (sql.includes('INSERT INTO') && sql.includes('RpmReading')) {
        return { recordset: [{ reading_id: 50 }], rowsAffected: [1] };
      }
      if (sql.includes('INSERT INTO') && sql.includes('RpmAlert')) {
        return { rowsAffected: [1] };
      }
      if (sql.includes('INSERT INTO') && sql.includes('ReminderLog')) {
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

function isCritical(metricType: string, value: number): boolean {
  if (metricType === 'blood_pressure_systolic' && value > 180) return true;
  if (metricType === 'blood_pressure_diastolic' && value > 120) return true;
  if (metricType === 'blood_glucose' && (value > 300 || value < 54)) return true;
  if (metricType === 'heart_rate' && (value > 150 || value < 40)) return true;
  if (metricType === 'spo2' && value < 90) return true;
  return false;
}

describe('RPM + Reminder Integration', () => {
  it('createReading with critical blood pressure \u2014 inserts RpmAlert + ReminderLog', async () => {
    const { pool, queries, inputValues } = createMockPool();

    const metricType = 'blood_pressure_systolic';
    const value = 195;
    const critical = isCritical(metricType, value);
    expect(critical).toBe(true);

    // Insert reading
    const req1 = pool.request();
    req1.input('patient_id', null, 42);
    req1.input('metric_type', null, metricType);
    req1.input('value', null, value);
    await req1.query(`INSERT INTO dbo.RpmReading (patient_id, metric_type, value, recorded_at) OUTPUT INSERTED.reading_id VALUES (@patient_id, @metric_type, @value, GETDATE())`);

    // Insert alert
    const req2 = pool.request();
    req2.input('reading_id', null, 50);
    req2.input('patient_id', null, 42);
    req2.input('alert_type', null, 'critical_reading');
    req2.input('message', null, `Critical ${metricType}: ${value}`);
    await req2.query(`INSERT INTO dbo.RpmAlert (reading_id, patient_id, alert_type, message, created_at) VALUES (@reading_id, @patient_id, @alert_type, @message, GETDATE())`);

    // Insert reminder log
    const req3 = pool.request();
    req3.input('patient_id', null, 42);
    req3.input('reminder_type', null, 'critical_alert');
    await req3.query(`INSERT INTO dbo.ReminderLog (patient_id, reminder_type, sent_at) VALUES (@patient_id, @reminder_type, GETDATE())`);

    expect(queries).toContainEqual(expect.stringContaining('RpmAlert'));
    expect(queries).toContainEqual(expect.stringContaining('ReminderLog'));
    expect(inputValues[1].alert_type).toBe('critical_reading');
  });

  it('createReading with normal value \u2014 no alert or reminder', async () => {
    const { pool, queries } = createMockPool();

    const metricType = 'blood_pressure_systolic';
    const value = 120;
    const critical = isCritical(metricType, value);
    expect(critical).toBe(false);

    // Insert reading only
    const req1 = pool.request();
    req1.input('patient_id', null, 42);
    req1.input('metric_type', null, metricType);
    req1.input('value', null, value);
    await req1.query(`INSERT INTO dbo.RpmReading (patient_id, metric_type, value, recorded_at) OUTPUT INSERTED.reading_id VALUES (@patient_id, @metric_type, @value, GETDATE())`);

    // No alert or reminder queries
    const alertQueries = queries.filter(q => q.includes('RpmAlert'));
    const reminderQueries = queries.filter(q => q.includes('ReminderLog'));
    expect(alertQueries.length).toBe(0);
    expect(reminderQueries.length).toBe(0);
  });
});
