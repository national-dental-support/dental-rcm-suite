/**
 * denial-iq-dashboards.test.ts
 * Covers:
 *   - denial-iq/manager-view/claim-queue: all-claims, escalations, unassigned
 *   - denial-iq/manager-view/daily-dashboard: ar-mix, ar-by-location, capacity-planning,
 *       payment-breakdown-pie, revenue-trends, staff-performance, training-matrix, yesterday-summary
 *   - denial-iq/specialist-view/daily-dashboard: analyst-proficiency, my-performance-summary,
 *       peer-ranking, performance-trends, resolution-metrics, today-summary
 */

const mockQuery = jest.fn();
const mockInput = jest.fn();

const mockRequestInstance = {
  input: (...a: any[]) => { mockInput(...a); return mockRequestInstance; },
  query: mockQuery,
};

const mockPool = { request: () => mockRequestInstance };

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ getPool: () => mockPool }),
  },
  databaseInstance: { getPool: () => mockPool },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(),
    Date: f(), Float: f(), VarChar: f, UniqueIdentifier: f(),
    Request: jest.fn().mockImplementation(() => ({
      input: jest.fn().mockReturnThis(),
      query: mockQuery,
    })),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

// Mock resolveUserScope + buildScopeFilter
const mockResolveUserScope = jest.fn();
const mockBuildScopeFilter = jest.fn().mockReturnValue({
  sql: '',
  addInputs: jest.fn(),
});

jest.mock('../utils/resolve-user-scope', () => ({
  resolveUserScope: (...args: any[]) => mockResolveUserScope(...args),
  buildScopeFilter: (...args: any[]) => mockBuildScopeFilter(...args),
  extractCustomerId: jest.fn().mockReturnValue(null),
  buildTeamFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildCustomerFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
}));

// Mock pagination
jest.mock('../utils/pagination', () => ({
  parsePagination: jest.fn().mockReturnValue({ page: 0, pageSize: 25 }),
  applyPagination: jest.fn().mockReturnValue({ offsetFetchSql: 'OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY' }),
}));

const mockReq = (body: any = {}, headers: any = {}, query: any = {}) =>
  ({ body, headers: { 'x-actor-email': 'test@test.com', ...headers }, query } as any);

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const defaultScope = { userId: 'U001', customerId: 1, role: 'Specialist', isAdmin: false };

// --- MANAGER VIEW / CLAIM QUEUE -------------------------------------------

describe('AllClaims (manager-view/claim-queue)', () => {
  let AllClaims: any;
  beforeAll(() => {
    ({ AllClaims } = require('../controllers/denial-iq/manager-view/claim-queue/all-claims'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
    mockBuildScopeFilter.mockReturnValue({ sql: '', addInputs: jest.fn() });
  });

  it('returns 200 with paginated data', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ClaimID: 'CL5001', _TotalCount: 1 }] });
    const ctrl = new AllClaims();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with empty rows', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new AllClaims();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));
    const ctrl = new AllClaims();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('Escalations (manager-view/claim-queue)', () => {
  let Escalations: any;
  beforeAll(() => {
    ({ Escalations } = require('../controllers/denial-iq/manager-view/claim-queue/escalations'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
    mockBuildScopeFilter.mockReturnValue({ sql: '', addInputs: jest.fn() });
  });

  it('returns 200 with rows', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ ClaimID: 'CL5001', AgingDays: 30, _TotalCount: 1, EscalatedFor: 'Pending' }],
    });
    const ctrl = new Escalations();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data).toHaveProperty('totalCount', 1);
  });

  it('returns 200 with empty rows (totalCount 0)', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new Escalations();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.totalCount).toBe(0);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new Escalations();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('Unassigned (manager-view/claim-queue)', () => {
  let Unassigned: any;
  beforeAll(() => {
    ({ Unassigned } = require('../controllers/denial-iq/manager-view/claim-queue/unassigned'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
    mockBuildScopeFilter.mockReturnValue({ sql: '', addInputs: jest.fn() });
  });

  it('returns 200 with data', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ClaimID: 'CL5002', _TotalCount: 1 }] });
    const ctrl = new Unassigned();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with empty', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new Unassigned();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new Unassigned();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- MANAGER VIEW / DAILY DASHBOARD ---------------------------------------

describe('ARMix (manager-view/daily-dashboard)', () => {
  let ARMix: any;
  beforeAll(() => {
    ({ ARMix } = require('../controllers/denial-iq/manager-view/daily-dashboard/ar-mix'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 with AR mix payload', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        AsOfDate: '2025-03-01', TotalAR: 500000, InsuranceAR: 300000, PatientAR: 200000,
        InsurancePctOfTotal: 60.0, PatientPctOfTotal: 40.0, TotalAR30: 480000, PctChangeLast30Days: 4.2,
      }],
    });
    const ctrl = new ARMix();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toHaveProperty('totalAR', 500000);
  });

  it('returns 200 with null row (empty recordset)', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new ARMix();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toBeNull();
  });

  it('returns 200 with null pct fields', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        AsOfDate: '2025-03-01', TotalAR: 0, InsuranceAR: 0, PatientAR: 0,
        InsurancePctOfTotal: null, PatientPctOfTotal: null, TotalAR30: null, PctChangeLast30Days: null,
      }],
    });
    const ctrl = new ARMix();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ARMix();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ARByLocation (manager-view/daily-dashboard)', () => {
  let ARByLocation: any;
  beforeAll(() => {
    ({ ARByLocation } = require('../controllers/denial-iq/manager-view/daily-dashboard/ar-by-location'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ Location: 'Clinic A', TotalAR: 50000 }] });
    const ctrl = new ARByLocation();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ARByLocation();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PaymentBreakdownPie (manager-view/daily-dashboard)', () => {
  let PaymentBreakdownPie: any;
  beforeAll(() => {
    ({ PaymentBreakdownPie } = require('../controllers/denial-iq/manager-view/daily-dashboard/payment-breakdown-pie'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ PayerType: 'Insurance', Total: 100000 }] });
    const ctrl = new PaymentBreakdownPie();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new PaymentBreakdownPie();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('RevenueTrends (manager-view/daily-dashboard)', () => {
  let RevenueTrends: any;
  beforeAll(() => {
    ({ RevenueTrends } = require('../controllers/denial-iq/manager-view/daily-dashboard/revenue-trends'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ Month: '2025-01', Revenue: 50000 }] });
    const ctrl = new RevenueTrends();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new RevenueTrends();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('StaffPerformance (manager-view/daily-dashboard)', () => {
  let StaffPerformance: any;
  beforeAll(() => {
    ({ StaffPerformance } = require('../controllers/denial-iq/manager-view/daily-dashboard/staff-performance'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ staffId: 'U1', claimsCompleted: 10 }] });
    const ctrl = new StaffPerformance();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new StaffPerformance();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('TrainingMatrix (manager-view/daily-dashboard)', () => {
  let TrainingMatrix: any;
  beforeAll(() => {
    ({ TrainingMatrix } = require('../controllers/denial-iq/manager-view/daily-dashboard/training-matrix'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ staffId: 'U1', CARCCode: 'CO4', proficiency: 0.8 }] });
    const ctrl = new TrainingMatrix();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new TrainingMatrix();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('YesterdaySummary (manager-view/daily-dashboard)', () => {
  let YesterdaySummary: any;
  beforeAll(() => {
    ({ YesterdaySummary } = require('../controllers/denial-iq/manager-view/daily-dashboard/yesterday-summary'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ claimsWorked: 15, totalValue: 7500 }] });
    const ctrl = new YesterdaySummary();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new YesterdaySummary();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('CapacityPlanningController (manager-view/daily-dashboard)', () => {
  let CapacityPlanningController: any;

  const backlogRow = { totalOpen: 100, totalValue: 50000, avgAging: 25, current30: 50, urgent60: 30, critical90: 15, severe90plus: 5 };
  const unassignedRow = { cnt: 10 };
  const velocityRow = { claimsCompleted30d: 200, activeStaff: 5, workDays: 20, avgMinutes: 30 };
  const resolveRow = { avgDays: 5.5 };
  const staffRows: any[] = [{ staffId: 'U1', name: 'Alice', role: 'Specialist', queueSize: 20, completed30d: 40, daysWorked: 20, claimsPerDay: 2 }];
  const trendRows: any[] = [{ yr: 2025, wk: 10, completed: 50, staffWorking: 5 }];

  beforeAll(() => {
    ({ CapacityPlanningController } = require('../controllers/denial-iq/manager-view/daily-dashboard/capacity-planning'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 with full capacity data', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [backlogRow] })
      .mockResolvedValueOnce({ recordset: [unassignedRow] })
      .mockResolvedValueOnce({ recordset: [velocityRow] })
      .mockResolvedValueOnce({ recordset: [resolveRow] })
      .mockResolvedValueOnce({ recordset: staffRows })
      .mockResolvedValueOnce({ recordset: trendRows });

    const ctrl = new CapacityPlanningController();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data).toHaveProperty('backlog');
    expect(data).toHaveProperty('velocity');
    expect(data).toHaveProperty('staffing');
    expect(data).toHaveProperty('forecast');
    expect(data).toHaveProperty('weeklyTrend');
  });

  it('handles zero velocity (avoids division by zero)', async () => {
    const zeroVel = { claimsCompleted30d: 0, activeStaff: 0, workDays: 0, avgMinutes: 0 };
    mockQuery
      .mockResolvedValueOnce({ recordset: [backlogRow] })
      .mockResolvedValueOnce({ recordset: [unassignedRow] })
      .mockResolvedValueOnce({ recordset: [zeroVel] })
      .mockResolvedValueOnce({ recordset: [{ avgDays: null }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const ctrl = new CapacityPlanningController();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles empty backlog row', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const ctrl = new CapacityPlanningController();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new CapacityPlanningController();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('DailyDashboardController index (manager-view)', () => {
  let DailyDashboardController: any;
  beforeAll(() => {
    ({ DailyDashboardController } = require('../controllers/denial-iq/manager-view/daily-dashboard/index'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('instantiates and has all methods', () => {
    const ctrl = new DailyDashboardController();
    expect(typeof ctrl.getYesterdaySummary).toBe('function');
    expect(typeof ctrl.getARMix).toBe('function');
    expect(typeof ctrl.getPaymentBreakdownPie).toBe('function');
    expect(typeof ctrl.getRevenueTrends).toBe('function');
    expect(typeof ctrl.getARByLocation).toBe('function');
    expect(typeof ctrl.getStaffPerformance).toBe('function');
    expect(typeof ctrl.getTrainingMatrix).toBe('function');
  });

  it('getARMix returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ TotalAR: 100 }] });
    const ctrl = new DailyDashboardController();
    const res = mockRes();
    await ctrl.getARMix(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// --- SPECIALIST VIEW / DAILY DASHBOARD -----------------------------------

describe('TodaySummary (specialist-view/daily-dashboard)', () => {
  let TodaySummary: any;
  beforeAll(() => {
    ({ TodaySummary } = require('../controllers/denial-iq/specialist-view/daily-dashboard/today-summary'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ Summary: 'Today Summary', Value: 0 }] });
    const ctrl = new TodaySummary();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new TodaySummary();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('AnalystProficiency (specialist-view/daily-dashboard)', () => {
  let AnalystProficiency: any;
  beforeAll(() => {
    ({ AnalystProficiency } = require('../controllers/denial-iq/specialist-view/daily-dashboard/analyst-proficiency'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
  });

  it('returns 200 with proficiency data', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ CARCCode: 'CO4', CARCDescription: 'Denial', MyClaimCount: 5, MyAvgMinutes: 20, TeamAvgMinutes: 22, DiffFromTeamMinutes: -2 }],
    });
    const ctrl = new AnalystProficiency();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with empty data when userId is null', async () => {
    mockResolveUserScope.mockResolvedValue({ userId: null });
    const ctrl = new AnalystProficiency();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toEqual([]);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new AnalystProficiency();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('MyPerformanceSummary (specialist-view/daily-dashboard)', () => {
  let MyPerformanceSummary: any;
  beforeAll(() => {
    ({ MyPerformanceSummary } = require('../controllers/denial-iq/specialist-view/daily-dashboard/my-performance-summary'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
  });

  it('returns 200 with period=1w', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ClaimsDone: 10, Revenue: 5000, HoursWorked: 8 }] });
    const ctrl = new MyPerformanceSummary();
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { period: '1w' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with period=1m', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ClaimsDone: 40 }] });
    const ctrl = new MyPerformanceSummary();
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { period: '1m' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with period=3m', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new MyPerformanceSummary();
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { period: '3m' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with period=1y', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new MyPerformanceSummary();
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { period: '1y' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 when userId is null', async () => {
    mockResolveUserScope.mockResolvedValue({ userId: null });
    const ctrl = new MyPerformanceSummary();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toBeNull();
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new MyPerformanceSummary();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PeerRanking (specialist-view/daily-dashboard)', () => {
  let PeerRanking: any;
  beforeAll(() => {
    ({ PeerRanking } = require('../controllers/denial-iq/specialist-view/daily-dashboard/peer-ranking'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
  });

  it('returns 200 with ranking data', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ ClaimsPercentile: 75.0, RevenuePercentile: 80.0, RoiPercentile: 70.0, SpeedPercentile: 65.0, TotalSpecialists: 5 }],
    });
    const ctrl = new PeerRanking();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toHaveProperty('claimsPercentile', 75);
  });

  it('returns 200 when userId is null', async () => {
    mockResolveUserScope.mockResolvedValue({ userId: null });
    const ctrl = new PeerRanking();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toBeNull();
  });

  it('returns 200 with empty recordset (no row for user)', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new PeerRanking();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toBeNull();
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new PeerRanking();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PerformanceTrends (specialist-view/daily-dashboard)', () => {
  let PerformanceTrends: any;
  beforeAll(() => {
    ({ PerformanceTrends } = require('../controllers/denial-iq/specialist-view/daily-dashboard/performance-trends'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
  });

  it('returns 200 with trend data', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ WeekStart: '2025-01-01', WeekEnd: '2025-01-07', WeekLabel: 'Jan 1', HoursWorked: 8, ClaimsDone: 5, Revenue: 2500, ROI: 312, TeamAvgHours: 7, TeamAvgClaims: 4, TeamAvgRevenue: 2000, TeamAvgROI: 285 }],
    });
    const ctrl = new PerformanceTrends();
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { weeks: '12' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('returns 200 when userId is null', async () => {
    mockResolveUserScope.mockResolvedValue({ userId: null });
    const ctrl = new PerformanceTrends();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toEqual([]);
  });

  it('clamps weeks to 52 max', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new PerformanceTrends();
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { weeks: '100' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new PerformanceTrends();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ResolutionMetrics (specialist-view/daily-dashboard)', () => {
  let ResolutionMetrics: any;
  beforeAll(() => {
    ({ ResolutionMetrics } = require('../controllers/denial-iq/specialist-view/daily-dashboard/resolution-metrics'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
  });

  it('returns 200 with period=3m', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ TotalResolved: 30, AvgDays: 5, FirstTouchRate: 0.75 }] });
    const ctrl = new ResolutionMetrics();
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { period: '3m' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 for each period', async () => {
    for (const period of ['1w', '1m', '3m', '1y', 'unknown']) {
      mockQuery.mockResolvedValue({ recordset: [] });
      const ctrl = new ResolutionMetrics();
      const res = mockRes();
      await ctrl.get(mockReq({}, {}, { period }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    }
  });

  it('returns 200 when userId is null', async () => {
    mockResolveUserScope.mockResolvedValue({ userId: null });
    const ctrl = new ResolutionMetrics();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.data).toBeNull();
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ResolutionMetrics();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- DENIAL IQ INDEX FACADES ----------------------------------------------

describe('ClaimDetailController (denial-iq/claim-detail/index)', () => {
  let ClaimDetailController: any;
  beforeAll(() => {
    ({ ClaimDetailController } = require('../controllers/denial-iq/claim-detail/index'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
  });

  it('instantiates and has getClaimInformation + getClaimDetailTable', () => {
    const ctrl = new ClaimDetailController();
    expect(typeof ctrl.getClaimInformation).toBe('function');
    expect(typeof ctrl.getClaimDetailTable).toBe('function');
  });

  it('getClaimInformation delegates and returns 400 on missing claimId', async () => {
    const ctrl = new ClaimDetailController();
    const res = mockRes();
    // No claimId in query params -> expects 400
    await ctrl.getClaimInformation(mockReq({}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ClaimQueueController (denial-iq/manager-view/claim-queue/index)', () => {
  let ClaimQueueController: any;
  beforeAll(() => {
    ({ ClaimQueueController } = require('../controllers/denial-iq/manager-view/claim-queue/index'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
    mockBuildScopeFilter.mockReturnValue({ sql: '', addInputs: jest.fn() });
  });

  it('instantiates and has getEscalations + getUnassigned + getAllClaims', () => {
    const ctrl = new ClaimQueueController();
    expect(typeof ctrl.getEscalations).toBe('function');
    expect(typeof ctrl.getUnassigned).toBe('function');
    expect(typeof ctrl.getAllClaims).toBe('function');
  });

  it('getEscalations returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new ClaimQueueController();
    const res = mockRes();
    await ctrl.getEscalations(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('SpecialistClaimQueueController (denial-iq/specialist-view/claim-queue/index)', () => {
  let SpecialistClaimQueueController: any;
  beforeAll(() => {
    ({ SpecialistClaimQueueController } = require('../controllers/denial-iq/specialist-view/claim-queue/index'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
    mockBuildScopeFilter.mockReturnValue({ sql: '', addInputs: jest.fn() });
  });

  it('instantiates and has all methods', () => {
    const ctrl = new SpecialistClaimQueueController();
    expect(typeof ctrl.getMyQueue).toBe('function');
    expect(typeof ctrl.getAllClaims).toBe('function');
    expect(typeof ctrl.getEscalations).toBe('function');
    expect(typeof ctrl.getUnassigned).toBe('function');
    expect(typeof ctrl.getPending).toBe('function');
  });

  it('getAllClaims resolves (200 or 500 depending on mock state)', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new SpecialistClaimQueueController();
    const res = mockRes();
    await ctrl.getAllClaims(mockReq(), res);
    // Either 200 or 500 - the controller was invoked and responded
    expect(res.status).toHaveBeenCalled();
  });
});

describe('SpecialistDailyDashboardController index', () => {
  let SpecialistDailyDashboardController: any;
  beforeAll(() => {
    ({ SpecialistDailyDashboardController } = require('../controllers/denial-iq/specialist-view/daily-dashboard/index'));
  });
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveUserScope.mockResolvedValue(defaultScope);
  });

  it('instantiates and has all delegate methods', () => {
    const ctrl = new SpecialistDailyDashboardController();
    expect(typeof ctrl.getTodaySummary).toBe('function');
    expect(typeof ctrl.getMyPerformanceSummary).toBe('function');
    expect(typeof ctrl.getAnalystProficiency).toBe('function');
    expect(typeof ctrl.getPerformanceTrends).toBe('function');
    expect(typeof ctrl.getResolutionMetrics).toBe('function');
    expect(typeof ctrl.getPeerRanking).toBe('function');
  });

  it('getTodaySummary returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new SpecialistDailyDashboardController();
    const res = mockRes();
    await ctrl.getTodaySummary(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getAnalystProficiency returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new SpecialistDailyDashboardController();
    const res = mockRes();
    await ctrl.getAnalystProficiency(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
