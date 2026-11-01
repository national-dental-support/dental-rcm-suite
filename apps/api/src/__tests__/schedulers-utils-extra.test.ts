/**
 * Extra coverage for schedulers and distributed-lock utility.
 * Targets uncovered branches in:
 *   - priority-scheduler.ts (getConfig with weights, proficiency weight, no pool)
 *   - report-scheduler.ts (email path, individual report errors, withLock false)
 *   - overflow-check.ts (location-based queue, isOverAged only, overflowCount <= 0)
 *   - escalation-path.ts (no user found, broadcast error, targetUserId from claim)
 *   - distributed-lock.ts (Redis path success/fail, SQL fallback, acquireLock, withLock)
 */

// --- Mock: node-cron ----------------------------------------------------------
const mockSchedule = jest.fn();
jest.mock('node-cron', () => ({
  __esModule: true,
  default: { schedule: mockSchedule },
  schedule: mockSchedule,
}));

// --- Mock: DB -----------------------------------------------------------------
const mockQuery = jest.fn<any>().mockResolvedValue({ recordset: [], rowsAffected: [0] });
const mockExecute = jest.fn<any>().mockResolvedValue({ returnValue: 0, recordset: [] });

const makeRequest = () => {
  const r: any = {
    input: jest.fn().mockReturnThis(),
    query: mockQuery,
    execute: mockExecute,
  };
  return r;
};

const mockPool: any = {
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

// --- Mock: Redis module -------------------------------------------------------
const mockRedis = {
  set: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
  get: jest.fn(),
};
let redisReturnValue: any = null; // controlled per test

jest.mock('../modules/redis', () => ({
  getRedis: jest.fn(() => redisReturnValue),
}));

// --- Mock: distributed-lock (for schedulers that use withLock) ----------------
const mockWithLock = jest.fn<any>().mockImplementation((_k: any, _t: any, fn: any) => {
  return fn().then(() => true);
});

jest.mock('../utils/distributed-lock', () => ({
  withLock: mockWithLock,
  acquireLock: jest.fn(),
}));

// --- Mock: websockets --------------------------------------------------------
const mockBroadcast = jest.fn();
jest.mock('../websockets/index', () => ({
  broadcast: mockBroadcast,
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
const mockGenerateReportData = jest.fn().mockResolvedValue({ summary: 'test' });
jest.mock('../controllers/insightflow/scheduled-reports', () => ({
  ScheduledReportsController: jest.fn().mockImplementation(() => ({
    generateReportData: mockGenerateReportData,
  })),
}));

// --- Mock: nodemailer --------------------------------------------------------
const mockSendMail = jest.fn().mockResolvedValue({});
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });
jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

// --- Mock: audit-log ---------------------------------------------------------
jest.mock('../utils/audit-log', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../utils/mailer', () => ({ sendEmail: jest.fn(), enqueueEmail: jest.fn() }));
jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getLastCronCallback(): () => Promise<void> {
  const calls = (mockSchedule as jest.MockedFunction<any>).mock.calls;
  return calls[calls.length - 1]?.[1] as () => Promise<void>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [0] });
  mockExecute.mockResolvedValue({ returnValue: 0, recordset: [] });
  mockPool.connected = true;
  mockWithLock.mockImplementation((_k: any, _t: any, fn: any) => fn().then(() => true));
  redisReturnValue = null;
});

// -----------------------------------------------------------------------------
// priority-scheduler - extra branches
// -----------------------------------------------------------------------------

describe('priority-scheduler \u2014 extra branch coverage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('recalculatePriorities: returns 0 when pool is null', async () => {
    const db = require('../modules/db').default;
    const origGetInstance = db.getInstance;
    db.getInstance = () => ({ getPool: () => null });
    const { recalculatePriorities } = require('../schedulers/priority-scheduler');
    const count = await recalculatePriorities();
    expect(count).toBe(0);
    db.getInstance = origGetInstance;
  });

  it('recalculatePriorities: uses custom weights from config', async () => {
    const { recalculatePriorities } = require('../schedulers/priority-scheduler');
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { key: 'priority_weights', value: JSON.stringify({ aging: 30, value: 30, deadline: 20, workload: 10, proficiency: 10 }) },
          { key: 'priority_recalc_enabled', value: '1' },
        ],
      })
      .mockResolvedValueOnce({ recordset: [{ affected: 15 }] }); // MERGE
    const count = await recalculatePriorities();
    expect(count).toBe(15);
  });

  it('recalculatePriorities: priority_recalc_enabled=true (string) enables it', async () => {
    const { recalculatePriorities } = require('../schedulers/priority-scheduler');
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ key: 'priority_recalc_enabled', value: 'true' }],
      })
      .mockResolvedValueOnce({ recordset: [{ affected: 7 }] });
    const count = await recalculatePriorities();
    expect(count).toBe(7);
  });

  it('recalculatePriorities: invalid JSON weights falls back to defaults', async () => {
    const { recalculatePriorities } = require('../schedulers/priority-scheduler');
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ key: 'priority_weights', value: 'not-valid-json' }],
      })
      .mockResolvedValueOnce({ recordset: [{ affected: 3 }] });
    const count = await recalculatePriorities();
    expect(count).toBe(3);
  });

  it('recalculatePriorities: getConfig throws \u2192 uses defaults and still runs', async () => {
    const { recalculatePriorities } = require('../schedulers/priority-scheduler');
    mockQuery
      .mockRejectedValueOnce(new Error('config error')) // getConfig fails
      .mockResolvedValueOnce({ recordset: [{ affected: 5 }] }); // MERGE
    const count = await recalculatePriorities();
    expect(count).toBe(5);
  });

  it('recalculatePriorities: affected is undefined \u2192 returns 0', async () => {
    const { recalculatePriorities } = require('../schedulers/priority-scheduler');
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // getConfig
      .mockResolvedValueOnce({ recordset: [{}] }); // MERGE -> no affected field
    const count = await recalculatePriorities();
    expect(count).toBe(0);
  });

  it('startPriorityScheduler: initial setTimeout fires after 10s', async () => {
    const { startPriorityScheduler } = require('../schedulers/priority-scheduler');
    mockQuery
      .mockResolvedValue({ recordset: [{ affected: 2 }] });
    startPriorityScheduler();
    // Advance fake timers past the 10s startup delay
    await jest.runAllTimersAsync();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('initial run'));
  });

  it('startPriorityScheduler: initial setTimeout handles error gracefully', async () => {
    const { startPriorityScheduler } = require('../schedulers/priority-scheduler');
    // First call (getConfig) throws
    mockQuery.mockRejectedValue(new Error('startup error'));
    startPriorityScheduler();
    await jest.runAllTimersAsync();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('initial run error'), expect.anything());
  });
});

// -----------------------------------------------------------------------------
// report-scheduler - extra branches
// -----------------------------------------------------------------------------

describe('report-scheduler \u2014 extra branch coverage', () => {
  it('scheduled callback: withLock returns false \u2192 logs skipped', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockWithLock.mockResolvedValueOnce(false); // simulate lock not acquired (false, not undefined)
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('skipped'));
  });

  it('scheduled callback: SMTP_HOST set \u2192 sends email', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'noreply@test.com';
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ id: 5, name: 'Daily AR', report_type: 'ar_summary', frequency: 'daily', recipients: 'admin@test.com' }],
      })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockSendMail).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('executed report'));
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_FROM;
  });

  it('scheduled callback: SMTP email failure is caught as warning (not error)', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockSendMail.mockRejectedValueOnce(new Error('SMTP timeout'));
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ id: 6, name: 'Alert Report', report_type: 'alert', frequency: 'weekly', recipients: 'x@x.com' }],
      })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('email failed'), expect.anything());
    delete process.env.SMTP_HOST;
  });

  it('scheduled callback: individual report generateReportData error \u2192 logs error but continues', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockGenerateReportData.mockRejectedValueOnce(new Error('generate error'));
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { id: 7, name: 'Fail Report', report_type: 'broken', frequency: 'daily', recipients: 'x@x.com' },
          { id: 8, name: 'OK Report', report_type: 'ar_summary', frequency: 'daily', recipients: 'y@y.com' },
        ],
      })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // update for report 8
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('failed to run report 7'), expect.anything());
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('executed report'));
  });

  it('scheduled callback: monthly frequency sets nextRun +1 month', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ id: 9, name: 'Monthly Report', report_type: 'monthly_ar', frequency: 'monthly', recipients: 'z@z.com' }],
      })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const callback = getLastCronCallback();
    await callback();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('executed report "Monthly Report"'));
  });

  it('scheduled callback: pool is null \u2192 returns early', async () => {
    const { startReportScheduler } = require('../schedulers/report-scheduler');
    startReportScheduler();
    const db = require('../modules/db').default;
    const origGetInstance = db.getInstance;
    db.getInstance = () => ({ getPool: () => null });
    const callback = getLastCronCallback();
    await callback();
    expect(mockQuery).not.toHaveBeenCalled();
    db.getInstance = origGetInstance;
  });
});

// -----------------------------------------------------------------------------
// overflow-check - extra branches
// -----------------------------------------------------------------------------

describe('overflow-check \u2014 extra branch coverage', () => {
  // Use a shared helper to get a fresh callback each time
  async function runOverflowCallback(configs: any[], ...queryResults: any[]) {
    // Manually clear mockSchedule calls and reset mockQuery before running
    mockSchedule.mockClear();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [0] });
    const { startOverflowCheck } = require('../schedulers/overflow-check');
    startOverflowCheck();
    mockQuery.mockResolvedValueOnce({ recordset: configs });
    for (const r of queryResults) {
      if (r instanceof Error) {
        mockQuery.mockRejectedValueOnce(r);
      } else {
        mockQuery.mockResolvedValueOnce(r);
      }
    }
    const calls = (mockSchedule as jest.MockedFunction<any>).mock.calls;
    const callback = calls[calls.length - 1]?.[1] as () => Promise<void>;
    await callback();
  }

  it('location-based queue: uses location query', async () => {
    await runOverflowCallback(
      [{ id: 2, source_queue_type: 'location', source_queue_id: 5, max_active_claims: 3, max_aging_days: 20, overflow_target_type: 'supervisor', customer_id: 1, is_active: 1 }],
      { recordset: [{ active_count: 8, max_aging: 25 }] },
      { recordset: [{ ClaimID: 'CL5010' }] },
      { recordset: [], rowsAffected: [1] },
      { recordset: [], rowsAffected: [1] },
    );
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Overflowed'));
  });

  it('isOverAged only (not over capacity) still triggers overflow warning', async () => {
    await runOverflowCallback(
      [{ id: 3, source_queue_type: 'specialist', source_queue_id: 7, max_active_claims: 100, max_aging_days: 5, overflow_target_type: 'pool', customer_id: 1, is_active: 1 }],
      { recordset: [{ active_count: 2, max_aging: 10 }] },
      { recordset: [] }, // no claims to overflow (overflowCount <= 0)
    );
    // overflowCount = 2 - 100 = -98 -> <= 0, but warn fired before return
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Rule 3 triggered'));
  });

  it('overflowCount <= 0: no claims fetched or updated', async () => {
    await runOverflowCallback(
      [{ id: 4, source_queue_type: 'specialist', source_queue_id: 9, max_active_claims: 50, max_aging_days: 1, overflow_target_type: 'pool', customer_id: 1, is_active: 1 }],
      { recordset: [{ active_count: 3, max_aging: 5 }] },
    );
    // isOverAged=true but overflowCount = 3-50 = -47 -> warn should fire
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('rule error: individual rule failure is caught and warned', async () => {
    await runOverflowCallback(
      [{ id: 5, source_queue_type: 'specialist', source_queue_id: 10, max_active_claims: 5, max_aging_days: 30, overflow_target_type: 'pool', customer_id: 1, is_active: 1 }],
      new Error('rule query failed'),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Rule 5 failed'));
  });

  it('result.recordset[0] is undefined \u2192 uses default { active_count: 0, max_aging: 0 }', async () => {
    await runOverflowCallback(
      [{ id: 6, source_queue_type: 'specialist', source_queue_id: 11, max_active_claims: 5, max_aging_days: 30, overflow_target_type: 'pool', customer_id: 1, is_active: 1 }],
      { recordset: [] }, // empty result -> recordset[0] undefined
    );
    // active_count=0, max_aging=0 -> not over capacity or age -> returns early
    expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Overflowed'));
  });
});

// -----------------------------------------------------------------------------
// escalation-path - extra branches
// -----------------------------------------------------------------------------

describe('escalation-path \u2014 extra branch coverage', () => {
  // Helper to run escalation callback in isolation
  async function runEscalationCallback(...queryResults: any[]) {
    // Manually clear schedule mock and reset query mock
    mockSchedule.mockClear();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [0] });
    const { startEscalationPathScheduler } = require('../schedulers/escalation-path');
    startEscalationPathScheduler();
    for (const r of queryResults) {
      if (r instanceof Error) {
        mockQuery.mockRejectedValueOnce(r);
      } else {
        mockQuery.mockResolvedValueOnce(r);
      }
    }
    const calls = (mockSchedule as jest.MockedFunction<any>).mock.calls;
    const callback = calls[calls.length - 1]?.[1] as () => Promise<void>;
    await callback();
  }

  it('no user found for next role \u2192 skips claim with warn log', async () => {
    await runEscalationCallback(
      { recordset: [{ ClaimID: 'CL6001', ClaimHistoryId: 'CH10', AssignedTo: 5, escalation_path_id: 2, escalation_step: 1, next_step_order: 2, next_role: 'Finance', next_user_id: null, customer_id: 1 }] },
      { recordset: [] }, // no user found
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("No user found for role 'Finance'"));
  });

  it('targetUserId provided directly in claim (no user lookup needed)', async () => {
    await runEscalationCallback(
      { recordset: [{ ClaimID: 'CL7001', ClaimHistoryId: 'CH20', AssignedTo: 5, escalation_path_id: 3, escalation_step: 2, next_step_order: 3, next_role: 'Manager', next_user_id: 99, customer_id: 1 }] },
      { recordset: [] }, // close current (no user lookup since next_user_id provided)
      { recordset: [{ ClaimHistoryId: 'CH100' }] }, // max ID
      { recordset: [] }, // insert new
    );
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Auto-escalated'));
  });

  it('broadcast throws \u2192 error is silently swallowed', async () => {
    mockBroadcast.mockImplementationOnce(() => { throw new Error('websocket error'); });
    await runEscalationCallback(
      { recordset: [{ ClaimID: 'CL8001', ClaimHistoryId: 'CH30', AssignedTo: 5, escalation_path_id: 1, escalation_step: 1, next_step_order: 2, next_role: 'Supervisor', next_user_id: 50, customer_id: 1 }] },
      { recordset: [] }, // close current
      { recordset: [{ ClaimHistoryId: 'CH50' }] }, // max ID
      { recordset: [] }, // insert new
    );
    // The broadcast error is swallowed but escalation still counted
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Auto-escalated'));
  });

  it('individual claim escalation failure \u2192 logs warn and continues to next claim', async () => {
    await runEscalationCallback(
      {
        recordset: [
          { ClaimID: 'CL9001', ClaimHistoryId: 'CH40', AssignedTo: 3, escalation_path_id: 1, escalation_step: 1, next_step_order: 2, next_role: 'Manager', next_user_id: 10, customer_id: 1 },
          { ClaimID: 'CL9002', ClaimHistoryId: 'CH41', AssignedTo: 4, escalation_path_id: 1, escalation_step: 1, next_step_order: 2, next_role: 'Manager', next_user_id: 10, customer_id: 1 },
        ],
      },
      new Error('claim 1 escalation error'), // first claim - close current throws
      { recordset: [] }, // close current (claim 2)
      { recordset: [{ ClaimHistoryId: 'CH99' }] }, // max ID
      { recordset: [] }, // insert new
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to escalate CL9001'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Auto-escalated 1'));
  });

  it('maxId recordset is empty \u2192 uses CH0 as base, generates CH1', async () => {
    await runEscalationCallback(
      { recordset: [{ ClaimID: 'CL5555', ClaimHistoryId: 'CH70', AssignedTo: 5, escalation_path_id: 1, escalation_step: 1, next_step_order: 2, next_role: 'Supervisor', next_user_id: 15, customer_id: 1 }] },
      { recordset: [] }, // close current
      { recordset: [] }, // max ID empty
      { recordset: [] }, // insert new (CH1)
    );
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Auto-escalated 1'));
  });
});

// -----------------------------------------------------------------------------
// distributed-lock - comprehensive branch coverage
// -----------------------------------------------------------------------------

describe('distributed-lock', () => {
  // Need to re-import without the mock for this suite
  // We use jest.isolateModules to get the real distributed-lock with mocked deps
  const { getRedis } = require('../modules/redis');

  beforeEach(() => {
    jest.clearAllMocks();
    (getRedis as jest.Mock).mockReturnValue(null);
    redisReturnValue = null;
    mockPool.connected = true;
    mockExecute.mockResolvedValue({ returnValue: 0, recordset: [] });
  });

  it('withLock: acquires lock, runs fn, releases \u2014 returns true', async () => {
    jest.isolateModules(() => {
      // Override the distributed-lock mock for this test
    });
    // Direct test of the real distributed-lock module
    (getRedis as jest.Mock).mockReturnValue(null); // no redis -> SQL path
    mockExecute.mockResolvedValue({ returnValue: 0 }); // acquired

    const { acquireLock, withLock } = jest.requireActual('../utils/distributed-lock') as any;

    let fnCalled = false;
    const result = await withLock('test-lock', 10, async () => {
      fnCalled = true;
    });
    expect(fnCalled).toBe(true);
    expect(result).toBe(true);
  });

  it('withLock: lock already held \u2192 fn not called, returns false', async () => {
    (getRedis as jest.Mock).mockReturnValue(null);
    mockExecute.mockResolvedValue({ returnValue: -1 }); // lock not acquired

    const { withLock } = jest.requireActual('../utils/distributed-lock') as any;

    let fnCalled = false;
    const result = await withLock('held-lock', 10, async () => {
      fnCalled = true;
    });
    expect(fnCalled).toBe(false);
    expect(result).toBe(false);
  });

  it('acquireLock: Redis path \u2014 SET returns OK \u2192 lock acquired', async () => {
    const mockRedisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };
    (getRedis as jest.Mock).mockReturnValue(mockRedisClient);

    const { acquireLock } = jest.requireActual('../utils/distributed-lock') as any;
    const release = await acquireLock('redis-lock', 30);
    expect(release).toBeTruthy();
    expect(typeof release).toBe('function');
    // Call release to exercise the Lua eval path
    await release();
    expect(mockRedisClient.eval).toHaveBeenCalled();
  });

  it('acquireLock: Redis path \u2014 SET returns null (already held) \u2192 returns null', async () => {
    const mockRedisClient = {
      set: jest.fn().mockResolvedValue(null),
      eval: jest.fn(),
    };
    (getRedis as jest.Mock).mockReturnValue(mockRedisClient);

    const { acquireLock } = jest.requireActual('../utils/distributed-lock') as any;
    const release = await acquireLock('redis-lock-held', 30);
    expect(release).toBeNull();
  });

  it('acquireLock: Redis release fails \u2192 logs warn', async () => {
    const mockRedisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockRejectedValue(new Error('redis eval error')),
    };
    (getRedis as jest.Mock).mockReturnValue(mockRedisClient);

    const { acquireLock } = jest.requireActual('../utils/distributed-lock') as any;
    const release = await acquireLock('redis-release-fail', 30);
    expect(release).toBeTruthy();
    await release(); // Should log warn but not throw
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Release failed for redis-release-fail'));
  });

  it('acquireLock: SQL path \u2014 pool not connected \u2192 returns null', async () => {
    (getRedis as jest.Mock).mockReturnValue(null);
    mockPool.connected = false;

    const { acquireLock } = jest.requireActual('../utils/distributed-lock') as any;
    const release = await acquireLock('sql-disconnected', 10);
    expect(release).toBeNull();
    mockPool.connected = true;
  });

  it('acquireLock: SQL path \u2014 returnValue < 0 \u2192 lock not acquired', async () => {
    (getRedis as jest.Mock).mockReturnValue(null);
    mockExecute.mockResolvedValue({ returnValue: -2 });

    const { acquireLock } = jest.requireActual('../utils/distributed-lock') as any;
    const release = await acquireLock('sql-held', 10);
    expect(release).toBeNull();
  });

  it('acquireLock: SQL path \u2014 execute throws \u2192 logs warn, returns null', async () => {
    (getRedis as jest.Mock).mockReturnValue(null);
    mockExecute.mockRejectedValue(new Error('sp_getapplock error'));

    const { acquireLock } = jest.requireActual('../utils/distributed-lock') as any;
    const release = await acquireLock('sql-throw', 10);
    expect(release).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Acquire failed for sql-throw'));
  });

  it('acquireLock: SQL path release fn \u2014 release throws \u2192 logs warn', async () => {
    (getRedis as jest.Mock).mockReturnValue(null);
    // First execute = acquire (success), second execute = release (throws)
    mockExecute
      .mockResolvedValueOnce({ returnValue: 0 })
      .mockRejectedValueOnce(new Error('sp_releaseapplock error'));

    jest.useFakeTimers();
    const { acquireLock } = jest.requireActual('../utils/distributed-lock') as any;
    const release = await acquireLock('sql-release-fail', 60);
    expect(release).toBeTruthy();
    await release();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Release failed for sql-release-fail'));
    jest.useRealTimers();
  });

  it('acquireLock: SQL path \u2014 TTL timeout fires sp_releaseapplock', async () => {
    (getRedis as jest.Mock).mockReturnValue(null);
    mockExecute.mockResolvedValue({ returnValue: 0 });

    jest.useFakeTimers();
    const { acquireLock } = jest.requireActual('../utils/distributed-lock') as any;
    const release = await acquireLock('sql-ttl', 1);
    expect(release).toBeTruthy();
    // Advance timer past TTL (1 second)
    jest.advanceTimersByTime(1500);
    // TTL timer should have fired sp_releaseapplock
    expect(mockExecute).toHaveBeenCalledTimes(2); // acquire + auto-release
    // Also explicitly release to clearTimeout
    await release();
    jest.useRealTimers();
  });
});
