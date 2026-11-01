/**
 * coverage-v4-denial-iq-misc.test.ts
 *
 * Covers uncovered branches across:
 *   - src/controllers/denial-iq/claim-detail/bulk-actions.ts        (8br)
 *   - src/controllers/denial-iq/appeal-generator.ts                 (7br)
 *   - src/controllers/denial-iq/payer-intelligence.ts               (4br)
 *   - src/controllers/denial-iq/denial-events.ts                    (4br + 1st)
 *   - src/controllers/denial-iq/data-quality.ts                     (5br)
 *   - src/controllers/denial-iq/sla-config.ts                       (3br)
 *   - src/controllers/denial-iq/claim-detail/documents.ts           (4br)
 *   - src/controllers/denial-iq/claim-detail/claim-history.ts       (3br)
 *   - src/controllers/denial-iq/claim-detail/claim-comments.ts      (2br)
 *   - src/controllers/denial-iq/claim-detail/claim-information.ts   (2br)
 *   - src/controllers/denial-iq/org-hierarchy.ts                    (2br)
 *   - src/controllers/denial-iq/auto-assignment.ts                  (1br)
 *   - src/controllers/denial-iq/claim-detail/remediation.ts         (1br)
 *   - src/controllers/denial-iq/claim-detail/cms1500.ts             (1br + 1st)
 */

// -----------------------------------------------------------------------------
//  Shared mock state - declared BEFORE any jest.mock() calls
// -----------------------------------------------------------------------------

const mockQuery = jest.fn();
const mockRequestInstance: any = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
};
const mockPool: any = {
  request: () => mockRequestInstance,
};

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => mockPool,
    }),
  },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(),
    BigInt: f(),
    Decimal: Object.assign(f, { prototype: {} }),
    Bit: f(),
    DateTime: f(),
    Date: f(),
    Float: f(),
    VarChar: f,
    SmallInt: f(),
    UniqueIdentifier: f(),
    Request: jest.fn().mockImplementation(() => mockRequestInstance),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/resolve-user-scope', () => ({
  resolveUserScope: jest.fn().mockResolvedValue({
    userId: 42,
    customerId: 1,
    isSuperAdmin: false,
    locations: [],
    providers: [],
    payers: [],
  }),

  extractCustomerId: jest.fn().mockReturnValue(null),
  buildTeamFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildCustomerFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
}));

jest.mock('../utils/telemetry', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('../websockets/index', () => ({
  broadcast: jest.fn(),
  broadcastToCustomer: jest.fn(),
}));

// -----------------------------------------------------------------------------
//  Test helpers
// -----------------------------------------------------------------------------

const mockReq = (
  body: any = {},
  query: any = {},
  params: any = {},
  headers: any = {},
) => ({ body, query, params, headers } as any);

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn().mockReturnValue(r);
  return r;
};

const { resolveUserScope } = require('../utils/resolve-user-scope') as any;

beforeEach(() => {
  mockQuery.mockReset();
  resolveUserScope.mockResolvedValue({
    userId: 42,
    customerId: 1,
    isSuperAdmin: false,
    locations: [],
    providers: [],
    payers: [],
  });
});

// -----------------------------------------------------------------------------
//  BulkActionsController
// -----------------------------------------------------------------------------

describe('BulkActionsController \u2013 uncovered branches', () => {
  let BulkActionsController: any;

  beforeAll(() => {
    ({ BulkActionsController } = require('../controllers/denial-iq/claim-detail/bulk-actions'));
  });

  // bulkAssign: missing claimIds
  it('bulkAssign returns 400 when claimIds is missing', async () => {
    const res = mockRes();
    await new BulkActionsController().bulkAssign(mockReq({ claimIds: [] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // bulkAssign: null userId
  it('bulkAssign returns 401 when userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ userId: null, customerId: 1, isSuperAdmin: false, locations: [], providers: [], payers: [] });
    mockQuery.mockResolvedValue({ recordset: [{ n: 100 }] });
    const res = mockRes();
    await new BulkActionsController().bulkAssign(mockReq({ claimIds: ['CL5001'] }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  // bulkAssign: assigned > 0 triggers broadcast
  it('bulkAssign broadcasts when claims are assigned', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [0] })        // closeReq UPDATE (close open assignments)
      .mockResolvedValueOnce({ recordset: [{ n: 100 }] }) // getNextHistoryNum
      .mockResolvedValueOnce({ rowsAffected: [3] });       // INSERT
    const res = mockRes();
    await new BulkActionsController().bulkAssign(
      mockReq({ claimIds: ['CL5001', 'CL5002', 'CL5003'] }, {}, {}, { 'x-actor-email': 'user@example.com' }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }));
    const { broadcastToCustomer } = require('../websockets/index') as any;
    expect(broadcastToCustomer).toHaveBeenCalledWith(1, 'claim:updated', expect.objectContaining({ type: 'bulk-assigned' }));
  });

  // bulkAssign: assigned === 0 does NOT broadcast
  it('bulkAssign does not broadcast when no claims assigned', async () => {
    const broadcastToCustomerMock = require('../websockets/index').broadcastToCustomer as jest.Mock;
    broadcastToCustomerMock.mockClear();
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [0] })        // closeReq UPDATE
      .mockResolvedValueOnce({ recordset: [{ n: 50 }] })  // getNextHistoryNum
      .mockResolvedValueOnce({ rowsAffected: [0] });        // INSERT -> 0 rows
    const res = mockRes();
    await new BulkActionsController().bulkAssign(mockReq({ claimIds: ['CL5001'] }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }));
    expect(broadcastToCustomerMock).not.toHaveBeenCalled();
  });

  // bulkAssign: 500 on error
  it('bulkAssign returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new BulkActionsController().bulkAssign(mockReq({ claimIds: ['CL5001'] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // bulkEscalate: missing claimIds
  it('bulkEscalate returns 400 when claimIds missing', async () => {
    const res = mockRes();
    await new BulkActionsController().bulkEscalate(mockReq({ claimIds: [] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // bulkEscalate: no active manager
  it('bulkEscalate returns 422 when no manager found', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }); // manager lookup returns empty
    const res = mockRes();
    await new BulkActionsController().bulkEscalate(mockReq({ claimIds: ['CL5001'] }), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  // bulkEscalate: success, broadcast fires when escalated > 0
  it('bulkEscalate broadcasts when claims escalated', async () => {
    const broadcastToCustomerMock = require('../websockets/index').broadcastToCustomer as jest.Mock;
    broadcastToCustomerMock.mockClear();
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 10 }] })  // manager
      .mockResolvedValueOnce({ rowsAffected: [1] })             // close open rows
      .mockResolvedValueOnce({ recordset: [{ n: 200 }] })       // getNextHistoryNum
      .mockResolvedValueOnce({ rowsAffected: [2] })             // INSERT escalation rows
      .mockResolvedValueOnce({ rowsAffected: [2] });            // INSERT notes
    const res = mockRes();
    await new BulkActionsController().bulkEscalate(
      mockReq({ claimIds: ['CL5001', 'CL5002'], reason: 'Auth required' }, {}, {}, { 'x-actor-email': 'mgr@example.com' }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 2 }));
    expect(broadcastToCustomerMock).toHaveBeenCalledWith(1, 'claim:updated', expect.objectContaining({ type: 'bulk-escalated' }));
  });

  // bulkClose: missing claimIds
  it('bulkClose returns 400 when claimIds missing', async () => {
    const res = mockRes();
    await new BulkActionsController().bulkClose(mockReq({ claimIds: [] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // bulkClose: with claimStatus, broadcasts when > 0
  it('bulkClose includes ClaimStatus when provided and broadcasts', async () => {
    const broadcastToCustomerMock = require('../websockets/index').broadcastToCustomer as jest.Mock;
    broadcastToCustomerMock.mockClear();
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const res = mockRes();
    await new BulkActionsController().bulkClose(
      mockReq({ claimIds: ['CL5001'], claimStatus: 'Closed-Adjudicated' }),
      res,
    );
    // Controller returns { closed, skipped } not { count }
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ closed: 1 }));
    expect(broadcastToCustomerMock).toHaveBeenCalledWith(1, 'claim:updated', expect.objectContaining({ type: 'bulk-closed' }));
  });

  // bulkReassign: missing claimIds or toUserId
  it('bulkReassign returns 400 when toUserId missing', async () => {
    const res = mockRes();
    await new BulkActionsController().bulkReassign(mockReq({ claimIds: ['CL5001'] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // bulkReassign: success with broadcast
  it('bulkReassign broadcasts when claims reassigned', async () => {
    const broadcastToCustomerMock = require('../websockets/index').broadcastToCustomer as jest.Mock;
    broadcastToCustomerMock.mockClear();
    const { extractCustomerId: extractCustId } = require('../utils/resolve-user-scope') as any;
    extractCustId.mockReturnValueOnce(1);
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [1] })        // close open rows
      .mockResolvedValueOnce({ recordset: [{ n: 300 }] })  // getNextHistoryNum
      .mockResolvedValueOnce({ rowsAffected: [1] });        // INSERT reassign rows
    const res = mockRes();
    await new BulkActionsController().bulkReassign(
      mockReq({ claimIds: ['CL5001'], toUserId: 7 }, {}, {}, { 'x-actor-email': 'admin@example.com' }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    expect(broadcastToCustomerMock).toHaveBeenCalledWith(1, 'claim:updated', expect.objectContaining({ type: 'bulk-reassigned' }));
  });
});

// -----------------------------------------------------------------------------
//  AppealGeneratorController
// -----------------------------------------------------------------------------

describe('AppealGeneratorController \u2013 uncovered branches', () => {
  let AppealGeneratorController: any;

  beforeAll(() => {
    ({ AppealGeneratorController } = require('../controllers/denial-iq/appeal-generator'));
  });

  // listTemplates: showAll = true (all=1)
  it('listTemplates with all=1 returns all templates', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, template_name: 'Denial Appeal' }] });
    const res = mockRes();
    await new AppealGeneratorController().listTemplates(mockReq({}, { all: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // listTemplates: showAll = false (default)
  it('listTemplates without all param returns only active templates', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await new AppealGeneratorController().listTemplates(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // createTemplate: missing required fields
  it('createTemplate returns 400 when required fields missing', async () => {
    const res = mockRes();
    await new AppealGeneratorController().createTemplate(mockReq({ template_name: 'Test' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // listAppeals: missing claimId
  it('listAppeals returns 400 when claimId missing', async () => {
    const res = mockRes();
    await new AppealGeneratorController().listAppeals(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // generateLetter: missing claimId
  it('generateLetter returns 400 when claimId missing', async () => {
    const res = mockRes();
    await new AppealGeneratorController().generateLetter(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // generateLetter: claim not found
  it('generateLetter returns 404 when claim not found', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await new AppealGeneratorController().generateLetter(mockReq({ claimId: 'CL5999' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // generateLetter: no template found (422)
  it('generateLetter returns 422 when no template found', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5001', DenialCode: null, PayerName: 'Medicare' }] }) // claim
      .mockResolvedValueOnce({ recordset: [] }); // fallback general template
    const res = mockRes();
    await new AppealGeneratorController().generateLetter(mockReq({ claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  // generateLetter: full success path with templateId and PayerName
  it('generateLetter succeeds with templateId and payer deadline lookup', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5001', DenialCode: 'CO26', PayerName: 'Medicare', DateOfService: '2025-01-01', ClaimSubmittedDate: '2025-01-05', ChargeAmt: 500, PatientName: 'John Doe', ProviderName: 'Dr.Smith', DenialDescription: 'Benefit excluded' }] }) // claim
      .mockResolvedValueOnce({ recordset: [{ id: 2, body_template: 'Dear {{patient_name}}, re {{claim_id}}', subject_line: 'Appeal for {{claim_id}}', closing_text: 'Sincerely' }] }) // template by id
      .mockResolvedValueOnce({ recordset: [{ appeal_days: 90 }] }) // payer deadline
      .mockResolvedValueOnce({ recordset: [{ id: 101 }] }); // insert appeal
    const res = mockRes();
    await new AppealGeneratorController().generateLetter(
      mockReq({ claimId: 'CL5001', templateId: 2, customNotes: 'Please reconsider' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ letter: expect.any(String) }));
  });

  // generateLetter: template matched by DenialCode (no templateId provided)
  it('generateLetter falls back to CARC-matched template when no templateId', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5001', DenialCode: '26', PayerName: null, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: null, PatientName: '', ProviderName: '', DenialDescription: null }] }) // claim
      .mockResolvedValueOnce({ recordset: [{ id: 3, body_template: 'Body {{denial_code}}', subject_line: 'Subj', closing_text: null }] }) // code-matched template
      .mockResolvedValueOnce({ recordset: [] }) // payer deadline (no result)
      .mockResolvedValueOnce({ recordset: [{ id: 102 }] }); // insert
    const res = mockRes();
    await new AppealGeneratorController().generateLetter(
      mockReq({ claimId: 'CL5001' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // updateAppealStatus: missing id
  it('updateAppealStatus returns 400 when id is 0/falsy', async () => {
    const res = mockRes();
    await new AppealGeneratorController().updateAppealStatus(
      mockReq({ status: 'submitted' }, {}, { id: '0' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // updateAppealStatus: success
  it('updateAppealStatus returns 200 on success', async () => {
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const res = mockRes();
    await new AppealGeneratorController().updateAppealStatus(
      mockReq({ status: 'submitted', notes: 'Filed on time' }, {}, { id: '5' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  // 500 on error
  it('listTemplates returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new AppealGeneratorController().listTemplates(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  PayerIntelligenceController
// -----------------------------------------------------------------------------

describe('PayerIntelligenceController \u2013 uncovered branches', () => {
  let PayerIntelligenceController: any;

  beforeAll(() => {
    ({ PayerIntelligenceController } = require('../controllers/denial-iq/payer-intelligence'));
  });

  // getCarcDetail: missing code -> 400
  it('getCarcDetail returns 400 when code is empty', async () => {
    const res = mockRes();
    await new PayerIntelligenceController().getCarcDetail(mockReq({}, {}, { code: '' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // getCarcDetail: empty recordset -> fallback guidance query, CARC not found -> 404
  it('getCarcDetail returns 404 when CARC not found even in guidance', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // main query empty
      .mockResolvedValueOnce({ recordset: [] }); // guidance fallback also empty
    const res = mockRes();
    await new PayerIntelligenceController().getCarcDetail(mockReq({}, {}, { code: 'XX999' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // getCarcDetail: empty recordset but guidance found -> 200
  it('getCarcDetail returns 200 from fallback guidance table', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // main query empty
      .mockResolvedValueOnce({ recordset: [{ code: 'XX999', description: null, category: 'Auth', common_cause: 'Prior auth', resolution: 'Submit auth', prevention: 'Pre-auth', payer_specific: 0, filing_deadline_days: null, appeal_days: null }] });
    const res = mockRes();
    await new PayerIntelligenceController().getCarcDetail(mockReq({}, {}, { code: 'XX999' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // getDeadline: no records -> returns default
  it('getDeadline returns default when no record found', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await new PayerIntelligenceController().getDeadline(mockReq({}, { payerName: '' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deadline_days: 180 }) }));
  });

  // upsertDeadline: missing required fields -> 400
  it('upsertDeadline returns 400 when payer_name missing', async () => {
    const res = mockRes();
    await new PayerIntelligenceController().upsertDeadline(mockReq({ deadline_days: 90 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // getCarcDetail: success path with payerName
  it('getCarcDetail returns 200 with full result and tracks event', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ code: '26', description: 'Benefit excluded', category: 'Non-covered', common_cause: null, resolution: null, prevention: null, payer_specific: 0, filing_deadline_days: 180, appeal_days: 60 }] });
    const res = mockRes();
    await new PayerIntelligenceController().getCarcDetail(
      mockReq({}, { payerName: 'Medicare' }, { code: '26' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 500 error path
  it('getCarcDetail returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new PayerIntelligenceController().getCarcDetail(mockReq({}, {}, { code: '26' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Denial Events (standalone functions)
// -----------------------------------------------------------------------------

describe('denial-events \u2013 uncovered branches', () => {
  let listDenialEvents: any;
  let createDenialEvent: any;
  let updateDenialEvent: any;

  beforeAll(() => {
    ({ listDenialEvents, createDenialEvent, updateDenialEvent } = require('../controllers/denial-iq/denial-events'));
  });

  // listDenialEvents: with claimId filter
  it('listDenialEvents filters by claimId when provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, claim_id: 'CL5001', carc_description: '26' }] })
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] });
    const res = mockRes();
    await listDenialEvents(mockReq({}, { claimId: 'CL5001', page: '0', pageSize: '25' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // listDenialEvents: with scopeFilter.sql set
  it('listDenialEvents applies scopeFilter sql when present', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] });
    const req = mockReq({}, { claimId: 'CL5001' });
    req.scopeFilter = { sql: 'customer_id = 1' };
    const res = mockRes();
    await listDenialEvents(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalCount: 0 }));
  });

  // listDenialEvents: page/pageSize parsing with invalid values defaults
  it('listDenialEvents handles invalid page/pageSize (uses defaults)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] });
    const res = mockRes();
    await listDenialEvents(mockReq({}, { page: 'abc', pageSize: '200' }), res);
    // pageSize capped at 100, page defaults to 0
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });

  // createDenialEvent: missing claim_id -> 400
  it('createDenialEvent returns 400 when claim_id missing', async () => {
    const res = mockRes();
    await createDenialEvent(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // createDenialEvent: with denial_posting_date -> updates claims table
  it('createDenialEvent updates claims.denial_posting_date when provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, claim_id: 'CL5001' }] }) // INSERT
      .mockResolvedValueOnce({ rowsAffected: [1] });                           // UPDATE claims
    const req = mockReq({ claim_id: 'CL5001', denial_posting_date: '2025-03-01' });
    req.scopeFilter = { customerId: 1 };
    const res = mockRes();
    await createDenialEvent(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    // Second query should have been called (denial_posting_date update)
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  // createDenialEvent: without denial_posting_date -> skips UPDATE
  it('createDenialEvent skips claim update when denial_posting_date not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 2, claim_id: 'CL5002' }] });
    const req = mockReq({ claim_id: 'CL5002' });
    req.scopeFilter = { customerId: 1 };
    const res = mockRes();
    await createDenialEvent(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  // updateDenialEvent: all fields provided
  it('updateDenialEvent updates status, recovered_amount, and resolution_date', async () => {
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const res = mockRes();
    await updateDenialEvent(
      mockReq({ status: 'recovered', recovered_amount: 500, resolution_date: '2025-03-10' }, {}, { id: '5' }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  // updateDenialEvent: only updated_at (no optional fields)
  it('updateDenialEvent works when no optional fields provided', async () => {
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const res = mockRes();
    await updateDenialEvent(mockReq({}, {}, { id: '3' }), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

// -----------------------------------------------------------------------------
//  Data Quality (standalone functions)
// -----------------------------------------------------------------------------

describe('data-quality \u2013 uncovered branches', () => {
  let listQuarantined: any;
  let resolveQuarantined: any;
  let listDuplicates: any;
  let resolveDuplicate: any;
  let getDataQualityStats: any;
  let listLateArriving: any;

  beforeAll(() => {
    ({
      listQuarantined,
      resolveQuarantined,
      listDuplicates,
      resolveDuplicate,
      getDataQualityStats,
      listLateArriving,
    } = require('../controllers/denial-iq/data-quality'));
  });

  // listQuarantined: default status 'open', default page/pageSize
  it('listQuarantined returns data with defaults', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, status: 'open' }] })
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] });
    const res = mockRes();
    await listQuarantined(mockReq({}, {}), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // listQuarantined: custom status query param
  it('listQuarantined uses status query param when provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] });
    const res = mockRes();
    await listQuarantined(mockReq({}, { status: 'resolved', page: '1', pageSize: '10' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 10 }));
  });

  // listQuarantined: pageSize capped at 100
  it('listQuarantined caps pageSize at 100', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] });
    const res = mockRes();
    await listQuarantined(mockReq({}, { pageSize: '999' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });

  // resolveQuarantined: with scopeFilter userId, custom status + notes
  it('resolveQuarantined resolves with provided status and notes', async () => {
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const req = mockReq({ status: 'rejected', resolution_notes: 'Not a real dupe' }, {}, { id: '7' });
    req.scopeFilter = { userId: 5 };
    const res = mockRes();
    await resolveQuarantined(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  // resolveQuarantined: null scopeFilter (no userId)
  it('resolveQuarantined handles null scopeFilter gracefully', async () => {
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const req = mockReq({ status: 'resolved' }, {}, { id: '8' });
    req.scopeFilter = null;
    const res = mockRes();
    await resolveQuarantined(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  // listDuplicates: with custom action
  it('listDuplicates uses action query param', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, action_taken: 'merged' }] });
    const res = mockRes();
    await listDuplicates(mockReq({}, { action: 'merged' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // resolveDuplicate: with scopeFilter userId
  it('resolveDuplicate updates with provided action and userId', async () => {
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const req = mockReq({ action_taken: 'merged' }, {}, { id: '3' });
    req.scopeFilter = { userId: 9 };
    const res = mockRes();
    await resolveDuplicate(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  // listLateArriving: applied = true
  it('listLateArriving returns applied records when applied=true', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, applied: 1 }] });
    const res = mockRes();
    await listLateArriving(mockReq({}, { applied: 'true' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // listLateArriving: applied = false (default)
  it('listLateArriving returns unapplied records when applied=false', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await listLateArriving(mockReq({}, {}), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });
});

// -----------------------------------------------------------------------------
//  SLA Config (standalone functions)
// -----------------------------------------------------------------------------

describe('sla-config \u2013 uncovered branches', () => {
  let getSlaConfig: any;
  let upsertSlaConfig: any;
  let getSlaViolations: any;
  let getSlaSummary: any;

  beforeAll(() => {
    ({ getSlaConfig, upsertSlaConfig, getSlaViolations, getSlaSummary } = require('../controllers/denial-iq/sla-config'));
  });

  // getSlaConfig: with scopeFilter.sql
  it('getSlaConfig applies customer filter from scopeFilter', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, queue_type: 'standard' }] });
    const req = mockReq();
    req.scopeFilter = { sql: 'customer_id = 1' };
    const res = mockRes();
    await getSlaConfig(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // getSlaConfig: no scopeFilter
  it('getSlaConfig works without scopeFilter', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const req = mockReq();
    req.scopeFilter = null;
    const res = mockRes();
    await getSlaConfig(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  // upsertSlaConfig: with defaults
  it('upsertSlaConfig uses default values for optional fields', async () => {
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const req = mockReq({ queue_type: 'standard', payer_class: 'Medicare' });
    req.scopeFilter = { customerId: 2 };
    const res = mockRes();
    await upsertSlaConfig(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  // getSlaViolations: open = false
  it('getSlaViolations returns resolved violations when open=false', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const req = mockReq({}, { open: 'false' });
    req.scopeFilter = null;
    const res = mockRes();
    await getSlaViolations(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  // getSlaViolations: with scopeFilter.sql
  it('getSlaViolations applies scopeFilter sql', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, violation_type: 'first_touch' }] });
    const req = mockReq({}, {});
    req.scopeFilter = { sql: 'customer_id = 1' };
    const res = mockRes();
    await getSlaViolations(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // getSlaSummary: with scopeFilter.sql
  it('getSlaSummary applies scopeFilter sql', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ violation_type: 'first_touch', total: 5 }] });
    const req = mockReq();
    req.scopeFilter = { sql: 'customer_id = 1' };
    const res = mockRes();
    await getSlaSummary(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });
});

// -----------------------------------------------------------------------------
//  ClaimDocumentsController
// -----------------------------------------------------------------------------

describe('ClaimDocumentsController \u2013 uncovered branches', () => {
  let ClaimDocumentsController: any;

  beforeAll(() => {
    ({ ClaimDocumentsController } = require('../controllers/denial-iq/claim-detail/documents'));
  });

  // list: missing claimId -> 400
  it('list returns 400 when claimId missing', async () => {
    const res = mockRes();
    await new ClaimDocumentsController().list(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // list: success returns empty array when null recordset
  it('list returns empty array when recordset is null', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new ClaimDocumentsController().list(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  // upload: no file -> 400
  it('upload returns 400 when no file uploaded', async () => {
    const res = mockRes();
    const req = mockReq({ claimId: 'CL5001', docType: 'other' });
    req.file = undefined;
    await new ClaimDocumentsController().upload(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // upload: file present but no claimId -> 400
  it('upload returns 400 when claimId missing (file present)', async () => {
    const res = mockRes();
    const req = mockReq({ docType: 'eob' });
    req.file = { originalname: 'doc.pdf', mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('test') };
    await new ClaimDocumentsController().upload(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // upload: success
  it('upload returns 201 on successful upload', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 10, claim_id: 'CL5001', file_name: 'doc.pdf' }] });
    const res = mockRes();
    const req = mockReq({ claimId: 'CL5001', docType: 'auth' }, {}, {}, { 'x-actor-email': 'user@example.com' });
    req.file = { originalname: 'doc.pdf', mimetype: 'application/pdf', size: 2048, buffer: Buffer.from('pdfdata') };
    await new ClaimDocumentsController().upload(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // download: invalid docId -> 400
  it('download returns 400 when docId is NaN', async () => {
    const res = mockRes();
    await new ClaimDocumentsController().download(mockReq({}, {}, { id: 'abc' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // download: doc not found -> 404
  it('download returns 404 when document not found', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await new ClaimDocumentsController().download(mockReq({}, {}, { id: '99' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // download: success
  it('download sends file data on success', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ file_name: 'report.pdf', content_type: 'application/pdf', file_data: Buffer.from('pdfbinary') }] });
    const res = mockRes();
    await new ClaimDocumentsController().download(mockReq({}, {}, { id: '5' }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.send).toHaveBeenCalled();
  });

  // remove: invalid docId -> 400
  it('remove returns 400 when docId is NaN', async () => {
    const res = mockRes();
    await new ClaimDocumentsController().remove(mockReq({}, {}, { id: 'xyz' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // 500 error path
  it('list returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new ClaimDocumentsController().list(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  ClaimHistoryController
// -----------------------------------------------------------------------------

describe('ClaimHistoryController \u2013 uncovered branches', () => {
  let ClaimHistoryController: any;

  beforeAll(() => {
    ({ ClaimHistoryController } = require('../controllers/denial-iq/claim-detail/claim-history'));
  });

  // missing claimId -> 400
  it('getHistory returns 400 when claimId missing', async () => {
    const res = mockRes();
    await new ClaimHistoryController().getHistory(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // success path: timeline branches - ClaimWorkEndedTime present (closed row)
  // fetchTimeline makes 5 queries: histReq, noteReq, stepReq, evtReq, slaReq
  it('getHistory builds timeline with closed action when ClaimWorkEndedTime set', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1', ClaimID: 'CL5001', ClaimStatus: 'Closed', AssignedToName: 'Jane Doe', AssignedToRole: 'Specialist', ClaimWorkStartedTime: new Date('2025-01-01'), ClaimWorkEndedTime: new Date('2025-01-02'), ClaimBalanceDue: 200, CarcCode: '26', Progress: 100, ClaimModifiedDate: new Date('2025-01-02') }] }) // histReq
      .mockResolvedValueOnce({ recordset: [{ id: 1, claim_id: 'CL5001', step_id: null, author_user_id: 'user@test.com', note_text: 'Test note', note_type: null, created_at: new Date('2025-01-02') }] }) // noteReq
      .mockResolvedValueOnce({ recordset: [{ id: 1, claim_id: 'CL5001', step_id: 2, completed_by: 'user@test.com', completed_at: new Date('2025-01-01'), step_title: 'Verify Denial' }] }) // stepReq
      .mockResolvedValueOnce({ recordset: [] }) // evtReq
      .mockResolvedValueOnce({ recordset: [] }); // slaReq
    const res = mockRes();
    await new ClaimHistoryController().getHistory(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // open row (ClaimWorkEndedTime null): action uses "work started"
  // fetchTimeline makes 5 queries: histReq, noteReq, stepReq, evtReq, slaReq
  it('getHistory builds timeline with open action when ClaimWorkEndedTime is null', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH2', ClaimID: 'CL5001', ClaimStatus: 'Assigned', AssignedToName: '', AssignedToRole: null, ClaimWorkStartedTime: null, ClaimWorkEndedTime: null, ClaimBalanceDue: 500, CarcCode: null, Progress: 0, ClaimModifiedDate: new Date('2025-01-01') }] }) // histReq
      .mockResolvedValueOnce({ recordset: [] }) // noteReq
      .mockResolvedValueOnce({ recordset: [] }) // stepReq
      .mockResolvedValueOnce({ recordset: [] }) // evtReq
      .mockResolvedValueOnce({ recordset: [] }); // slaReq
    const res = mockRes();
    await new ClaimHistoryController().getHistory(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.json).toHaveBeenCalled();
    const call = res.json.mock.calls[0][0];
    // The open row triggers the else branch: "Assigned - work started"
    expect(call.data[0].action).toContain('work started');
  });

  // 500 on error
  it('getHistory returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new ClaimHistoryController().getHistory(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  ClaimCommentsController
// -----------------------------------------------------------------------------

describe('ClaimCommentsController \u2013 uncovered branches', () => {
  let ClaimCommentsController: any;

  beforeAll(() => {
    ({ ClaimCommentsController } = require('../controllers/denial-iq/claim-detail/claim-comments'));
  });

  // addComment: missing body -> 400
  it('addComment returns 400 when body is empty', async () => {
    const res = mockRes();
    await new ClaimCommentsController().addComment(mockReq({ body: '' }, {}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // addComment: with mentions in body - notifications branch fires
  it('addComment sends notifications for @mentions in body', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, claimId: 'CL5001', parentId: null, authorId: 1, authorName: 'Jane Doe', authorRole: 'Specialist', body: 'test @user@example.com done', mentions: null, isEdited: 0, createdAt: new Date() }] })
      .mockResolvedValueOnce({ rowsAffected: [1] }); // notification insert
    const req = mockReq({ body: 'test @user@example.com done' }, {}, { claimId: 'CL5001' });
    req.user = { email: 'author@example.com' };
    const res = mockRes();
    await new ClaimCommentsController().addComment(req, res);
    expect(res.json).toHaveBeenCalled();
  });

  // addComment: no mentions - skips notifications loop
  it('addComment succeeds without triggering notifications when no mentions', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 2, claimId: 'CL5001', parentId: null, authorId: 1, authorName: 'Jane Doe', authorRole: 'Specialist', body: 'plain comment', mentions: null, isEdited: 0, createdAt: new Date() }] });
    const req = mockReq({ body: 'plain comment' }, {}, { claimId: 'CL5001' });
    req.user = { email: 'author@example.com' };
    const res = mockRes();
    await new ClaimCommentsController().addComment(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  // getComments: builds threaded structure
  it('getComments returns threaded comments', async () => {
    mockQuery.mockResolvedValue({ recordset: [
      { id: 1, claimId: 'CL5001', parentId: null, authorId: 1, authorName: 'Jane', authorRole: 'S', body: 'Root', mentions: '', isEdited: false, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, claimId: 'CL5001', parentId: 1, authorId: 2, authorName: 'Bob', authorRole: 'M', body: 'Reply', mentions: '', isEdited: false, createdAt: new Date(), updatedAt: new Date() },
    ]});
    const res = mockRes();
    await new ClaimCommentsController().getComments(mockReq({}, {}, { claimId: 'CL5001' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalCount: 2 }));
    const call = res.json.mock.calls[0][0];
    expect(call.comments[0].replies).toHaveLength(1);
  });

  // 500 error path
  it('getComments returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new ClaimCommentsController().getComments(mockReq({}, {}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  ClaimInformation
// -----------------------------------------------------------------------------

describe('ClaimInformation \u2013 uncovered branches', () => {
  let ClaimInformation: any;

  beforeAll(() => {
    ({ ClaimInformation } = require('../controllers/denial-iq/claim-detail/claim-information'));
  });

  // missing claimId -> 400
  it('get returns 400 when claimId missing', async () => {
    const res = mockRes();
    await new ClaimInformation().get(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // success path: recordset has data
  it('get returns 200 with claim data', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ SubscriberName: 'John Doe', PatientName: 'John Doe', PayerName: 'Medicare', AgingDays: 30, InsuranceBalDue: 200, PatientBalDue: 0 }] });
    const res = mockRes();
    await new ClaimInformation().get(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // success with null/empty recordset (|| [] branch)
  it('get returns 200 with empty array when recordset is null', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const res = mockRes();
    await new ClaimInformation().get(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });

  // 500 on error
  it('get returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new ClaimInformation().get(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Org Hierarchy (standalone functions)
// -----------------------------------------------------------------------------

describe('org-hierarchy \u2013 uncovered branches', () => {
  let listRegions: any;
  let listDepartments: any;
  let createRegion: any;
  let createDepartment: any;

  beforeAll(() => {
    ({ listRegions, listDepartments, createRegion, createDepartment } = require('../controllers/denial-iq/org-hierarchy'));
  });

  // listRegions: with msoId filter
  it('listRegions applies msoId filter when provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, region_name: 'West' }] });
    const res = mockRes();
    await listRegions(mockReq({}, { msoId: '3' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // listRegions: without msoId
  it('listRegions returns all active regions when no msoId provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await listRegions(mockReq({}, {}), res);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  // listDepartments: with locationId
  it('listDepartments applies locationId filter when provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, department_name: 'Cardiology' }] });
    const res = mockRes();
    await listDepartments(mockReq({}, { locationId: '5' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  // listDepartments: without locationId
  it('listDepartments returns all departments when no locationId', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await listDepartments(mockReq({}, {}), res);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  // createRegion: with null parent_mso_id
  it('createRegion uses null for parent_mso_id when not provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 2, region_name: 'East' }] });
    const req = mockReq({ region_name: 'East' });
    req.scopeFilter = { customerId: 1 };
    const res = mockRes();
    await createRegion(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // createDepartment: with null parent_location_id
  it('createDepartment uses null for parent_location_id when not provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 3, department_name: 'Neurology' }] });
    const req = mockReq({ department_name: 'Neurology' });
    req.scopeFilter = { customerId: 1 };
    const res = mockRes();
    await createDepartment(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// -----------------------------------------------------------------------------
//  AutoAssignmentController
// -----------------------------------------------------------------------------

describe('AutoAssignmentController \u2013 uncovered branches', () => {
  let AutoAssignmentController: any;

  beforeAll(() => {
    ({ AutoAssignmentController } = require('../controllers/denial-iq/auto-assignment'));
  });

  // no unassigned claims -> returns early with count: 0
  it('run returns count:0 when no unassigned claims', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 1, FirstName: 'Alice', LastName: 'Smith' }] }) // specialists
      .mockResolvedValueOnce({ recordset: [{ AssignedTo: 1, OpenCount: 5 }] })                       // queue counts
      .mockResolvedValueOnce({ recordset: [] })                                                        // routing rules
      .mockResolvedValueOnce({ recordset: [] })                                                        // user skills
      .mockResolvedValueOnce({ recordset: [] });                                                       // unassigned claims
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq({ limit: 50 }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }));
  });

  // no specialists -> 422
  it('run returns 422 when no AR specialists found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  // full success: assigns claims using fallback_least_loaded
  it('run assigns unassigned claims using fallback least-loaded strategy', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 1, FirstName: 'Alice', LastName: 'Smith' }, { userID: 2, FirstName: 'Bob', LastName: 'Jones' }] }) // specialists
      .mockResolvedValueOnce({ recordset: [{ AssignedTo: 1, OpenCount: 10 }, { AssignedTo: 2, OpenCount: 3 }] }) // queue
      .mockResolvedValueOnce({ recordset: [] })                                                                     // rules (none)
      .mockResolvedValueOnce({ recordset: [] })                                                                     // skills (none)
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5001', DateOfService: '2025-01-01', ClaimSubmittedDate: '2025-01-01', ChargeAmt: 250, PayerID: 'P1', ReasonCode: null, InsuranceName: null }] }) // unassigned
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH100' }] })  // max id
      .mockResolvedValueOnce({ rowsAffected: [1] });                         // INSERT assignment
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq({ limit: 10 }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  // 500 on error
  it('run returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  ClaimRemediationController
// -----------------------------------------------------------------------------

describe('ClaimRemediationController \u2013 uncovered branches', () => {
  let ClaimRemediationController: any;

  beforeAll(() => {
    ({ ClaimRemediationController } = require('../controllers/denial-iq/claim-detail/remediation'));
  });

  // getSteps: no step set found -> 200 with data: null
  it('getSteps returns data:null when no step set found', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ reason_code: 'CO26' }] }) // reason code lookup
      .mockResolvedValueOnce({ recordset: [] });                         // no step set
    const res = mockRes();
    await new ClaimRemediationController().getSteps(mockReq({}, { claimId: 'CL5001', role: 'ar-specialist' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });

  // getSteps: reason code stripped (CO prefix) differs from original -> return stripped code
  it('getSteps returns stripped reason code when group prefix stripped', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ reason_code: 'CO26' }] }) // CO26 -> stripped 26
      .mockResolvedValueOnce({ recordset: [{ id: 5, reason_code: '26', role: 'ar-specialist', version: 1, updated_at: new Date(), published_at: new Date() }] }) // step set
      .mockResolvedValueOnce({ recordset: [{ id: 1, sort_order: 1, title: 'Verify', body: 'Check denial', required: true, cl_id: null, cl_sort: null, item_text: null }] }) // steps
      .mockResolvedValueOnce({ recordset: [] }); // completions
    const res = mockRes();
    await new ClaimRemediationController().getSteps(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    // claimReasonCode should be '26' (stripped form) when CO26 is the original
    const call = res.json.mock.calls[0][0];
    expect(call.claimReasonCode).toBe('26');
  });

  // getSteps: step with checklist items
  it('getSteps includes checklist items in steps', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ reason_code: 'DEFAULT' }] })
      .mockResolvedValueOnce({ recordset: [{ id: 6, reason_code: 'DEFAULT', role: 'ar-specialist', version: 1, updated_at: new Date(), published_at: new Date() }] })
      .mockResolvedValueOnce({ recordset: [
        { id: 1, sort_order: 1, title: 'Step 1', body: 'Do this', required: true, cl_id: 10, cl_sort: 1, item_text: 'Check EOB' },
        { id: 1, sort_order: 1, title: 'Step 1', body: 'Do this', required: true, cl_id: 11, cl_sort: 2, item_text: 'Call payer' },
      ]})
      .mockResolvedValueOnce({ recordset: [{ step_id: 1, completed_at: new Date(), user_id: 'user1' }] });
    const res = mockRes();
    await new ClaimRemediationController().getSteps(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const call = res.json.mock.calls[0][0];
    expect(call.data.steps[0].checklist).toHaveLength(2);
    expect(call.data.steps[0].completed).toBe(true);
  });

  // saveStepCompletion: completed = false (DELETE path)
  it('saveStepCompletion deletes step completion when completed=false', async () => {
    mockQuery.mockResolvedValue({ rowsAffected: [1] });
    const res = mockRes();
    await new ClaimRemediationController().saveStepCompletion(
      mockReq({ claimId: 'CL5001', stepId: 2, completed: false, userId: 'user1' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completed: false }) }));
  });

  // saveStepCompletion: missing required fields -> 400
  it('saveStepCompletion returns 400 when required fields missing', async () => {
    const res = mockRes();
    await new ClaimRemediationController().saveStepCompletion(
      mockReq({ claimId: 'CL5001' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // 500 on error
  it('getSteps returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new ClaimRemediationController().getSteps(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// -----------------------------------------------------------------------------
//  Cms1500Controller
// -----------------------------------------------------------------------------

describe('Cms1500Controller \u2013 uncovered branches', () => {
  let Cms1500Controller: any;

  beforeAll(() => {
    ({ Cms1500Controller } = require('../controllers/denial-iq/claim-detail/cms1500'));
  });

  // missing claimId -> 400
  it('get returns 400 when claimId missing', async () => {
    const res = mockRes();
    await new Cms1500Controller().get(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // claim not found -> 404
  it('get returns 404 when claim not found', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = mockRes();
    await new Cms1500Controller().get(mockReq({}, { claimId: 'CL5999' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // success path: renders HTML with DenialCode present (badge branch)
  it('get renders CMS-1500 HTML when claim found with DenialCode', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        ClaimID: 'CL5001',
        PatientName: 'Jane Smith',
        PatientDOB: '1980-05-15',
        PatientAddress: '123 Main St',
        PatientCity: 'Springfield',
        PatientState: 'IL',
        PatientZip: '62701',
        PayerName: 'Medicare',
        MemberID: 'MCARE12345',
        GroupNum: 'GRP001',
        SubscriberName: 'Jane Smith',
        ProviderName: 'Dr. House',
        ProviderNPI: '1234567890',
        ProviderTaxID: '98-7654321',
        PracticeAddress: '456 Medical Dr',
        ProcCode: 'CO26',
        DiagCode: 'Z00.00',
        DenialCode: 'CO26',
        LineCharge: '500.00',
        InsPayAmt: '0.00',
        ClaimStatus: 'Denied',
        DateOfService: '2025-01-15',
        ClaimSubmittedDate: '2025-01-20',
        ChargeAmt: 500,
      }],
    });
    const res = mockRes();
    await new Cms1500Controller().get(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('CMS-1500'));
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('DENIED: CO26'));
  });

  // success path: no DenialCode (badge branch NOT taken)
  it('get renders CMS-1500 HTML when claim found without DenialCode', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        ClaimID: 'CL5002',
        PatientName: 'Bob Jones',
        PatientDOB: null,
        PatientAddress: '',
        PatientCity: '',
        PatientState: '',
        PatientZip: '',
        PayerName: 'Aetna',
        MemberID: '',
        GroupNum: '',
        SubscriberName: '',
        ProviderName: '',
        ProviderNPI: '',
        ProviderTaxID: '',
        PracticeAddress: '',
        ProcCode: '',
        DiagCode: '',
        DenialCode: '',
        LineCharge: null,
        InsPayAmt: '',
        ClaimStatus: 'Pending',
        DateOfService: null,
        ClaimSubmittedDate: null,
        ChargeAmt: null,
      }],
    });
    const res = mockRes();
    await new Cms1500Controller().get(mockReq({}, { claimId: 'CL5002' }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('CMS-1500'));
    // Badge should NOT appear
    expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining('DENIED:'));
  });

  // 500 on error
  it('get returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = mockRes();
    await new Cms1500Controller().get(mockReq({}, { claimId: 'CL5001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
