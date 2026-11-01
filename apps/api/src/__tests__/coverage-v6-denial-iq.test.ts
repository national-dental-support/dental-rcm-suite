/**
 * coverage-v6-denial-iq.test.ts
 *
 * Covers remaining uncovered branches in Denial IQ specialist-view,
 * manager-view, claim-detail, and misc controllers.
 *
 * Target files:
 *   - claim-detail/documents.ts                        (3 gaps)
 *   - claim-detail/claim-comments.ts                   (2 gaps)
 *   - claim-detail/claim-history.ts                    (2 gaps)
 *   - claim-detail/cms1500.ts                          (1 gap)
 *   - claim-detail/remediation.ts                      (1 gap)
 *   - specialist-view/claim-queue/my-queue.ts          (2 gaps)
 *   - specialist-view/claim-queue/all-claims.ts        (1 gap)
 *   - specialist-view/claim-queue/escalations.ts       (1 gap)
 *   - specialist-view/claim-queue/pending.ts           (1 gap)
 *   - specialist-view/claim-queue/unassigned.ts        (1 gap)
 *   - specialist-view/daily-dashboard/analyst-proficiency.ts  (2 gaps)
 *   - specialist-view/daily-dashboard/my-performance-summary.ts (2 gaps)
 *   - specialist-view/daily-dashboard/performance-trends.ts   (1 gap)
 *   - specialist-view/daily-dashboard/resolution-metrics.ts   (1 gap)
 *   - manager-view/claim-queue/all-claims.ts           (1 gap)
 *   - manager-view/claim-queue/escalations.ts          (1 gap)
 *   - manager-view/claim-queue/unassigned.ts           (1 gap)
 *   - manager-view/daily-dashboard/capacity-planning.ts (2 gaps)
 *   - manager-view/daily-dashboard/ar-mix.ts           (1 gap)
 *   - denial-iq/data-quality.ts                        (2 gaps)
 *   - denial-iq/org-hierarchy.ts                       (2 gaps)
 *   - denial-iq/auto-assignment.ts                     (1 gap)
 *   - denial-iq/sla-config.ts                          (1 gap)
 */

// --- Shared mock state - declared BEFORE jest.mock() calls -------------------

const mockQuery = jest.fn();
const mockRequestInstance: any = {
  input: jest.fn().mockReturnThis(),
  query: mockQuery,
};
const mockPoolRequest = jest.fn(() => mockRequestInstance);
const mockPool: any = { request: mockPoolRequest };

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => mockPool,
    }),
  },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/resolve-user-scope', () => ({
  resolveUserScope: jest.fn(),
  buildScopeFilter: jest.fn().mockReturnValue({
    sql: '',
    addInputs: jest.fn(),
  }),

  extractCustomerId: jest.fn().mockReturnValue(null),
  buildTeamFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildCustomerFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
}));

jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

jest.mock('../utils/pagination', () => ({
  parsePagination: jest.fn().mockReturnValue({ page: 0, pageSize: 25 }),
  applyPagination: jest.fn().mockReturnValue({ offsetFetchSql: 'OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY' }),
}));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  const fWithMax = Object.assign(f, { MAX: f() });
  return {
    __esModule: true,
    default: {
      NVarChar: fWithMax,
      Int: f(),
      BigInt: f(),
      Decimal: f,
      Bit: f(),
      DateTime: f(),
      Date: f(),
      Float: f(),
      VarChar: f,
      UniqueIdentifier: f(),
      SmallInt: f(),
      MAX: f(),
    },
    NVarChar: fWithMax,
    Int: f(),
    BigInt: f(),
    Decimal: f,
    Bit: f(),
    DateTime: f(),
    Date: f(),
    Float: f(),
    VarChar: f,
    UniqueIdentifier: f(),
    SmallInt: f(),
    MAX: f(),
    Request: jest.fn().mockImplementation(() => mockRequestInstance),
  };
});

jest.mock('../databaseManager', () => ({
  dbConfig: { server: 'test', database: 'test', user: 'sa', password: 'pw' },
}));

// --- Helpers -----------------------------------------------------------------

import { resolveUserScope as _resolveUserScope } from '../utils/resolve-user-scope';
const resolveUserScope = _resolveUserScope as jest.Mock;

function makeReq(overrides: Partial<{
  headers: Record<string, string>;
  query: Record<string, string>;
  body: any;
  params: Record<string, string>;
  file: any;
}> = {}): any {
  return { headers: {}, query: {}, body: {}, params: {}, ...overrides };
}

function makeRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

function withRows(rows: any[]): void {
  mockQuery.mockResolvedValueOnce({ recordset: rows });
}

const defaultScope = {
  userId: 42,
  customerId: 1,
  isSuperAdmin: false,
  locations: [],
  providers: [],
  payers: [],
};

beforeEach(() => {
  mockQuery.mockReset();
  mockRequestInstance.input.mockClear();
  resolveUserScope.mockResolvedValue(defaultScope);
});

// -----------------------------------------------------------------------------
//  ClaimDocumentsController
// -----------------------------------------------------------------------------

describe('ClaimDocumentsController \u2013 remaining gaps', () => {
  let ClaimDocumentsController: any;
  beforeAll(() => {
    ({ ClaimDocumentsController } = require('../controllers/denial-iq/claim-detail/documents'));
  });

  // upload: file present but claimId missing (line 54-55 false branch)
  it('upload returns 400 when claimId is missing from body', async () => {
    const ctrl = new ClaimDocumentsController();
    (ctrl as any).pool = mockPool;
    const req = makeReq({ file: { originalname: 'test.pdf', mimetype: 'application/pdf', size: 100, buffer: Buffer.from('x') }, body: {} });
    const res = makeRes();
    await ctrl.upload(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'claimId is required' }));
  });

  // download: docId parses but row is null -> 404 (line 121-123)
  it('download returns 404 when document not found in db', async () => {
    const ctrl = new ClaimDocumentsController();
    (ctrl as any).pool = mockPool;
    withRows([]); // empty recordset -> row is undefined
    const req = makeReq({ params: { id: '999' } });
    const res = makeRes();
    await ctrl.download(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // remove: 500 on db error
  it('remove returns 500 on db error', async () => {
    const ctrl = new ClaimDocumentsController();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ params: { id: '5' } });
    const res = makeRes();
    await ctrl.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  ClaimCommentsController
// -----------------------------------------------------------------------------

describe('ClaimCommentsController \u2013 remaining gaps', () => {
  let ClaimCommentsController: any;
  beforeAll(() => {
    ({ ClaimCommentsController } = require('../controllers/denial-iq/claim-detail/claim-comments'));
  });

  // addComment: allMentions.length > 0 (notification path) - second query succeeds
  it('addComment sends notifications when body contains @mentions', async () => {
    const ctrl = new ClaimCommentsController();
    (ctrl as any).pool = mockPool;
    // first query: insert comment, return comment row
    withRows([{ id: 1, claimId: 'CL50001', authorName: 'Alice', authorRole: 'ar-specialist', body: 'hi @user@example.com' }]);
    // second query: notification insert
    withRows([]);
    const req = makeReq({
      params: { claimId: 'CL50001' },
      body: { body: 'hi @user@example.com', mentions: [] },
      headers: {},
    });
    (req as any).user = { email: 'alice@example.com' };
    const res = makeRes();
    await ctrl.addComment(req, res);
    expect(res.json).toHaveBeenCalled();
  });

  // getComments: 500 on db error
  it('getComments returns 500 on db error', async () => {
    const ctrl = new ClaimCommentsController();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ params: { claimId: 'CL50001' } });
    const res = makeRes();
    await ctrl.getComments(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  ClaimHistoryController
// -----------------------------------------------------------------------------

describe('ClaimHistoryController \u2013 remaining gaps', () => {
  let ClaimHistoryController: any;
  beforeAll(() => {
    ({ ClaimHistoryController } = require('../controllers/denial-iq/claim-detail/claim-history'));
  });

  // getHistory: ClaimWorkEndedTime present (action = "Closed - work ended" branch)
  it('getHistory uses ClaimWorkEndedTime branch when row has end time', async () => {
    const ctrl = new ClaimHistoryController();
    (ctrl as any).pool = mockPool;
    // history rows (histReq)
    withRows([{ ClaimHistoryId: 'CH1', ClaimID: 'CL50001', ClaimStatus: 'Closed', AssignedToName: 'Bob Smith', AssignedToRole: 'AR Specialist', ClaimWorkStartedTime: '2025-01-01', ClaimWorkEndedTime: '2025-01-02', ClaimBalanceDue: 100, CARCCode: '97', Progress: 50, ClaimModifiedDate: '2025-01-02' }]);
    // notes rows (noteReq)
    withRows([{ id: 1, claim_id: 'CL50001', step_id: null, author_user_id: 'user1', note_text: 'a note', note_type: 'general', created_at: '2025-01-01' }]);
    // steps rows (stepReq)
    withRows([{ id: 2, claim_id: 'CL50001', step_id: 1, completed_by: 'user1', completed_at: '2025-01-01', step_title: 'Step A' }]);
    // claim events (evtReq)
    withRows([]);
    // SLA events (slaReq)
    withRows([]);
    const req = makeReq({ query: { claimId: 'CL50001' } });
    const res = makeRes();
    await ctrl.getHistory(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
    // action should include "work ended"
    const body = res.json.mock.calls[0][0];
    expect(body.data.some((e: any) => e.action && e.action.includes('work ended'))).toBe(true);
  });

  // getHistory: 500 on error
  it('getHistory returns 500 on db error', async () => {
    const ctrl = new ClaimHistoryController();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ query: { claimId: 'CL50001' } });
    const res = makeRes();
    await ctrl.getHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Cms1500Controller
// -----------------------------------------------------------------------------

describe('Cms1500Controller \u2013 remaining gaps', () => {
  let Cms1500Controller: any;
  beforeAll(() => {
    ({ Cms1500Controller } = require('../controllers/denial-iq/claim-detail/cms1500'));
  });

  // get: row exists but DenialCode is empty -> no denied-badge rendered (false branch on line 99)
  it('get returns 200 HTML and handles empty DenialCode', async () => {
    const ctrl = new Cms1500Controller();
    (ctrl as any).pool = mockPool;
    withRows([{
      ClaimID: 'CL50001', DateOfService: '2025-01-01', ClaimSubmittedDate: '2025-01-02',
      ChargeAmt: 150, PatientName: 'John Doe', PatientDOB: '1980-05-10',
      PatientAddress: '', PatientCity: '', PatientState: '', PatientZip: '',
      PayerName: 'Aetna', MemberID: 'M12345', GroupNum: '',
      SubscriberName: '', ProviderName: 'Dr Smith', ProviderNPI: '1234567890',
      ProviderTaxID: '111223333', PracticeAddress: '123 Main St',
      ProcCode: '99213', DiagCode: '', DenialCode: '', LineCharge: '150',
      InsPayAmt: '', ClaimStatus: 'Denied',
    }]);
    const req = makeReq({ query: { claimId: 'CL50001' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.send).toHaveBeenCalled();
    const html = res.send.mock.calls[0][0] as string;
    expect(html).toContain('CMS-1500');
    // When DenialCode is empty, no "DENIED: ..." badge is rendered (the CSS class still appears in <style>)
    expect(html).not.toContain('DENIED:');
  });
});

// -----------------------------------------------------------------------------
//  ClaimRemediationController
// -----------------------------------------------------------------------------

describe('ClaimRemediationController \u2013 remaining gaps', () => {
  let ClaimRemediationController: any;
  beforeAll(() => {
    ({ ClaimRemediationController } = require('../controllers/denial-iq/claim-detail/remediation'));
  });

  // getSteps: claimReasonCodeStripped !== claimReasonCode (CO-prefixed, returns stripped version)
  it('getSteps returns stripped reason code when CO-prefixed', async () => {
    const ctrl = new ClaimRemediationController();
    (ctrl as any).pool = mockPool;
    // reason_code query: returns 'CO97' -> stripped = '97'
    withRows([{ reason_code: 'CO97' }]);
    // step set query: returns a set
    withRows([{ id: 10, reason_code: '97', role: 'ar-specialist', version: 1, updated_at: '2025-01-01', published_at: '2025-01-01' }]);
    // steps query
    withRows([{ id: 1, sort_order: 1, title: 'Step 1', body: 'Do this', required: true, cl_id: null, cl_sort: null, item_text: null }]);
    // completions query
    withRows([]);
    const req = makeReq({ query: { claimId: 'CL50001', role: 'ar-specialist' } });
    const res = makeRes();
    await ctrl.getSteps(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    // When stripped != original, returns stripped code
    expect(body.claimReasonCode).toBe('97');
  });
});

// -----------------------------------------------------------------------------
//  Specialist MyQueue
// -----------------------------------------------------------------------------

describe('Specialist MyQueue \u2013 remaining gaps', () => {
  let MyQueue: any;
  beforeAll(() => {
    ({ MyQueue } = require('../controllers/denial-iq/specialist-view/claim-queue/my-queue'));
  });

  // scope.userId == null -> returns empty data (line 18-20)
  it('get returns empty data when user scope userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ ...defaultScope, userId: null });
    const ctrl = new MyQueue();
    (ctrl as any).pool = mockPool;
    const req = makeReq({ headers: { 'x-actor-email': 'nobody@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });

  // rows.length > 0 -> totalCount comes from rows[0]._TotalCount
  it('get returns totalCount from first row when rows are present', async () => {
    const ctrl = new MyQueue();
    (ctrl as any).pool = mockPool;
    withRows([
      { ClaimID: 'CL50001', PatientName: 'Alice', _TotalCount: 5 },
    ]);
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.totalCount).toBe(5);
  });
});

// -----------------------------------------------------------------------------
//  Specialist AllClaims
// -----------------------------------------------------------------------------

describe('Specialist AllClaims \u2013 remaining gaps', () => {
  let AllClaims: any;
  beforeAll(() => {
    ({ AllClaims } = require('../controllers/denial-iq/specialist-view/claim-queue/all-claims'));
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new AllClaims();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Specialist Escalations
// -----------------------------------------------------------------------------

describe('Specialist Escalations \u2013 remaining gaps', () => {
  let Escalations: any;
  beforeAll(() => {
    ({ Escalations } = require('../controllers/denial-iq/specialist-view/claim-queue/escalations'));
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new Escalations();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Specialist PendingQueue
// -----------------------------------------------------------------------------

describe('Specialist PendingQueue \u2013 remaining gaps', () => {
  let PendingQueue: any;
  beforeAll(() => {
    ({ PendingQueue } = require('../controllers/denial-iq/specialist-view/claim-queue/pending'));
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new PendingQueue();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Specialist Unassigned
// -----------------------------------------------------------------------------

describe('Specialist Unassigned \u2013 remaining gaps', () => {
  let Unassigned: any;
  beforeAll(() => {
    ({ Unassigned } = require('../controllers/denial-iq/specialist-view/claim-queue/unassigned'));
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new Unassigned();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Specialist AnalystProficiency
// -----------------------------------------------------------------------------

describe('AnalystProficiency \u2013 remaining gaps', () => {
  let AnalystProficiency: any;
  beforeAll(() => {
    ({ AnalystProficiency } = require('../controllers/denial-iq/specialist-view/daily-dashboard/analyst-proficiency'));
  });

  // scope.userId == null -> returns empty data
  it('get returns empty data when userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ ...defaultScope, userId: null });
    const ctrl = new AnalystProficiency();
    (ctrl as any).pool = mockPool;
    const req = makeReq({ headers: { 'x-actor-email': 'nobody@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new AnalystProficiency();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Specialist MyPerformanceSummary
// -----------------------------------------------------------------------------

describe('MyPerformanceSummary \u2013 remaining gaps', () => {
  let MyPerformanceSummary: any;
  beforeAll(() => {
    ({ MyPerformanceSummary } = require('../controllers/denial-iq/specialist-view/daily-dashboard/my-performance-summary'));
  });

  // scope.userId == null -> returns null data
  it('get returns null data when userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ ...defaultScope, userId: null });
    const ctrl = new MyPerformanceSummary();
    (ctrl as any).pool = mockPool;
    const req = makeReq({ headers: { 'x-actor-email': 'nobody@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });

  // row is null (empty recordset) -> returns null data
  it('get returns null data when query returns empty recordset', async () => {
    const ctrl = new MyPerformanceSummary();
    (ctrl as any).pool = mockPool;
    // cfg query
    withRows([]);
    // main query: empty
    withRows([]);
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' }, query: { period: '1m' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toBeNull();
  });
});

// -----------------------------------------------------------------------------
//  Specialist PerformanceTrends
// -----------------------------------------------------------------------------

describe('PerformanceTrends \u2013 remaining gaps', () => {
  let PerformanceTrends: any;
  beforeAll(() => {
    ({ PerformanceTrends } = require('../controllers/denial-iq/specialist-view/daily-dashboard/performance-trends'));
  });

  // scope.userId == null -> returns empty data
  it('get returns empty data when userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ ...defaultScope, userId: null });
    const ctrl = new PerformanceTrends();
    (ctrl as any).pool = mockPool;
    const req = makeReq({ headers: { 'x-actor-email': 'nobody@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });
});

// -----------------------------------------------------------------------------
//  Specialist ResolutionMetrics
// -----------------------------------------------------------------------------

describe('ResolutionMetrics \u2013 remaining gaps', () => {
  let ResolutionMetrics: any;
  beforeAll(() => {
    ({ ResolutionMetrics } = require('../controllers/denial-iq/specialist-view/daily-dashboard/resolution-metrics'));
  });

  // scope.userId == null -> returns null data
  it('get returns null data when userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ ...defaultScope, userId: null });
    const ctrl = new ResolutionMetrics();
    (ctrl as any).pool = mockPool;
    const req = makeReq({ headers: { 'x-actor-email': 'nobody@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });
});

// -----------------------------------------------------------------------------
//  Manager AllClaims
// -----------------------------------------------------------------------------

describe('Manager AllClaims \u2013 remaining gaps', () => {
  let AllClaimsManager: any;
  beforeAll(() => {
    ({ AllClaims: AllClaimsManager } = require('../controllers/denial-iq/manager-view/claim-queue/all-claims'));
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new AllClaimsManager();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ headers: { 'x-actor-email': 'mgr@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Manager Escalations
// -----------------------------------------------------------------------------

describe('Manager Escalations \u2013 remaining gaps', () => {
  let EscalationsManager: any;
  beforeAll(() => {
    ({ Escalations: EscalationsManager } = require('../controllers/denial-iq/manager-view/claim-queue/escalations'));
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new EscalationsManager();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ headers: { 'x-actor-email': 'mgr@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Manager Unassigned
// -----------------------------------------------------------------------------

describe('Manager Unassigned \u2013 remaining gaps', () => {
  let UnassignedManager: any;
  beforeAll(() => {
    ({ Unassigned: UnassignedManager } = require('../controllers/denial-iq/manager-view/claim-queue/unassigned'));
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new UnassignedManager();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ headers: { 'x-actor-email': 'mgr@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Manager CapacityPlanningController
// -----------------------------------------------------------------------------

describe('CapacityPlanningController \u2013 remaining gaps', () => {
  let CapacityPlanningController: any;
  beforeAll(() => {
    ({ CapacityPlanningController } = require('../controllers/denial-iq/manager-view/daily-dashboard/capacity-planning'));
  });

  // teamClaimsPerDay > 0 -> daysToCloseBacklog = Math.ceil(...) non-zero
  it('get computes daysToCloseBacklog when teamClaimsPerDay > 0', async () => {
    const ctrl = new CapacityPlanningController();
    (ctrl as any).pool = mockPool;
    // backlogResult: totalOpen=100, totalValue=50000, avgAging=45, buckets filled
    withRows([{ totalOpen: 100, totalValue: 50000, avgAging: 45, current30: 20, urgent60: 30, critical90: 25, severe90plus: 25 }]);
    // unassignedResult
    withRows([{ cnt: 10 }]);
    // velocityResult: claimsCompleted30d=60, activeStaff=3, workDays=20, avgMinutes=25
    withRows([{ claimsCompleted30d: 60, activeStaff: 3, workDays: 20, avgMinutes: 25 }]);
    // resolveResult
    withRows([{ avgDays: 12 }]);
    // staffResult
    withRows([{ staffId: 1, name: 'Alice', role: 'AR Specialist', queueSize: 10, completed30d: 20, daysWorked: 10, claimsPerDay: 2 }]);
    // trendResult
    withRows([{ yr: 2025, wk: 10, completed: 5, staffWorking: 2 }]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.forecast.daysToCloseBacklog).toBeGreaterThan(0);
  });

  // 500 on db error
  it('get returns 500 on db error', async () => {
    const ctrl = new CapacityPlanningController();
    (ctrl as any).pool = mockPool;
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Manager ARMix
// -----------------------------------------------------------------------------

describe('ARMix \u2013 remaining gaps', () => {
  let ARMix: any;
  beforeAll(() => {
    ({ ARMix } = require('../controllers/denial-iq/manager-view/daily-dashboard/ar-mix'));
  });

  // row is null (empty recordset) -> returns null data (line 96-100)
  it('get returns null data when query returns empty recordset', async () => {
    const ctrl = new ARMix();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });
});

// -----------------------------------------------------------------------------
//  data-quality.ts
// -----------------------------------------------------------------------------

describe('data-quality \u2013 remaining gaps', () => {
  let dq: any;
  beforeAll(() => {
    dq = require('../controllers/denial-iq/data-quality');
  });

  // listQuarantined: default status='open', page=0, pageSize=25
  it('listQuarantined uses default params and returns data', async () => {
    withRows([{ id: 1, rule_code: 'DQ001', status: 'open', rule_description: 'Missing field' }]);
    withRows([{ total: 1 }]);
    const req = makeReq({ query: {} });
    const res = makeRes();
    await dq.listQuarantined(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // listDuplicates: default action='flagged'
  it('listDuplicates uses default action param', async () => {
    withRows([{ id: 1, action_taken: 'flagged', reviewed_by_name: null }]);
    const req = makeReq({ query: {} });
    const res = makeRes();
    await dq.listDuplicates(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });
});

// -----------------------------------------------------------------------------
//  org-hierarchy.ts
// -----------------------------------------------------------------------------

describe('org-hierarchy \u2013 remaining gaps', () => {
  let oh: any;
  beforeAll(() => {
    oh = require('../controllers/denial-iq/org-hierarchy');
  });

  // listRegions: with msoId (adds WHERE clause branch)
  it('listRegions adds msoId filter when query param provided', async () => {
    withRows([{ id: 1, region_name: 'Region A', parent_mso_id: 5, is_active: 1 }]);
    const req = makeReq({ query: { msoId: '5' } });
    const res = makeRes();
    await oh.listRegions(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // listDepartments: with locationId (adds WHERE clause branch)
  it('listDepartments adds locationId filter when query param provided', async () => {
    withRows([{ id: 1, department_name: 'Dept A', parent_location_id: 3, is_active: 1 }]);
    const req = makeReq({ query: { locationId: '3' } });
    const res = makeRes();
    await oh.listDepartments(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });
});

// -----------------------------------------------------------------------------
//  auto-assignment.ts
// -----------------------------------------------------------------------------

describe('AutoAssignmentController \u2013 remaining gaps', () => {
  let AutoAssignmentController: any;
  beforeAll(() => {
    ({ AutoAssignmentController } = require('../controllers/denial-iq/auto-assignment'));
  });

  // unassigned.length === 0 -> returns "No unassigned claims" (line 122-123)
  it('run returns no-claims message when unassigned list is empty', async () => {
    const ctrl = new AutoAssignmentController();
    (ctrl as any).pool = mockPool;
    // specialists
    withRows([{ userID: 1, FirstName: 'Alice', LastName: 'Smith' }]);
    // queue counts
    withRows([{ AssignedTo: 1, OpenCount: 5 }]);
    // routing rules
    withRows([]);
    // skills
    withRows([]);
    // unassigned - empty
    withRows([]);
    const req = makeReq({ body: { limit: 10 } });
    const res = makeRes();
    await ctrl.run(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }));
  });
});

// -----------------------------------------------------------------------------
//  sla-config.ts
// -----------------------------------------------------------------------------

describe('sla-config \u2013 remaining gaps', () => {
  let slaConfig: any;
  beforeAll(() => {
    slaConfig = require('../controllers/denial-iq/sla-config');
  });

  // getSlaViolations: open=false (query includes resolved records too)
  it('getSlaViolations with open=false returns all violations', async () => {
    withRows([{ id: 1, resolved_at: '2025-01-10', assigned_to_name: 'Alice' }]);
    const req = makeReq({ query: { open: 'false' } });
    (req as any).scopeFilter = null;
    const res = makeRes();
    await slaConfig.getSlaViolations(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // upsertSlaConfig: scopeFilter is null -> customerId becomes undefined (false branch line 22)
  it('upsertSlaConfig works when scopeFilter is null', async () => {
    withRows([]);
    const req = makeReq({ body: { queue_type: 'AR', payer_class: 'Medicare', first_touch_hours: 24, followup_max_hours: 48, resolution_target_days: 14 } });
    (req as any).scopeFilter = null;
    const res = makeRes();
    await slaConfig.upsertSlaConfig(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});

// -----------------------------------------------------------------------------
//  Additional branch coverage for x-xen-customer-id header
// -----------------------------------------------------------------------------

describe('Specialist AllClaims \u2013 x-xen-customer-id header branch', () => {
  let AllClaims: any;
  beforeAll(() => {
    ({ AllClaims } = require('../controllers/denial-iq/specialist-view/claim-queue/all-claims'));
  });

  // xenCustId is present (truthy branch of ternary on line 15)
  it('get parses x-xen-customer-id header when present', async () => {
    const ctrl = new AllClaims();
    (ctrl as any).pool = mockPool;
    withRows([{ ClaimID: 'CL50001', _TotalCount: 1 }]);
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com', 'x-xen-customer-id': '2' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('Manager AllClaims \u2013 x-xen-customer-id header branch', () => {
  let AllClaimsManager: any;
  beforeAll(() => {
    ({ AllClaims: AllClaimsManager } = require('../controllers/denial-iq/manager-view/claim-queue/all-claims'));
  });

  // xenCustId is present (truthy branch)
  it('get parses x-xen-customer-id header when present', async () => {
    const ctrl = new AllClaimsManager();
    (ctrl as any).pool = mockPool;
    withRows([{ ClaimID: 'CL50001', _TotalCount: 1 }]);
    const req = makeReq({ headers: { 'x-actor-email': 'mgr@example.com', 'x-xen-customer-id': '3' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// -----------------------------------------------------------------------------
//  MyQueue: empty rows -> totalCount = 0
// -----------------------------------------------------------------------------

describe('Specialist MyQueue \u2013 empty rows totalCount branch (BRDA:164,3,1)', () => {
  let MyQueue: any;
  beforeAll(() => {
    ({ MyQueue } = require('../controllers/denial-iq/specialist-view/claim-queue/my-queue'));
  });

  // rows.length === 0 -> totalCount = 0 (false branch at line 164)
  // userId must be valid (not null) so we reach line 164
  it('get returns totalCount 0 when query returns empty rows (userId valid)', async () => {
    // userId is valid (42 default scope) so code reaches line 164
    const ctrl = new MyQueue();
    (ctrl as any).pool = mockPool;
    withRows([]); // empty recordset -> rows.length === 0 -> branch 1 -> totalCount=0
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.totalCount).toBe(0);
  });
});

// -----------------------------------------------------------------------------
//  CMS-1500: 404 when claim not found (line 57 false branch)
// -----------------------------------------------------------------------------

describe('Cms1500Controller \u2013 claim not found', () => {
  let Cms1500Controller: any;
  beforeAll(() => {
    ({ Cms1500Controller } = require('../controllers/denial-iq/claim-detail/cms1500'));
  });

  it('get returns 404 when claim row is missing', async () => {
    const ctrl = new Cms1500Controller();
    (ctrl as any).pool = mockPool;
    withRows([]); // empty -> row is undefined
    const req = makeReq({ query: { claimId: 'NOTEXIST' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// -----------------------------------------------------------------------------
//  Documents upload: file present, claimId present, docId optional
// -----------------------------------------------------------------------------

describe('ClaimDocumentsController \u2013 upload success path (docId)', () => {
  let ClaimDocumentsController: any;
  beforeAll(() => {
    ({ ClaimDocumentsController } = require('../controllers/denial-iq/claim-detail/documents'));
  });

  // row?.id is present (truthy branch of optional chain at line 90)
  it('upload logs docId when recordset returns a row', async () => {
    const ctrl = new ClaimDocumentsController();
    (ctrl as any).pool = mockPool;
    withRows([{ id: 42, claim_id: 'CL50001', file_name: 'doc.pdf', content_type: 'application/pdf', file_size: 100, doc_type: 'eob', uploaded_by: 'test@example.com', created_at: '2025-01-01' }]);
    const req = makeReq({
      file: { originalname: 'doc.pdf', mimetype: 'application/pdf', size: 100, buffer: Buffer.from('x') },
      body: { claimId: 'CL50001', docType: 'eob' },
      headers: { 'x-actor-email': 'test@example.com' },
    });
    const res = makeRes();
    await ctrl.upload(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // download: row found -> send file (line 120 truthy branch)
  it('download sends file when document row is found', async () => {
    const ctrl = new ClaimDocumentsController();
    (ctrl as any).pool = mockPool;
    withRows([{ file_name: 'doc.pdf', content_type: 'application/pdf', file_data: Buffer.from('content') }]);
    const req = makeReq({ params: { id: '42' } });
    const res = makeRes();
    await ctrl.download(req, res);
    expect(res.send).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
//  claim-comments: notification query throws (silent catch branch, line 128)
// -----------------------------------------------------------------------------

describe('ClaimCommentsController \u2013 notification error silenced', () => {
  let ClaimCommentsController: any;
  beforeAll(() => {
    ({ ClaimCommentsController } = require('../controllers/denial-iq/claim-detail/claim-comments'));
  });

  it('addComment silently catches notification query errors', async () => {
    const ctrl = new ClaimCommentsController();
    (ctrl as any).pool = mockPool;
    // first call: insert comment returns row (no authorName -> triggers 'Someone' fallback)
    withRows([{ id: 1, claimId: 'CL50001', authorName: null, authorRole: 'ar-specialist', body: 'test @user@x.com' }]);
    // second call (notification): throw to test silent catch
    mockQuery.mockRejectedValueOnce(new Error('notifications table missing'));
    const req = makeReq({
      params: { claimId: 'CL50001' },
      body: { body: 'test @user@x.com', mentions: [] },
      headers: {},
    });
    (req as any).user = { email: 'alice@example.com' };
    const res = makeRes();
    await ctrl.addComment(req, res);
    // should still respond (not propagate error)
    expect(res.json).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
//  claim-history: null AssignedToName (trimmed -> 'System' fallback, line 76)
// -----------------------------------------------------------------------------

describe('ClaimHistoryController \u2013 null AssignedToName branch', () => {
  let ClaimHistoryController: any;
  beforeAll(() => {
    ({ ClaimHistoryController } = require('../controllers/denial-iq/claim-detail/claim-history'));
  });

  it('getHistory falls back to System when AssignedToName is null/empty', async () => {
    const ctrl = new ClaimHistoryController();
    (ctrl as any).pool = mockPool;
    // row with no end time and null/empty AssignedToName (triggers 'System' fallback)
    withRows([{ ClaimHistoryId: 'CH2', ClaimID: 'CL50002', ClaimStatus: 'Assigned', AssignedToName: '', AssignedToRole: null, ClaimWorkStartedTime: '2025-02-01', ClaimWorkEndedTime: null, ClaimBalanceDue: 50, CARCCode: '', Progress: 0, ClaimModifiedDate: '2025-02-01' }]);
    withRows([]); // notes
    withRows([]); // steps
    withRows([]); // claim events (evtReq)
    withRows([]); // SLA events (slaReq)
    const req = makeReq({ query: { claimId: 'CL50002' } });
    const res = makeRes();
    await ctrl.getHistory(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.data.some((e: any) => e.performedBy === 'System')).toBe(true);
  });
});

// -----------------------------------------------------------------------------
//  remediation getNotes: result.recordset is null -> fallback to []
// -----------------------------------------------------------------------------

describe('ClaimRemediationController \u2013 getNotes null recordset', () => {
  let ClaimRemediationController: any;
  beforeAll(() => {
    ({ ClaimRemediationController } = require('../controllers/denial-iq/claim-detail/remediation'));
  });

  it('getNotes returns empty array when recordset is null', async () => {
    const ctrl = new ClaimRemediationController();
    (ctrl as any).pool = mockPool;
    // query returns null recordset (triggers ?? [] fallback)
    mockQuery.mockResolvedValueOnce({ recordset: null });
    const req = makeReq({ query: { claimId: 'CL50001' } });
    const res = makeRes();
    await ctrl.getNotes(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
//  CapacityPlanning: teamClaimsPerDay = 0 -> daysToCloseBacklog = 0
// -----------------------------------------------------------------------------

describe('CapacityPlanningController \u2013 zero teamClaimsPerDay branch', () => {
  let CapacityPlanningController: any;
  beforeAll(() => {
    ({ CapacityPlanningController } = require('../controllers/denial-iq/manager-view/daily-dashboard/capacity-planning'));
  });

  it('get computes daysToCloseBacklog=0 when teamClaimsPerDay is zero', async () => {
    const ctrl = new CapacityPlanningController();
    (ctrl as any).pool = mockPool;
    // backlog: totalOpen=50
    withRows([{ totalOpen: 50, totalValue: 25000, avgAging: 30, current30: 10, urgent60: 15, critical90: 15, severe90plus: 10 }]);
    // unassigned
    withRows([{ cnt: 5 }]);
    // velocity: all zeros -> workDays defaults to 1, claimsCompleted30d=0 -> teamClaimsPerDay=0
    withRows([{ claimsCompleted30d: 0, activeStaff: 0, workDays: 0, avgMinutes: 0 }]);
    // resolveResult
    withRows([{ avgDays: null }]);
    // staffResult
    withRows([]);
    // trendResult
    withRows([]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.forecast.daysToCloseBacklog).toBe(0);
  });
});

// -----------------------------------------------------------------------------
//  ARMix: TotalAR = 0 -> InsurancePctOfTotal/PatientPctOfTotal are null
// -----------------------------------------------------------------------------

describe('ARMix \u2013 TotalAR=0 null pct branch', () => {
  let ARMix: any;
  beforeAll(() => {
    ({ ARMix } = require('../controllers/denial-iq/manager-view/daily-dashboard/ar-mix'));
  });

  it('get returns null pct fields when TotalAR is zero', async () => {
    const ctrl = new ARMix();
    (ctrl as any).pool = mockPool;
    withRows([{ AsOfDate: '2025-01-01', TotalAR: 0, InsuranceAR: 0, PatientAR: 0, InsurancePctOfTotal: null, PatientPctOfTotal: null, TotalAR30: null, PctChangeLast30Days: null }]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.insurancePctOfTotal).toBeNull();
    expect(body.data.patientPctOfTotal).toBeNull();
  });
});

// -----------------------------------------------------------------------------
//  data-quality: resolveQuarantined - scopeFilter null -> userId=null
// -----------------------------------------------------------------------------

describe('data-quality resolveQuarantined \u2013 scopeFilter null branch', () => {
  let dq: any;
  beforeAll(() => {
    dq = require('../controllers/denial-iq/data-quality');
  });

  // scopeFilter?.userId -> undefined when scopeFilter is null
  it('resolveQuarantined works when scopeFilter is null', async () => {
    withRows([]);
    const req = makeReq({ params: { id: '1' }, body: { status: 'resolved', resolution_notes: 'fixed' } });
    (req as any).scopeFilter = null;
    const res = makeRes();
    await dq.resolveQuarantined(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});

// -----------------------------------------------------------------------------
//  org-hierarchy: createRegion and createDepartment with null scopeFilter
// -----------------------------------------------------------------------------

describe('org-hierarchy createRegion/createDepartment \u2013 null scopeFilter', () => {
  let oh: any;
  beforeAll(() => {
    oh = require('../controllers/denial-iq/org-hierarchy');
  });

  // createRegion: scopeFilter?.customerId -> undefined, parent_mso_id falsy -> null (BRDA:62)
  it('createRegion works when parent_mso_id is falsy and scopeFilter is null', async () => {
    withRows([{ id: 1, region_name: 'New Region', parent_mso_id: null, customer_id: null }]);
    const req = makeReq({ body: { region_name: 'New Region', parent_mso_id: 0 } });
    (req as any).scopeFilter = null;
    const res = makeRes();
    await oh.createRegion(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // createDepartment: scopeFilter?.customerId -> undefined, parent_location_id falsy -> null (BRDA:91)
  it('createDepartment works when parent_location_id is falsy and scopeFilter is null', async () => {
    withRows([{ id: 1, department_name: 'New Dept', parent_location_id: null, customer_id: null }]);
    const req = makeReq({ body: { department_name: 'New Dept', parent_location_id: 0 } });
    (req as any).scopeFilter = null;
    const res = makeRes();
    await oh.createDepartment(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// -----------------------------------------------------------------------------
//  auto-assignment: ChargeAmt is null -> fallback to 0 (BRDA:147)
// -----------------------------------------------------------------------------

describe('AutoAssignmentController \u2013 ChargeAmt null fallback branch', () => {
  let AutoAssignmentController: any;
  beforeAll(() => {
    ({ AutoAssignmentController } = require('../controllers/denial-iq/auto-assignment'));
  });

  it('run handles null ChargeAmt in claim (falls back to 0)', async () => {
    const ctrl = new AutoAssignmentController();
    (ctrl as any).pool = mockPool;
    // specialists
    withRows([{ userID: 1, FirstName: 'Alice', LastName: 'Smith' }]);
    // queue counts
    withRows([]);
    // routing rules: none
    withRows([]);
    // skills: none
    withRows([]);
    // unassigned: one claim with null ChargeAmt and null dates
    withRows([{ ClaimID: 'CL50001', DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: null, PayerID: 1, ReasonCode: null, InsuranceName: null }]);
    // max id query
    withRows([{ ClaimHistoryId: 'CH100' }]);
    // insert query (will be called once per claim)
    withRows([]);
    const req = makeReq({ body: { limit: 1 } });
    const res = makeRes();
    await ctrl.run(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });
});

// -----------------------------------------------------------------------------
//  Cover BRDA:14,0,1 - x-actor-email header is absent (null ?? '' fallback)
//  For all claim-queue controllers and daily-dashboard controllers
// -----------------------------------------------------------------------------

describe('BRDA:14,0,1 \u2014 x-actor-email absent and xenCustId absent', () => {
  // Specialist AllClaims: no header (BRDA:14,0,1) - xenCustId ternary false branch
  it('Specialist AllClaims get with no headers at all', async () => {
    const { AllClaims } = require('../controllers/denial-iq/specialist-view/claim-queue/all-claims');
    const ctrl = new AllClaims();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({}); // no headers at all -> both branches exercised
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Manager AllClaims: no header (BRDA:14,0,1)
  it('Manager AllClaims get with no headers at all', async () => {
    const { AllClaims } = require('../controllers/denial-iq/manager-view/claim-queue/all-claims');
    const ctrl = new AllClaims();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('Specialist Escalations get with no x-actor-email header', async () => {
    const { Escalations } = require('../controllers/denial-iq/specialist-view/claim-queue/escalations');
    const ctrl = new Escalations();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({}); // no x-actor-email header at all
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('Specialist PendingQueue get with no x-actor-email header', async () => {
    const { PendingQueue } = require('../controllers/denial-iq/specialist-view/claim-queue/pending');
    const ctrl = new PendingQueue();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('Specialist Unassigned get with no x-actor-email header', async () => {
    const { Unassigned } = require('../controllers/denial-iq/specialist-view/claim-queue/unassigned');
    const ctrl = new Unassigned();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('Manager Escalations get with no x-actor-email header', async () => {
    const { Escalations } = require('../controllers/denial-iq/manager-view/claim-queue/escalations');
    const ctrl = new Escalations();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('Manager Unassigned get with no x-actor-email header', async () => {
    const { Unassigned } = require('../controllers/denial-iq/manager-view/claim-queue/unassigned');
    const ctrl = new Unassigned();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('AnalystProficiency get with no x-actor-email header', async () => {
    const { AnalystProficiency } = require('../controllers/denial-iq/specialist-view/daily-dashboard/analyst-proficiency');
    const ctrl = new AnalystProficiency();
    (ctrl as any).pool = mockPool;
    withRows([{ CARCCode: '97', CARCDescription: null, MyClaimCount: 5, MyAvgMinutes: 10, TeamClaimCount: 20, TeamAvgMinutes: 12, AnalystCount: 3, DiffFromTeamMinutes: -2, DiffFromTeamPct: -16.7 }]);
    const req = makeReq({}); // no header -> actorEmail = ''
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('PerformanceTrends get with no x-actor-email header', async () => {
    const { PerformanceTrends } = require('../controllers/denial-iq/specialist-view/daily-dashboard/performance-trends');
    const ctrl = new PerformanceTrends();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// -----------------------------------------------------------------------------
//  Cover BRDA:93,3,1 - result.recordset is falsy (|| [] fallback)
// -----------------------------------------------------------------------------

describe('AnalystProficiency \u2013 recordset falsy fallback (|| [])', () => {
  it('get returns empty array when recordset is null', async () => {
    const { AnalystProficiency } = require('../controllers/denial-iq/specialist-view/daily-dashboard/analyst-proficiency');
    const ctrl = new AnalystProficiency();
    (ctrl as any).pool = mockPool;
    mockQuery.mockResolvedValueOnce({ recordset: null });
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
//  Cover BRDA:24,1,1 for MyPerformanceSummary and ResolutionMetrics
//  (scope.userId == null - only if resolveUserScope returns null userId)
//  Note: These were already added above, adding more cases with no header
// -----------------------------------------------------------------------------

describe('MyPerformanceSummary \u2013 no x-actor-email header', () => {
  it('get returns 200 when no x-actor-email header and userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ ...defaultScope, userId: null });
    const { MyPerformanceSummary } = require('../controllers/denial-iq/specialist-view/daily-dashboard/my-performance-summary');
    const ctrl = new MyPerformanceSummary();
    (ctrl as any).pool = mockPool;
    const req = makeReq({}); // no header
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('ResolutionMetrics \u2013 no x-actor-email header', () => {
  it('get returns 200 with null data when no header and userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ ...defaultScope, userId: null });
    const { ResolutionMetrics } = require('../controllers/denial-iq/specialist-view/daily-dashboard/resolution-metrics');
    const ctrl = new ResolutionMetrics();
    (ctrl as any).pool = mockPool;
    const req = makeReq({}); // no header
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// -----------------------------------------------------------------------------
//  Cover BRDA:191,13,0 in MyPerformanceSummary - row is truthy (data object built)
//  (Already covered by cfgMap test above, but need recordset[0] !== null)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
//  MyQueue BRDA:14,0,1 - x-actor-email header absent (null/undefined -> '' fallback)
// -----------------------------------------------------------------------------

describe('Specialist MyQueue \u2013 BRDA:14,0,1 header absent', () => {
  let MyQueue: any;
  beforeAll(() => {
    ({ MyQueue } = require('../controllers/denial-iq/specialist-view/claim-queue/my-queue'));
  });

  it('get works when x-actor-email header is absent', async () => {
    const ctrl = new MyQueue();
    (ctrl as any).pool = mockPool;
    withRows([]);
    const req = makeReq({}); // no x-actor-email header -> undefined ?? '' -> branch 1
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// -----------------------------------------------------------------------------
//  MyQueue BRDA:164,3,1 - rows.length>0 false (empty rows -> totalCount=0)
//  Already covered by the empty-rows test above, but add to confirm
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
//  Cover claim-history BRDA:69,2,1 and 70,3,1
//  Line 69: row.ClaimStatus || 'Closed' - ClaimStatus is falsy -> 'Closed'
//  Line 70: row.ClaimStatus || 'Assigned' - ClaimStatus is falsy -> 'Assigned'
// -----------------------------------------------------------------------------

describe('ClaimHistoryController \u2013 null ClaimStatus fallbacks', () => {
  let ClaimHistoryController: any;
  beforeAll(() => {
    ({ ClaimHistoryController } = require('../controllers/denial-iq/claim-detail/claim-history'));
  });

  it('getHistory uses Closed fallback when ClaimStatus is null on ended row', async () => {
    const ctrl = new ClaimHistoryController();
    (ctrl as any).pool = mockPool;
    withRows([{
      ClaimHistoryId: 'CH3', ClaimID: 'CL50003',
      ClaimStatus: null, // null -> triggers 'Closed' fallback
      AssignedToName: 'Bob', AssignedToRole: 'AR Specialist',
      ClaimWorkStartedTime: '2025-03-01',
      ClaimWorkEndedTime: '2025-03-02', // has end time -> "Closed" branch
      ClaimBalanceDue: 0, CARCCode: null, Progress: 100, ClaimModifiedDate: '2025-03-02',
    }]);
    withRows([]); // notes
    withRows([]); // steps
    withRows([]); // claim events (evtReq)
    withRows([]); // SLA events (slaReq)
    const req = makeReq({ query: { claimId: 'CL50003' } });
    const res = makeRes();
    await ctrl.getHistory(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.data.some((e: any) => e.action && e.action.includes('Closed'))).toBe(true);
  });

  it('getHistory uses Assigned fallback when ClaimStatus is null on started row', async () => {
    const ctrl = new ClaimHistoryController();
    (ctrl as any).pool = mockPool;
    withRows([{
      ClaimHistoryId: 'CH4', ClaimID: 'CL50004',
      ClaimStatus: null, // null -> triggers 'Assigned' fallback
      AssignedToName: 'Carol', AssignedToRole: 'AR Specialist',
      ClaimWorkStartedTime: '2025-03-01',
      ClaimWorkEndedTime: null, // no end time -> "Assigned" branch
      ClaimBalanceDue: 200, CARCCode: null, Progress: 0, ClaimModifiedDate: '2025-03-01',
    }]);
    withRows([]); // notes
    withRows([]); // steps
    withRows([]); // claim events (evtReq)
    withRows([]); // SLA events (slaReq)
    const req = makeReq({ query: { claimId: 'CL50004' } });
    const res = makeRes();
    await ctrl.getHistory(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.data.some((e: any) => e.action && e.action.includes('Assigned'))).toBe(true);
  });
});

// -----------------------------------------------------------------------------
//  Cover documents BRDA:86,6,0 - result.recordset?.[0] is falsy (no row returned)
//  BRDA:90,8,0 - row?.id is undefined
//  BRDA:120,11,0 - result.recordset?.[0] is falsy in download (already covered by 404 test)
// -----------------------------------------------------------------------------

describe('ClaimDocumentsController \u2013 upload with empty recordset', () => {
  let ClaimDocumentsController: any;
  beforeAll(() => {
    ({ ClaimDocumentsController } = require('../controllers/denial-iq/claim-detail/documents'));
  });

  // upload: recordset is empty (no row -> row is undefined, row?.id is undefined)
  it('upload returns 201 even when recordset is empty (row is undefined)', async () => {
    const ctrl = new ClaimDocumentsController();
    (ctrl as any).pool = mockPool;
    // INSERT returns empty recordset (row is undefined -> triggers BRDA:86,6,0 and BRDA:90,8,0)
    withRows([]);
    const req = makeReq({
      file: { originalname: 'doc.pdf', mimetype: 'application/pdf', size: 100, buffer: Buffer.from('x') },
      body: { claimId: 'CL50001', docType: 'other' },
      headers: {},
    });
    const res = makeRes();
    await ctrl.upload(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    // data is undefined (the row)
    const body = res.json.mock.calls[0][0];
    expect(body.data).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
//  Cover claim-comments BRDA:117,11,0 - comment?.authorName is falsy -> 'Someone'
// -----------------------------------------------------------------------------

// Already covered by the "notification error silenced" test above where authorName is null.

// -----------------------------------------------------------------------------
//  Cover data-quality BRDA:39,6,1 - scopeFilter?.userId is truthy (userId present)
// -----------------------------------------------------------------------------

describe('data-quality resolveQuarantined \u2013 scopeFilter.userId truthy/falsy branches', () => {
  let dq: any;
  beforeAll(() => {
    dq = require('../controllers/denial-iq/data-quality');
  });

  it('resolveQuarantined passes userId when scopeFilter has userId (truthy branch)', async () => {
    withRows([]);
    const req = makeReq({ params: { id: '2' }, body: { status: 'resolved', resolution_notes: 'ok' } });
    (req as any).scopeFilter = { userId: 99 };
    const res = makeRes();
    await dq.resolveQuarantined(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  // BRDA:39,6,1 - scopeFilter.userId is falsy (0 -> null via || null)
  it('resolveQuarantined passes null when scopeFilter.userId is 0 (falsy)', async () => {
    withRows([]);
    const req = makeReq({ params: { id: '3' }, body: { status: 'resolved' } });
    (req as any).scopeFilter = { userId: 0 }; // 0 is falsy -> || null -> null
    const res = makeRes();
    await dq.resolveQuarantined(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});

// -----------------------------------------------------------------------------
//  Cover ar-mix BRDA:105,1,1 - row.TotalAR ?? 0 (TotalAR is null -> 0)
// -----------------------------------------------------------------------------

describe('ARMix \u2013 TotalAR null coalescing to 0', () => {
  let ARMix: any;
  beforeAll(() => {
    ({ ARMix } = require('../controllers/denial-iq/manager-view/daily-dashboard/ar-mix'));
  });

  it('get returns totalAR=0 when TotalAR is null', async () => {
    const ctrl = new ARMix();
    (ctrl as any).pool = mockPool;
    withRows([{ AsOfDate: '2025-01-01', TotalAR: null, InsuranceAR: null, PatientAR: null, InsurancePctOfTotal: null, PatientPctOfTotal: null, TotalAR30: null, PctChangeLast30Days: null }]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.totalAR).toBe(0);
  });
});

// -----------------------------------------------------------------------------
//  Cover capacity-planning BRDA:149,19,1 - targetDays > 0 -> neededPerDay = Math.ceil
//  (This is always true since targetDays=30; the false branch would need targetDays=0)
//  It's a constant expression - the branch is always taken, so this is an istanbul artifact
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
//  MyPerformanceSummary - cfgResult has non-numeric value (isNaN branch true)
// -----------------------------------------------------------------------------

describe('MyPerformanceSummary \u2013 cfgResult non-numeric value skipped', () => {
  let MyPerformanceSummary: any;
  beforeAll(() => {
    ({ MyPerformanceSummary } = require('../controllers/denial-iq/specialist-view/daily-dashboard/my-performance-summary'));
  });

  it('get skips non-numeric config values and uses defaults', async () => {
    const ctrl = new MyPerformanceSummary();
    (ctrl as any).pool = mockPool;
    // cfg: one numeric, one non-numeric (isNaN = true -> not stored)
    withRows([
      { key: 'kpi_target_roi', value: 'not-a-number' },
      { key: 'industry_benchmark_roi', value: '1521' },
    ]);
    // main query: row with all data
    withRows([{
      HoursWorkedThisWeek: 35, AvgHoursPerWeek: 37, ClaimsCompletedThisWeek: 12, AvgClaimsPerWeek: 13,
      RevenueRecoveredThisWeek: 40000, AvgRevenuePerWeek: 42000,
      HoursChange: null, ClaimsChangePct: null, RevenueChangePct: null,
      ROIThisWeek: 1143, PersonalBestROI: 1500,
    }]);
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' }, query: { period: '1y' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    // non-numeric kpi_target_roi -> default 1572
    expect(body.data.kpiTarget).toBe(1572);
    // numeric industry_benchmark_roi
    expect(body.data.industryBenchmark).toBe(1521);
  });
});

// -----------------------------------------------------------------------------
//  MyPerformanceSummary - cfgResult BRDA:191,13,0 - row is null (data=null)
//  Already covered by the empty-recordset test, but explicit here for clarity
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
//  MyPerformanceSummary: cfgResult has valid numeric values (not isNaN branch)
// -----------------------------------------------------------------------------

describe('MyPerformanceSummary \u2013 cfgMap populated branch', () => {
  let MyPerformanceSummary: any;
  beforeAll(() => {
    ({ MyPerformanceSummary } = require('../controllers/denial-iq/specialist-view/daily-dashboard/my-performance-summary'));
  });

  it('get uses cfgMap values when config records are numeric', async () => {
    const ctrl = new MyPerformanceSummary();
    (ctrl as any).pool = mockPool;
    // cfg query: returns numeric values
    withRows([
      { key: 'kpi_target_roi', value: '1800' },
      { key: 'industry_benchmark_roi', value: '1600' },
    ]);
    // main query: returns a row
    withRows([{
      HoursWorkedThisWeek: 40, AvgHoursPerWeek: 38, ClaimsCompletedThisWeek: 15, AvgClaimsPerWeek: 14,
      RevenueRecoveredThisWeek: 50000, AvgRevenuePerWeek: 48000, HoursChange: 2, ClaimsChangePct: 7.1,
      RevenueChangePct: 4.2, ROIThisWeek: 1250, PersonalBestROI: 1900,
    }]);
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' }, query: { period: '3m' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.kpiTarget).toBe(1800);
    expect(body.data.industryBenchmark).toBe(1600);
  });
});

// -----------------------------------------------------------------------------
//  CMS-1500: recordset is null (BRDA:57,1,0) - optional chain to undefined
// -----------------------------------------------------------------------------

describe('Cms1500Controller \u2013 null recordset (optional chain false branch)', () => {
  let Cms1500Controller: any;
  beforeAll(() => {
    ({ Cms1500Controller } = require('../controllers/denial-iq/claim-detail/cms1500'));
  });

  it('get returns 404 when recordset is null (recordset?.[0] is undefined)', async () => {
    const ctrl = new Cms1500Controller();
    (ctrl as any).pool = mockPool;
    // recordset is null -> recordset?.[0] is undefined -> row is falsy -> 404
    mockQuery.mockResolvedValueOnce({ recordset: null });
    const req = makeReq({ query: { claimId: 'CL50099' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// -----------------------------------------------------------------------------
//  Documents: null recordset in upload (BRDA:86,6,0) and download (BRDA:120,11,0)
// -----------------------------------------------------------------------------

describe('ClaimDocumentsController \u2013 null recordset optional chain', () => {
  let ClaimDocumentsController: any;
  beforeAll(() => {
    ({ ClaimDocumentsController } = require('../controllers/denial-iq/claim-detail/documents'));
  });

  // upload: recordset is null -> row is undefined (BRDA:86,6,0 and 90,8,0)
  it('upload returns 201 when recordset is null (row=undefined)', async () => {
    const ctrl = new ClaimDocumentsController();
    (ctrl as any).pool = mockPool;
    mockQuery.mockResolvedValueOnce({ recordset: null });
    const req = makeReq({
      file: { originalname: 'x.pdf', mimetype: 'application/pdf', size: 50, buffer: Buffer.from('y') },
      body: { claimId: 'CL50001', docType: 'eob' },
      headers: { 'x-actor-email': 'user@example.com' },
    });
    const res = makeRes();
    await ctrl.upload(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // download: recordset is null -> row is undefined -> 404 (BRDA:120,11,0)
  it('download returns 404 when recordset is null', async () => {
    const ctrl = new ClaimDocumentsController();
    (ctrl as any).pool = mockPool;
    mockQuery.mockResolvedValueOnce({ recordset: null });
    const req = makeReq({ params: { id: '10' } });
    const res = makeRes();
    await ctrl.download(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// -----------------------------------------------------------------------------
//  claim-comments BRDA:117,11,0 - comment?.authorName is truthy (not 'Someone')
// -----------------------------------------------------------------------------

describe('ClaimCommentsController \u2013 authorName truthy/comment undefined branches', () => {
  let ClaimCommentsController: any;
  beforeAll(() => {
    ({ ClaimCommentsController } = require('../controllers/denial-iq/claim-detail/claim-comments'));
  });

  it('addComment uses actual authorName in notification (not Someone)', async () => {
    const ctrl = new ClaimCommentsController();
    (ctrl as any).pool = mockPool;
    // comment row with real authorName (not null) -> authorName is truthy -> branch 0
    withRows([{ id: 2, claimId: 'CL50002', authorName: 'Alice Smith', authorRole: 'Manager', body: 'hello @bob@corp.com' }]);
    // notification query: succeeds
    withRows([]);
    const req = makeReq({
      params: { claimId: 'CL50002' },
      body: { body: 'hello @bob@corp.com', mentions: [] },
      headers: {},
    });
    (req as any).user = { email: 'alice@corp.com' };
    const res = makeRes();
    await ctrl.addComment(req, res);
    expect(res.json).toHaveBeenCalled();
  });

  // BRDA:117,11,0 - comment is undefined (recordset empty -> comment=undefined, optional chain short-circuits)
  it('addComment uses Someone when comment is undefined (empty INSERT recordset + mentions)', async () => {
    const ctrl = new ClaimCommentsController();
    (ctrl as any).pool = mockPool;
    // INSERT returns empty recordset -> comment = undefined -> comment?.authorName short-circuits to undefined -> 'Someone'
    withRows([]); // empty -> comment = recordset[0] = undefined
    // notification query
    withRows([]);
    const req = makeReq({
      params: { claimId: 'CL50003' },
      body: { body: 'check this @notify@example.com', mentions: [] },
      headers: {},
    });
    (req as any).user = { email: 'user@corp.com' };
    const res = makeRes();
    await ctrl.addComment(req, res);
    expect(res.json).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
//  MyPerformanceSummary: BRDA:191,13,0 - result.recordset is null (optional chain)
// -----------------------------------------------------------------------------

describe('MyPerformanceSummary \u2013 null recordset optional chain (BRDA:191)', () => {
  let MyPerformanceSummary: any;
  beforeAll(() => {
    ({ MyPerformanceSummary } = require('../controllers/denial-iq/specialist-view/daily-dashboard/my-performance-summary'));
  });

  it('get returns null data when recordset is null', async () => {
    const ctrl = new MyPerformanceSummary();
    (ctrl as any).pool = mockPool;
    // cfg query
    withRows([]);
    // main query returns null recordset -> row is null -> data=null
    mockQuery.mockResolvedValueOnce({ recordset: null });
    const req = makeReq({ headers: { 'x-actor-email': 'spec@example.com' } });
    const res = makeRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toBeNull();
  });
});
