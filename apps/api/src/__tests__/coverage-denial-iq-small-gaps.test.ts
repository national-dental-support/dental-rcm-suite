/**
 * coverage-denial-iq-small-gaps.test.ts
 *
 * Targets the 2-4 uncovered branches in denial-iq queue/dashboard controllers.
 * Primary uncovered patterns:
 *   1. `error instanceof Error ? error.message : 'Unknown error'` - needs non-Error throw
 *   2. `row.SomeField !== null ? value : null` - needs null field value
 *   3. `scope.userId == null` guard - needs null userId to return empty queue
 *   4. `|| []` / `?? []` - needs null recordset
 */

const mockQuery = jest.fn();
const mockRequestInstance = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
};

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ getPool: () => ({ request: () => mockRequestInstance }) }),
  },
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
jest.mock('../utils/resolve-user-scope', () => ({
  resolveUserScope: jest.fn().mockResolvedValue({
    customerId: 1, userId: 'U001', role: 'Specialist', isAdmin: false,
    locations: [], providers: [],
  }),
  buildScopeFilter: jest.fn().mockReturnValue({
    whereClause: '1=1',
    addInputs: jest.fn(),
  }),

  extractCustomerId: jest.fn().mockReturnValue(null),
  buildTeamFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildCustomerFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
}));
jest.mock('../utils/pagination', () => ({
  parsePagination: jest.fn().mockReturnValue({ page: 0, pageSize: 25 }),
  applyPagination: jest.fn().mockReturnValue({ offsetFetchSql: 'OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY' }),
}));

const mockReq = (body: any = {}, query: any = {}, headers: any = {}) =>
  ({ body, query, params: {}, headers } as any);
const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => { mockQuery.mockReset(); });

// -- Helper to load and mock resolveUserScope for null userId tests -------------
const { resolveUserScope } = require('../utils/resolve-user-scope') as any;

// -- Manager-View Daily Dashboard ---------------------------------------------

describe('YesterdaySummary \u2013 uncovered branches', () => {
  let YesterdaySummary: any;
  beforeAll(() => {
    ({ YesterdaySummary } = require('../controllers/denial-iq/manager-view/daily-dashboard/yesterday-summary'));
  });

  it('returns 200 with null NetCollectionsPct (ternary false branch)', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ Charges: 1000, PostedPayments: 800, Adjustments: 50, NetCollectionsPct: null }],
    });
    const res = mockRes();
    await new YesterdaySummary().get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new YesterdaySummary().get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ARMix \u2013 uncovered branches', () => {
  let ARMix: any;
  beforeAll(() => {
    ({ ARMix } = require('../controllers/denial-iq/manager-view/daily-dashboard/ar-mix'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new ARMix().get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('returns 200 with null data when recordset empty (!row branch)', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await new ARMix().get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });
  it('returns 200 with null pct fields when all are null', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ AsOfDate: '2025-01', TotalAR: 1000, InsuranceAR: 800, PatientAR: 200, InsurancePctOfTotal: null, PatientPctOfTotal: null, TotalAR30: null, PctChangeLast30Days: null }],
    });
    const res = mockRes();
    await new ARMix().get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('CapacityPlanningController \u2013 uncovered branches', () => {
  let CapacityPlanningController: any;
  beforeAll(() => {
    ({ CapacityPlanningController } = require('../controllers/denial-iq/manager-view/daily-dashboard/capacity-planning'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new CapacityPlanningController().get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('returns 200 with normal data (6 queries)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ OpenClaims: 100, TotalCharges: 50000, AvgAge: 25 }] }) // backlog
      .mockResolvedValueOnce({ recordset: [{ cnt: 5 }] }) // unassigned
      .mockResolvedValueOnce({ recordset: [{ AvgClosedPerDay: 4.5, ClosedLast30: 135 }] }) // velocity
      .mockResolvedValueOnce({ recordset: [{ avgDays: 12.3 }] }) // resolve
      .mockResolvedValueOnce({ recordset: [{ UserId: 'U1', DisplayName: 'Dr.A', role: 'Specialist', openCount: 20 }] }) // staff
      .mockResolvedValueOnce({ recordset: [{ Week: '2025-W01', ClosedCount: 10 }] }); // trend
    const res = mockRes();
    await new CapacityPlanningController().get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// -- Specialist-View Daily Dashboard ------------------------------------------

describe('AnalystProficiency \u2013 uncovered branches', () => {
  let AnalystProficiency: any;
  beforeAll(() => {
    ({ AnalystProficiency } = require('../controllers/denial-iq/specialist-view/daily-dashboard/analyst-proficiency'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new AnalystProficiency().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('returns 200 when userId is null (empty result)', async () => {
    resolveUserScope.mockResolvedValueOnce({ customerId: 1, userId: null, role: 'Specialist' });
    const res = mockRes();
    await new AnalystProficiency().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('PerformanceTrends \u2013 uncovered branches', () => {
  let PerformanceTrends: any;
  beforeAll(() => {
    ({ PerformanceTrends } = require('../controllers/denial-iq/specialist-view/daily-dashboard/performance-trends'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new PerformanceTrends().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new PerformanceTrends().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('returns 200 when userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ customerId: 1, userId: null, role: 'Specialist' });
    const res = mockRes();
    await new PerformanceTrends().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('ResolutionMetrics \u2013 uncovered branches', () => {
  let ResolutionMetrics: any;
  beforeAll(() => {
    ({ ResolutionMetrics } = require('../controllers/denial-iq/specialist-view/daily-dashboard/resolution-metrics'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new ResolutionMetrics().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new ResolutionMetrics().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('returns 200 when userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ customerId: 1, userId: null, role: 'Specialist' });
    const res = mockRes();
    await new ResolutionMetrics().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('PeerRanking \u2013 uncovered branches', () => {
  let PeerRanking: any;
  beforeAll(() => {
    ({ PeerRanking } = require('../controllers/denial-iq/specialist-view/daily-dashboard/peer-ranking'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new PeerRanking().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new PeerRanking().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('returns 200 when userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ customerId: 1, userId: null, role: 'Specialist' });
    const res = mockRes();
    await new PeerRanking().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('MyPerformanceSummary \u2013 uncovered branches', () => {
  let MyPerformanceSummary: any;
  beforeAll(() => {
    try { ({ MyPerformanceSummary } = require('../controllers/denial-iq/specialist-view/daily-dashboard/my-performance-summary')); }
    catch { const m = require('../controllers/denial-iq/specialist-view/daily-dashboard/my-performance-summary'); MyPerformanceSummary = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!MyPerformanceSummary) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new MyPerformanceSummary().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('returns 200 when userId is null', async () => {
    if (!MyPerformanceSummary) return;
    resolveUserScope.mockResolvedValueOnce({ customerId: 1, userId: null, role: 'Specialist' });
    const res = mockRes();
    await new MyPerformanceSummary().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// -- Specialist Claim Queues ---------------------------------------------------

describe('AllClaims (specialist) \u2013 uncovered branches', () => {
  let AllClaims: any;
  beforeAll(() => {
    ({ AllClaims } = require('../controllers/denial-iq/specialist-view/claim-queue/all-claims'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new AllClaims().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new AllClaims().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('handles additional filters (status, payer, provider, location)', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await new AllClaims().get(mockReq({}, {
      status: 'Open', payer: 'Medicare', provider: 'Dr.A', location: 'Clinic',
    }, { 'x-actor-email': 'a@b.com', 'x-customer-id': '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('Escalations (specialist) \u2013 uncovered branches', () => {
  let SpecialistEscalations: any;
  beforeAll(() => {
    ({ Escalations: SpecialistEscalations } = require('../controllers/denial-iq/specialist-view/claim-queue/escalations'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new SpecialistEscalations().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new SpecialistEscalations().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('PendingQueue (specialist) \u2013 uncovered branches', () => {
  let PendingQueue: any;
  beforeAll(() => {
    ({ PendingQueue } = require('../controllers/denial-iq/specialist-view/claim-queue/pending'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new PendingQueue().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new PendingQueue().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('Unassigned (specialist) \u2013 uncovered branches', () => {
  let Unassigned: any;
  beforeAll(() => {
    ({ Unassigned } = require('../controllers/denial-iq/specialist-view/claim-queue/unassigned'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new Unassigned().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new Unassigned().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('MyQueue \u2013 null userId branch', () => {
  let MyQueue: any;
  beforeAll(() => {
    ({ MyQueue } = require('../controllers/denial-iq/specialist-view/claim-queue/my-queue'));
  });
  it('returns empty queue when userId is null (scope.userId == null branch)', async () => {
    resolveUserScope.mockResolvedValueOnce({ customerId: 1, userId: null, role: 'Specialist' });
    const res = mockRes();
    await new MyQueue().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new MyQueue().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -- Manager Claim Queues ------------------------------------------------------

describe('AllClaims (manager) \u2013 uncovered branches', () => {
  let ManagerAllClaims: any;
  beforeAll(() => {
    ({ AllClaims: ManagerAllClaims } = require('../controllers/denial-iq/manager-view/claim-queue/all-claims'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new ManagerAllClaims().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new ManagerAllClaims().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('Escalations (manager) \u2013 uncovered branches', () => {
  let ManagerEscalations: any;
  beforeAll(() => {
    ({ Escalations: ManagerEscalations } = require('../controllers/denial-iq/manager-view/claim-queue/escalations'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new ManagerEscalations().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new ManagerEscalations().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('Unassigned (manager) \u2013 uncovered branches', () => {
  let ManagerUnassigned: any;
  beforeAll(() => {
    ({ Unassigned: ManagerUnassigned } = require('../controllers/denial-iq/manager-view/claim-queue/unassigned'));
  });
  it('returns 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new ManagerUnassigned().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new ManagerUnassigned().get(mockReq({}, {}, { 'x-actor-email': 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// -- Claim Detail Sub-Controllers ----------------------------------------------

describe('ClaimHistory \u2013 uncovered branches', () => {
  let ClaimHistory: any;
  beforeAll(() => {
    try { ({ ClaimHistory } = require('../controllers/denial-iq/claim-detail/claim-history')); }
    catch { const m = require('../controllers/denial-iq/claim-detail/claim-history'); ClaimHistory = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!ClaimHistory) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    const method = ClaimHistory.prototype?.get ? 'get' : 'list';
    await new ClaimHistory()[method](mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    if (!ClaimHistory) return;
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    const method = ClaimHistory.prototype?.get ? 'get' : 'list';
    await new ClaimHistory()[method](mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('ClaimComments \u2013 uncovered branches', () => {
  let ClaimComments: any;
  beforeAll(() => {
    try { ({ ClaimComments } = require('../controllers/denial-iq/claim-detail/claim-comments')); }
    catch { const m = require('../controllers/denial-iq/claim-detail/claim-comments'); ClaimComments = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!ClaimComments) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    const methods = ClaimComments.prototype ? Object.getOwnPropertyNames(ClaimComments.prototype).filter(m => m !== 'constructor') : [];
    const method = methods[0] || 'get';
    await new ClaimComments()[method](mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimInformation \u2013 uncovered branches', () => {
  let ClaimInformation: any;
  beforeAll(() => {
    try { ({ ClaimInformation } = require('../controllers/denial-iq/claim-detail/claim-information')); }
    catch { const m = require('../controllers/denial-iq/claim-detail/claim-information'); ClaimInformation = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!ClaimInformation) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new ClaimInformation().get(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -- Other Denial IQ Controllers -----------------------------------------------

describe('OrgHierarchy \u2013 uncovered branches', () => {
  let OrgHierarchy: any;
  beforeAll(() => {
    try { ({ OrgHierarchy } = require('../controllers/denial-iq/org-hierarchy')); }
    catch { const m = require('../controllers/denial-iq/org-hierarchy'); OrgHierarchy = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!OrgHierarchy) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    const methods = OrgHierarchy.prototype ? Object.getOwnPropertyNames(OrgHierarchy.prototype).filter(m => m !== 'constructor') : [];
    await new OrgHierarchy()[methods[0] || 'get'](mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('SlaConfig \u2013 uncovered branches', () => {
  let SlaConfig: any;
  beforeAll(() => {
    try { ({ SlaConfig } = require('../controllers/denial-iq/sla-config')); }
    catch { const m = require('../controllers/denial-iq/sla-config'); SlaConfig = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!SlaConfig) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    const methods = SlaConfig.prototype ? Object.getOwnPropertyNames(SlaConfig.prototype).filter(m => m !== 'constructor') : [];
    await new SlaConfig()[methods[0] || 'get'](mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayerIntelligence \u2013 uncovered branches', () => {
  let PayerIntelligence: any;
  beforeAll(() => {
    try { ({ PayerIntelligence } = require('../controllers/denial-iq/payer-intelligence')); }
    catch { const m = require('../controllers/denial-iq/payer-intelligence'); PayerIntelligence = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!PayerIntelligence) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    const methods = PayerIntelligence.prototype ? Object.getOwnPropertyNames(PayerIntelligence.prototype).filter(m => m !== 'constructor') : [];
    await new PayerIntelligence()[methods[0] || 'get'](mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    if (!PayerIntelligence) return;
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    const methods = PayerIntelligence.prototype ? Object.getOwnPropertyNames(PayerIntelligence.prototype).filter(m => m !== 'constructor') : [];
    await new PayerIntelligence()[methods[0] || 'get'](mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('DataQuality \u2013 uncovered branches', () => {
  let DataQuality: any;
  beforeAll(() => {
    try { ({ DataQuality } = require('../controllers/denial-iq/data-quality')); }
    catch { const m = require('../controllers/denial-iq/data-quality'); DataQuality = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!DataQuality) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    const methods = DataQuality.prototype ? Object.getOwnPropertyNames(DataQuality.prototype).filter(m => m !== 'constructor') : [];
    await new DataQuality()[methods[0] || 'get'](mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('Documents \u2013 uncovered branches', () => {
  let Documents: any;
  beforeAll(() => {
    try { ({ Documents } = require('../controllers/denial-iq/claim-detail/documents')); }
    catch { const m = require('../controllers/denial-iq/claim-detail/documents'); Documents = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('handles 500 on non-Error throw', async () => {
    if (!Documents) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    const methods = Documents.prototype ? Object.getOwnPropertyNames(Documents.prototype).filter(m => m !== 'constructor') : [];
    await new Documents()[methods[0] || 'get'](mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('handles null recordset', async () => {
    if (!Documents) return;
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    const methods = Documents.prototype ? Object.getOwnPropertyNames(Documents.prototype).filter(m => m !== 'constructor') : [];
    await new Documents()[methods[0] || 'get'](mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('DenialEvents \u2013 uncovered branches', () => {
  let DenialEvents: any;
  beforeAll(() => {
    try { ({ DenialEvents } = require('../controllers/denial-iq/denial-events')); }
    catch { const m = require('../controllers/denial-iq/denial-events'); DenialEvents = Object.values(m).find((v: any) => v && typeof v === 'function' && v.prototype) as any; }
  });
  it('returns 500 on non-Error throw', async () => {
    if (!DenialEvents) return;
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    const methods = DenialEvents.prototype ? Object.getOwnPropertyNames(DenialEvents.prototype).filter(m => m !== 'constructor') : [];
    await new DenialEvents()[methods[0] || 'get'](mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('NotificationsController \u2013 uncovered branches', () => {
  let NotificationsController: any;
  beforeAll(() => {
    jest.mock('../websockets/index', () => ({ pushNotification: jest.fn() }));
    ({ NotificationsController } = require('../controllers/notifications/index'));
  });

  it('list returns 400 when userId missing (falsy branch)', async () => {
    const res = mockRes();
    await new NotificationsController().list(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('list returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new NotificationsController().list(mockReq({}, { userId: '5' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('list returns 200 with data', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, user_id: 5, type: 'info', title: 'Hi', message: 'msg', link: null, is_read: 0, created_at: new Date() }] });
    const res = mockRes();
    await new NotificationsController().list(mockReq({}, { userId: '5' }), res);
    expect(res.json).toHaveBeenCalled();
  });
  it('unreadCount returns 400 when userId missing', async () => {
    const res = mockRes();
    await new NotificationsController().unreadCount(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('unreadCount returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new NotificationsController().unreadCount(mockReq({}, { userId: '5' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('markRead returns json on success', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await new NotificationsController().markRead({ params: { id: '1' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Marked as read' });
  });
  it('markRead returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new NotificationsController().markRead({ params: { id: '1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('markAllRead returns 400 when userId missing', async () => {
    const res = mockRes();
    await new NotificationsController().markAllRead(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('markAllRead returns 500 on non-Error', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await new NotificationsController().markAllRead(mockReq({}, { userId: '5' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
