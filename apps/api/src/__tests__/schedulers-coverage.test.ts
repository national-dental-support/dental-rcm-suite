/**
 * Scheduler Coverage Test Suite
 *
 * Calls each startXxx() function, captures the scheduled callback from
 * cron.schedule.mock.calls, then invokes it to exercise the actual scheduler logic.
 * Tests both happy-path (DB returns data) and error-path (DB throws).
 *
 * Run: npm test -- --testPathPattern=schedulers-coverage
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// --- Mock: node-cron ----------------------------------------------------------
const mockSchedule = jest.fn();
jest.mock('node-cron', () => ({
  __esModule: true,
  default: { schedule: mockSchedule },
  schedule: mockSchedule,
}));

// --- Mock: DB -----------------------------------------------------------------
const mockQuery = jest.fn<any>().mockResolvedValue({ recordset: [], rowsAffected: [0] });
const makeRequest = () => {
  const r: any = {
    input: jest.fn().mockReturnThis(),
    query: mockQuery,
  };
  r.input.mockReturnValue(r);
  return r;
};
const mockPool = {
  connected: true,
  request: makeRequest,
};

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ getPool: () => mockPool }),
  },
}));

// --- Mock: logger -------------------------------------------------------------
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: mockLogger,
}));

// --- Mock: distributed-lock ---------------------------------------------------
const mockWithLock = jest.fn<any>().mockImplementation((_k: any, _t: any, fn: any) => fn());
jest.mock('../utils/distributed-lock', () => ({
  withLock: mockWithLock,
}));

// --- Mock: audit-log ---------------------------------------------------------
jest.mock('../utils/audit-log', () => ({
  writeAuditLog: jest.fn(),
}));

// --- Mock: mailer -------------------------------------------------------------
jest.mock('../utils/mailer', () => ({
  sendEmail: jest.fn(),
  enqueueEmail: jest.fn(),
}));

// --- Mock: telemetry ---------------------------------------------------------
jest.mock('../utils/telemetry', () => ({
  trackEvent: jest.fn(),
}));

// --- Mock: websockets --------------------------------------------------------
jest.mock('../websockets/index', () => ({
  broadcast: jest.fn(),
  getIo: jest.fn(),
}));

// --- Mock: mssql -------------------------------------------------------------
jest.mock('mssql', () => {
  const f: any = () => ({});
  return {
    __esModule: true,
    default: {
      NVarChar: Object.assign(f, { MAX: {} }),
      Int: {},
      Float: {},
      Bit: {},
      DateTime2: {},
      VarChar: f,
    },
    NVarChar: Object.assign(f, { MAX: {} }),
    Int: {},
    Float: {},
    Bit: {},
    DateTime2: {},
    VarChar: f,
  };
});

// --- Mock: ScheduledReportsController ----------------------------------------
jest.mock('../controllers/insightflow/scheduled-reports', () => ({
  ScheduledReportsController: jest.fn().mockImplementation(() => ({
    generateReportData: jest.fn().mockResolvedValue({ summary: 'test data' }),
  })),
}));

// --- Mock: nodemailer --------------------------------------------------------
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({}),
  }),
}));

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Returns the async callback passed to cron.schedule() at position callIndex */
function getCronCallback(callIndex = 0): () => Promise<void> {
  const calls = (mockSchedule as jest.MockedFunction<any>).mock.calls;
  const call = calls[callIndex];
  if (!call) throw new Error(`No cron.schedule call at index ${callIndex}`);
  // cron.schedule(expression, callback) - callback is arg[1]
  return call[1] as () => Promise<void>;
}

/** Gets the LAST registered cron callback */
function getLastCronCallback(): () => Promise<void> {
  const calls = (mockSchedule as jest.MockedFunction<any>).mock.calls;
  return calls[calls.length - 1]?.[1] as () => Promise<void>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [0] });
  mockPool.connected = true;
});

// -----------------------------------------------------------------------------
// Consent Expiry
// -----------------------------------------------------------------------------
describe('Scheduler: data-quality-scan', () => {
  it('startDataQualityScan registers a cron schedule', () => {
    const { startDataQualityScan } = require('../schedulers/data-quality-scan');
    startDataQualityScan();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('DataQuality'));
  });

  it('scheduled callback runs all quality checks (happy path)', async () => {
    const { startDataQualityScan } = require('../schedulers/data-quality-scan');
    startDataQualityScan();
    mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [1] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Scan complete'));
  });

  it('scheduled callback skips when pool is not connected', async () => {
    const { startDataQualityScan } = require('../schedulers/data-quality-scan');
    startDataQualityScan();
    mockPool.connected = false;
    const callback = getLastCronCallback();
    await callback();
    // query should NOT be called since pool not connected
    expect(mockQuery).not.toHaveBeenCalled();
    mockPool.connected = true;
  });

  it('scheduled callback handles DB errors gracefully', async () => {
    const { startDataQualityScan } = require('../schedulers/data-quality-scan');
    startDataQualityScan();
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const callback = getLastCronCallback();
    await expect(callback()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('DataQuality'));
  });
});

// -----------------------------------------------------------------------------
// Escalation Path
// -----------------------------------------------------------------------------
describe('Scheduler: escalation-path', () => {
  it('startEscalationPathScheduler registers a cron schedule', () => {
    const { startEscalationPathScheduler } = require('../schedulers/escalation-path');
    startEscalationPathScheduler();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('EscalationPath'));
  });

  it('scheduled callback exits early when no escalated claims', async () => {
    const { startEscalationPathScheduler } = require('../schedulers/escalation-path');
    startEscalationPathScheduler();
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('scheduled callback processes escalated claims (happy path)', async () => {
    const { startEscalationPathScheduler } = require('../schedulers/escalation-path');
    startEscalationPathScheduler();
    // First query: return escalated claims; subsequent queries: normal ops
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL5001', ClaimHistoryId: 'CH1', AssignedTo: 10,
          escalation_path_id: 1, escalation_step: 1,
          next_step_order: 2, next_role: 'Manager', next_user_id: null,
          customer_id: 1,
        }],
      })
      .mockResolvedValueOnce({ recordset: [{ userID: 20 }] })  // find user
      .mockResolvedValueOnce({ recordset: [] })                  // close current
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH5' }] }) // max ID
      .mockResolvedValueOnce({ recordset: [] });                // insert new
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Auto-escalated'));
  });

  it('scheduled callback skips when pool is not connected', async () => {
    const { startEscalationPathScheduler } = require('../schedulers/escalation-path');
    startEscalationPathScheduler();
    mockPool.connected = false;
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).not.toHaveBeenCalled();
    mockPool.connected = true;
  });

  it('scheduled callback handles errors gracefully', async () => {
    const { startEscalationPathScheduler } = require('../schedulers/escalation-path');
    startEscalationPathScheduler();
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const callback = getLastCronCallback();
    await expect(callback()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('EscalationPath'));
  });
});

// -----------------------------------------------------------------------------
// Inactivity Check
// -----------------------------------------------------------------------------
describe('Scheduler: inactivity-check', () => {
  it('startInactivityCheck registers a cron schedule', () => {
    const { startInactivityCheck } = require('../schedulers/inactivity-check');
    startInactivityCheck();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('InactivityCheck'));
  });

  it('scheduled callback skips when no inactive users', async () => {
    const { startInactivityCheck } = require('../schedulers/inactivity-check');
    startInactivityCheck();
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ value: '90' }] })   // config
      .mockResolvedValueOnce({ recordset: [] });                  // no inactive users
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('No inactive users'));
  });

  it('scheduled callback disables inactive users (happy path)', async () => {
    const { startInactivityCheck } = require('../schedulers/inactivity-check');
    startInactivityCheck();
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })  // config (no value -> defaults to 90 days)
      .mockResolvedValueOnce({
        recordset: [{
          userID: 5, FirstName: 'John', LastName: 'Doe',
          Email: 'john@test.com', Role: 'AR Specialist',
          last_login_at: null, customer_id: 1,
        }],
      })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // update
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Disabled'));
  });

  it('scheduled callback handles invalid threshold gracefully', async () => {
    const { startInactivityCheck } = require('../schedulers/inactivity-check');
    startInactivityCheck();
    mockQuery.mockResolvedValueOnce({ recordset: [{ value: 'not-a-number' }] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid threshold'));
  });

  it('scheduled callback handles pool error gracefully', async () => {
    const { startInactivityCheck } = require('../schedulers/inactivity-check');
    startInactivityCheck();
    mockQuery.mockRejectedValueOnce(new Error('pool error'));
    const callback = getLastCronCallback();
    await expect(callback()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('InactivityCheck'));
  });
});

// -----------------------------------------------------------------------------
// Overflow Check
// -----------------------------------------------------------------------------
describe('Scheduler: overflow-check', () => {
  it('startOverflowCheck registers a cron schedule', () => {
    const { startOverflowCheck } = require('../schedulers/overflow-check');
    startOverflowCheck();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('OverflowCheck'));
  });

  it('scheduled callback skips when no overflow configs', async () => {
    const { startOverflowCheck } = require('../schedulers/overflow-check');
    startOverflowCheck();
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('scheduled callback processes specialist overflow rule (happy path)', async () => {
    const { startOverflowCheck } = require('../schedulers/overflow-check');
    startOverflowCheck();
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 1, source_queue_type: 'specialist', source_queue_id: 10,
          max_active_claims: 5, max_aging_days: 30,
          overflow_target_type: 'pool', customer_id: 1, is_active: 1,
        }],
      })
      .mockResolvedValueOnce({ recordset: [{ active_count: 10, max_aging: 45 }] }) // over capacity
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5001' }, { ClaimID: 'CL5002' }] }) // claims to overflow
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }) // update claim 1
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }) // update claim 2
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // update last_triggered_at
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Overflowed'));
  });

  it('scheduled callback skips when pool not connected', async () => {
    const { startOverflowCheck } = require('../schedulers/overflow-check');
    startOverflowCheck();
    mockPool.connected = false;
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).not.toHaveBeenCalled();
    mockPool.connected = true;
  });

  it('scheduled callback handles errors gracefully', async () => {
    const { startOverflowCheck } = require('../schedulers/overflow-check');
    startOverflowCheck();
    mockQuery.mockRejectedValueOnce(new Error('overflow error'));
    const callback = getLastCronCallback();
    await expect(callback()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('OverflowCheck'));
  });
});

// -----------------------------------------------------------------------------
// Pending Expiry
// -----------------------------------------------------------------------------
describe('Scheduler: pending-expiry', () => {
  it('startPendingExpiryScheduler registers a cron schedule', () => {
    const { startPendingExpiryScheduler } = require('../schedulers/pending-expiry');
    startPendingExpiryScheduler();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('PendingExpiry'));
  });

  it('scheduled callback expires pending claims (happy path)', async () => {
    const { startPendingExpiryScheduler } = require('../schedulers/pending-expiry');
    startPendingExpiryScheduler();
    mockQuery.mockResolvedValueOnce({ rowsAffected: [5] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Expired 5'));
  });

  it('scheduled callback does nothing when no claims expire', async () => {
    const { startPendingExpiryScheduler } = require('../schedulers/pending-expiry');
    startPendingExpiryScheduler();
    mockQuery.mockResolvedValueOnce({ rowsAffected: [0] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalled();
  });

  it('scheduled callback skips when pool not connected', async () => {
    const { startPendingExpiryScheduler } = require('../schedulers/pending-expiry');
    startPendingExpiryScheduler();
    mockPool.connected = false;
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).not.toHaveBeenCalled();
    mockPool.connected = true;
  });

  it('scheduled callback handles DB errors gracefully', async () => {
    const { startPendingExpiryScheduler } = require('../schedulers/pending-expiry');
    startPendingExpiryScheduler();
    mockQuery.mockRejectedValueOnce(new Error('expiry error'));
    const callback = getLastCronCallback();
    await expect(callback()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('PendingExpiry'));
  });
});

// -----------------------------------------------------------------------------
// Priority Scheduler
// -----------------------------------------------------------------------------
describe('Scheduler: priority-scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('startPriorityScheduler registers a cron schedule and info logs', () => {
    const { startPriorityScheduler } = require('../schedulers/priority-scheduler');
    startPriorityScheduler();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('PriorityScheduler'));
  });

  it('recalculatePriorities returns 0 when disabled', async () => {
    const { recalculatePriorities } = require('../schedulers/priority-scheduler');
    mockQuery.mockResolvedValueOnce({
      recordset: [{ key: 'priority_recalc_enabled', value: 'false' }],
    });
    const count = await recalculatePriorities();
    expect(count).toBe(0);
  });

  it('recalculatePriorities returns affected count when enabled', async () => {
    const { recalculatePriorities } = require('../schedulers/priority-scheduler');
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })  // getConfig - use defaults
      .mockResolvedValueOnce({ recordset: [{ affected: 42 }], rowsAffected: [42] }); // MERGE
    const count = await recalculatePriorities();
    expect(count).toBe(42);
  });

  it('cron callback executes recalculatePriorities (happy path)', async () => {
    const { startPriorityScheduler } = require('../schedulers/priority-scheduler');
    startPriorityScheduler();
    mockQuery
      .mockResolvedValue({ recordset: [{ affected: 3 }], rowsAffected: [3] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockWithLock).toHaveBeenCalledWith('priority-scheduler', 240, expect.any(Function));
  });

  it('cron callback handles errors gracefully', async () => {
    const { startPriorityScheduler } = require('../schedulers/priority-scheduler');
    startPriorityScheduler();
    mockQuery.mockRejectedValue(new Error('priority error'));
    const callback = getLastCronCallback();
    await expect(callback()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('PriorityScheduler'),
      expect.anything()
    );
  });
});

// -----------------------------------------------------------------------------
// Report Scheduler
// -----------------------------------------------------------------------------
describe('Scheduler: report-scheduler', () => {
  it('startReportScheduler registers a cron schedule', () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ReportScheduler'));
  });

  it('scheduled callback skips when no reports due', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('scheduled callback processes due reports (happy path)', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 1, name: 'Monthly AR', report_type: 'ar_summary',
          frequency: 'daily', recipients: 'admin@test.com',
        }],
      })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // update timestamps
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('executed report'));
  });

  it('scheduled callback handles weekly frequency', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ id: 2, name: 'Weekly', report_type: 'weekly_ar', frequency: 'weekly', recipients: 'x@x.com' }],
      })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalled();
  });

  it('scheduled callback handles monthly frequency', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ id: 3, name: 'Monthly', report_type: 'monthly_ar', frequency: 'monthly', recipients: 'x@x.com' }],
      })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalled();
  });

  it('scheduled callback handles errors gracefully', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockQuery.mockRejectedValueOnce(new Error('report error'));
    const callback = getLastCronCallback();
    await expect(callback()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('ReportScheduler'),
      expect.anything()
    );
  });

  it('scheduled callback logs when lock not acquired', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    // Simulate lock not acquired - withLock returns undefined/false
    mockWithLock.mockResolvedValueOnce(undefined);
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('skipped'));
  });
});

// -----------------------------------------------------------------------------
// RPM Escalation
// -----------------------------------------------------------------------------
describe('Scheduler: sla-violation-check', () => {
  it('startSlaViolationCheck registers a cron schedule', () => {
    const { startSlaViolationCheck } = require('../schedulers/sla-violation-check');
    startSlaViolationCheck();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('SlaCheck'));
  });

  it('scheduled callback runs all violation checks (happy path)', async () => {
    const { startSlaViolationCheck } = require('../schedulers/sla-violation-check');
    startSlaViolationCheck();
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [2] })  // first touch
      .mockResolvedValueOnce({ rowsAffected: [1] })  // follow-up
      .mockResolvedValueOnce({ rowsAffected: [1] }); // resolve
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Violations')
    );
  });

  it('scheduled callback skips when pool not connected', async () => {
    const { startSlaViolationCheck } = require('../schedulers/sla-violation-check');
    startSlaViolationCheck();
    mockPool.connected = false;
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).not.toHaveBeenCalled();
    mockPool.connected = true;
  });

  it('scheduled callback handles errors gracefully', async () => {
    const { startSlaViolationCheck } = require('../schedulers/sla-violation-check');
    startSlaViolationCheck();
    mockQuery.mockRejectedValueOnce(new Error('sla error'));
    const callback = getLastCronCallback();
    await expect(callback()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('SlaCheck'));
  });

  it('scheduled callback is silent when zero violations', async () => {
    const { startSlaViolationCheck } = require('../schedulers/sla-violation-check');
    startSlaViolationCheck();
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [0] })
      .mockResolvedValueOnce({ rowsAffected: [0] })
      .mockResolvedValueOnce({ rowsAffected: [0] });
    const callback = getLastCronCallback();
    await callback();
    // info not called for violations since counts are 0
    expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Violations'));
  });
});

