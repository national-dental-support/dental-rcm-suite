/**
 * Comprehensive unit tests for Claim Vision and Denial IQ controllers.
 * Covers happy path (200/201), error path (500), and all parameter branches (400/404/422).
 */

// --- DB mock setup -------------------------------------------------------------

const mockQuery = jest.fn();
const mockInput = jest.fn();

jest.mock('../modules/db', () => {
  const makeRequest = () => {
    const r: any = {
      input: (...a: any[]) => { mockInput(...a); return r; },
      query: mockQuery,
    };
    return r;
  };
  return {
    __esModule: true,
    default: {
      getInstance: () => ({
        getPool: () => ({ request: makeRequest }),
      }),
    },
    databaseInstance: {
      getPool: () => ({ request: makeRequest }),
    },
  };
});

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

// Mock mssql to provide Transaction support with our mockQuery
jest.mock('mssql', () => {
  const makeRequest = () => {
    const r: any = { input: (...a: any[]) => { mockInput(...a); return r; }, query: mockQuery };
    return r;
  };
  const Transaction = jest.fn().mockImplementation(() => ({
    begin: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    request: makeRequest,
  }));
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    __esModule: true,
    default: {
      Transaction,
      NVarChar: Object.assign(f, { MAX: f() }),
      Int: f(), BigInt: f(), Decimal: f, Bit: f(),
      DateTime: f(), DateTime2: f(), Date: f(), Float: f(),
      VarChar: Object.assign(f, { MAX: f() }),
      VarBinary: Object.assign(f, { MAX: f() }),
      UniqueIdentifier: f(), SmallInt: f(), Money: f(),
    },
    Transaction,
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(), BigInt: f(), Decimal: f, Bit: f(),
    DateTime: f(), DateTime2: f(), Date: f(), Float: f(),
    VarChar: Object.assign(f, { MAX: f() }),
    VarBinary: Object.assign(f, { MAX: f() }),
    UniqueIdentifier: f(), SmallInt: f(), Money: f(),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

jest.mock('../utils/claim-events', () => ({ recordClaimEvent: jest.fn().mockResolvedValue(undefined) }));

jest.mock('../utils/resolve-user-scope', () => ({
  resolveUserScope: jest.fn().mockResolvedValue({
    userId: 42,
    customerId: 1,
    isSuperAdmin: false,
    locations: [],
    providers: [],
    payers: [],
    role: 'Admin',
    groupIds: [],
    groupLocations: [],
    teamMemberIds: [],
    teamLocations: [],
    managedManagerIds: [],
    managedSpecialistIds: [],
    allManagedUserIds: [],
    isManager: false,
    isAdmin: true,
  }),
  extractCustomerId: jest.fn().mockReturnValue(null),
  buildScopeFilter: jest.fn().mockReturnValue({ where: '', addInputs: () => {} }),
  buildTeamFilter: jest.fn().mockReturnValue({ where: '', addInputs: () => {} }),
  buildCustomerFilter: jest.fn().mockReturnValue({ where: '', addInputs: () => {} }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ where: '', addInputs: () => {} }),
}));

jest.mock('../websockets/index', () => ({
  broadcast: jest.fn(),
  broadcastToCustomer: jest.fn(),
  pushNotification: jest.fn(),
}));

// --- Helpers -------------------------------------------------------------------

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<{
  query: Record<string, any>;
  params: Record<string, any>;
  body: Record<string, any>;
  headers: Record<string, any>;
  file: any;
  user: any;
}>= {}): any {
  return {
    query: {},
    params: {},
    body: {},
    headers: {},
    file: undefined,
    user: undefined,
    ...overrides,
  };
}

// --- Imports (after mocks) -----------------------------------------------------

import { ClaimVision } from '../controllers/claim-vision/rejected-claims';
import { ClaimVisionDetail } from '../controllers/claim-vision/rejected-claims-detail';
import { UpdateRejectedClaimStatus } from '../controllers/claim-vision/update-rejected-claim-status';
import { SystemRules } from '../controllers/claim-vision/system-rules';
import { CreateRule } from '../controllers/claim-vision/create-rule';
import { DeleteRule } from '../controllers/claim-vision/delete-rule';
import { UpdateRule } from '../controllers/claim-vision/update-rule';

import { AutoAssignmentController } from '../controllers/denial-iq/auto-assignment';
import { getSlaConfig, upsertSlaConfig, getSlaViolations, getSlaSummary } from '../controllers/denial-iq/sla-config';
import { PayerIntelligenceController } from '../controllers/denial-iq/payer-intelligence';
import {
  getOrgHierarchy,
  listMso,
  createMso,
  listRegions,
  createRegion,
  listDepartments,
  createDepartment,
} from '../controllers/denial-iq/org-hierarchy';

import { ClaimActionsController } from '../controllers/denial-iq/claim-detail/claim-actions';
import { ClaimCommentsController } from '../controllers/denial-iq/claim-detail/claim-comments';
import { ClaimInformation } from '../controllers/denial-iq/claim-detail/claim-information';
import { ClaimHistoryController } from '../controllers/denial-iq/claim-detail/claim-history';
import { ClaimDocumentsController } from '../controllers/denial-iq/claim-detail/documents';

import { resolveUserScope, extractCustomerId, buildScopeFilter, buildTeamFilter, buildCustomerFilter } from '../utils/resolve-user-scope';

// --- beforeEach ----------------------------------------------------------------

beforeEach(() => {
  // mockReset clears all queued Once values + call history; mockResolvedValue must be re-set after
  mockQuery.mockReset();
  mockInput.mockReset();
  // Re-establish the default so tests that don't set up Once mocks still get a safe default
  mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [1], recordsets: [[], [{ total: 0 }]] });
  // Re-establish resolveUserScope default so 401-override tests don't bleed into siblings
  (resolveUserScope as jest.Mock).mockReset();
  (resolveUserScope as jest.Mock).mockResolvedValue({
    userId: 42,
    customerId: 1,
    isSuperAdmin: false,
    locations: [],
    providers: [],
    payers: [],
    role: 'Admin',
    groupIds: [],
    groupLocations: [],
    teamMemberIds: [],
    teamLocations: [],
    managedManagerIds: [],
    managedSpecialistIds: [],
    allManagedUserIds: [],
    isManager: false,
    isAdmin: true,
  });
  (extractCustomerId as jest.Mock).mockReturnValue(null);
  (buildScopeFilter as jest.Mock).mockReturnValue({ where: '', addInputs: () => {} });
  (buildTeamFilter as jest.Mock).mockReturnValue({ where: '', addInputs: () => {} });
  (buildCustomerFilter as jest.Mock).mockReturnValue({ where: '', addInputs: () => {} });
});

// ==============================================================================
// CLAIM VISION - rejected-claims.ts
// ==============================================================================

describe('ClaimVision.get', () => {
  let ctrl: ClaimVision;
  beforeEach(() => { ctrl = new ClaimVision(); });

  it('returns 200 with empty data when no records', async () => {
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], pagination: expect.any(Object) }));
  });

  it('returns 200 with totalCount from first record', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalCount: 50, batchWeekStart: '2026-01-01' }] });
    const res = makeRes();
    await ctrl.get(makeReq({ query: { page: '2', pageSize: '10' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.pagination.page).toBe(2);
    expect(json.pagination.pageSize).toBe(10);
    expect(json.pagination.totalCount).toBe(50);
    expect(json.pagination.totalPages).toBe(5);
  });

  it('clamps pageSize to max 100', async () => {
    const res = makeRes();
    await ctrl.get(makeReq({ query: { pageSize: '999' } }), res);
    const json = res.json.mock.calls[0][0];
    expect(json.pagination.pageSize).toBe(100);
  });

  it('clamps page to min 1 on invalid input', async () => {
    const res = makeRes();
    await ctrl.get(makeReq({ query: { page: 'abc' } }), res);
    const json = res.json.mock.calls[0][0];
    expect(json.pagination.page).toBe(1);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimVision.getTrend', () => {
  let ctrl: ClaimVision;
  beforeEach(() => { ctrl = new ClaimVision(); });

  it('returns 200 with trend data', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ month: '2026-01', rejectedCount: 5, rulesTriggered: 2 }] });
    const res = makeRes();
    await ctrl.getTrend(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.data).toHaveLength(1);
  });

  it('returns 200 with empty data', async () => {
    const res = makeRes();
    await ctrl.getTrend(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.getTrend(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// CLAIM VISION - rejected-claims-detail.ts
// ==============================================================================

describe('ClaimVisionDetail.get', () => {
  let ctrl: ClaimVisionDetail;
  beforeEach(() => { ctrl = new ClaimVisionDetail(); });

  it('returns 200 with no query params (defaults)', async () => {
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toHaveProperty('data');
  });

  it('returns 200 with ruleId and batchWeekStart provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ RejectedClaimID: 'RC1', Patient: 'John Doe' }] });
    const res = makeRes();
    await ctrl.get(makeReq({ query: { ruleId: 'R0001', batchWeekStart: '2026-01-06' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });

  it('passes null for missing optional params', async () => {
    const res = makeRes();
    await ctrl.get(makeReq({ query: {} }), res);
    // mockInput should have been called with null values
    expect(mockInput).toHaveBeenCalledWith('p_ruleId', expect.anything(), null);
    expect(mockInput).toHaveBeenCalledWith('p_batchWeekStart', expect.anything(), null);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// CLAIM VISION - update-rejected-claim-status.ts
// ==============================================================================

describe('UpdateRejectedClaimStatus.patch', () => {
  let ctrl: UpdateRejectedClaimStatus;
  beforeEach(() => { ctrl = new UpdateRejectedClaimStatus(); });

  it('returns 400 when rejectedClaimId is missing', async () => {
    const res = makeRes();
    // params.id is undefined
    await ctrl.patch(makeReq({ params: {}, body: { status: 'Completed' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when status is missing', async () => {
    const res = makeRes();
    await ctrl.patch(makeReq({ params: { id: 'RC1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when status is invalid', async () => {
    const res = makeRes();
    await ctrl.patch(makeReq({ params: { id: 'RC1' }, body: { status: 'BadStatus' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('Invalid status');
  });

  it('returns 200 with status Completed \u2014 sets completedDate + completedBy', async () => {
    const res = makeRes();
    await ctrl.patch(makeReq({
      params: { id: 'RC1' },
      body: { status: 'Completed' },
      headers: { 'x-actor-email': 'user@test.com' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockInput).toHaveBeenCalledWith('completedBy', expect.anything(), 'user@test.com');
  });

  it('returns 200 with status "Not complete" \u2014 nulls completedDate + completedBy', async () => {
    const res = makeRes();
    await ctrl.patch(makeReq({
      params: { id: 'RC1' },
      body: { status: 'Not complete' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockInput).toHaveBeenCalledWith('completedDate', expect.anything(), null);
    expect(mockInput).toHaveBeenCalledWith('completedBy', expect.anything(), null);
  });

  it('uses "unknown" as completedBy when x-actor-email header absent', async () => {
    const res = makeRes();
    await ctrl.patch(makeReq({
      params: { id: 'RC1' },
      body: { status: 'Completed' },
      headers: {},
    }), res);
    expect(mockInput).toHaveBeenCalledWith('completedBy', expect.anything(), 'unknown');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.patch(makeReq({ params: { id: 'RC1' }, body: { status: 'Completed' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// CLAIM VISION - system-rules.ts
// ==============================================================================

describe('SystemRules.get', () => {
  let ctrl: SystemRules;
  beforeEach(() => { ctrl = new SystemRules(); });

  it('returns 200 with rules data', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ 'Rule name': 'R1', RuleID: 'R0001' }] });
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });

  it('returns 200 with empty recordset', async () => {
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// CLAIM VISION - create-rule.ts
// ==============================================================================

describe('CreateRule.post', () => {
  let ctrl: CreateRule;
  beforeEach(() => { ctrl = new CreateRule(); });

  it('returns 400 when name is missing', async () => {
    const res = makeRes();
    await ctrl.post(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('Rule name is required');
  });

  it('returns 201 with next ruleId when no existing rules', async () => {
    // First query: maxId lookup returns empty
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // Second query: insert
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.post(makeReq({ body: { name: 'New Rule' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.ruleId).toBe('R0001');
  });

  it('increments ruleId from last existing rule', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ RuleID: 'R0042' }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.post(makeReq({ body: { name: 'Another Rule' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.ruleId).toBe('R0043');
  });

  it('handles non-numeric lastId gracefully (nextNum stays 1)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ RuleID: 'RXYZ' }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.post(makeReq({ body: { name: 'Edge Rule' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.ruleId).toBe('R0001');
  });

  it('serialises object conditions/actions/scopeValues to JSON strings', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.post(makeReq({
      body: {
        name: 'Rule',
        conditions: [{ field: 'payer', operator: 'in', values: ['Aetna'] }],
        actions: [{ type: 'flag' }],
        scopeValues: ['loc1'],
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    // input should have been called with JSON strings for arrays
    expect(mockInput).toHaveBeenCalledWith('conditions', expect.stringContaining('payer'));
  });

  it('uses defaults for optional fields', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.post(makeReq({ body: { name: 'Min Rule' } }), res);
    expect(mockInput).toHaveBeenCalledWith('ruleType', 'Custom');
    expect(mockInput).toHaveBeenCalledWith('createdBy', 'Unknown');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.post(makeReq({ body: { name: 'Rule' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// CLAIM VISION - delete-rule.ts
// ==============================================================================

describe('DeleteRule.delete', () => {
  let ctrl: DeleteRule;
  beforeEach(() => { ctrl = new DeleteRule(); });

  it('returns 400 when id param is missing', async () => {
    const res = makeRes();
    await ctrl.delete(makeReq({ params: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when rule does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });
    const res = makeRes();
    await ctrl.delete(makeReq({ params: { id: 'R9999' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 and cleans up history on success', async () => {
    // DELETE rules -> 1 row affected
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    // DELETE ruleshistory
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.delete(makeReq({ params: { id: 'R0001' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.ruleId).toBe('R0001');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.delete(makeReq({ params: { id: 'R0001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// CLAIM VISION - update-rule.ts
// ==============================================================================

describe('UpdateRule.put', () => {
  let ctrl: UpdateRule;
  beforeEach(() => { ctrl = new UpdateRule(); });

  it('returns 400 when id param is missing', async () => {
    const res = makeRes();
    await ctrl.put(makeReq({ params: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 on successful update', async () => {
    // UPDATE + INSERT history
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.put(makeReq({ params: { id: 'R0001' }, body: { name: 'Updated' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.ruleId).toBe('R0001');
  });

  it('serialises object conditions/actions/scopeValues to JSON strings', async () => {
    mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.put(makeReq({
      params: { id: 'R0001' },
      body: {
        conditions: [{ field: 'payer' }],
        actions: [{ type: 'route' }],
        scopeValues: ['scope1'],
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles activeFlag = 0 (falsy) correctly \u2014 sets to 0', async () => {
    mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.put(makeReq({ params: { id: 'R0001' }, body: { activeFlag: 0 } }), res);
    expect(mockInput).toHaveBeenCalledWith('activeFlag', 0);
  });

  it('handles activeFlag = null \u2014 defaults to 1', async () => {
    mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.put(makeReq({ params: { id: 'R0001' }, body: {} }), res);
    expect(mockInput).toHaveBeenCalledWith('activeFlag', 1);
  });

  it('uses "Unknown" as modifiedBy when not provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.put(makeReq({ params: { id: 'R0001' }, body: {} }), res);
    expect(mockInput).toHaveBeenCalledWith('modifiedBy', 'Unknown');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.put(makeReq({ params: { id: 'R0001' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// DENIAL IQ - auto-assignment.ts
// ==============================================================================

describe('AutoAssignmentController.run', () => {
  let ctrl: AutoAssignmentController;

  beforeEach(() => {
    ctrl = new AutoAssignmentController();
  });

  it('returns 422 when no active specialists', async () => {
    // specialists query returns empty
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].message).toContain('No active AR specialists');
  });

  it('returns count=0 when no unassigned claims', async () => {
    const specialists = [{ userID: 1, FirstName: 'Alice', LastName: 'Smith' }];
    // specialists
    mockQuery.mockResolvedValueOnce({ recordset: specialists });
    // queue counts
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // routing rules
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // user skills
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // unassigned claims -> empty
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }));
  });

  it('assigns claims using fallback least-loaded when no rules match', async () => {
    const specialists = [
      { userID: 1, FirstName: 'Alice', LastName: 'Smith' },
      { userID: 2, FirstName: 'Bob',   LastName: 'Jones' },
    ];
    const claims = [{ ClaimID: 'CL50001', DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 100, PayerID: 1, ReasonCode: 'CO45', InsuranceName: 'Aetna' }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })   // specialists
      .mockResolvedValueOnce({ recordset: [] })            // queue
      .mockResolvedValueOnce({ recordset: [] })            // rules (empty)
      .mockResolvedValueOnce({ recordset: [] })            // skills
      .mockResolvedValueOnce({ recordset: claims })        // unassigned
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH100' }] }) // maxId
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // insert

    const res = makeRes();
    await ctrl.run(makeReq({ body: { limit: 10 } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    const json = res.json.mock.calls[0][0];
    expect(json.assignments[0].strategy).toBe('fallback_least_loaded');
  });

  it('uses least_loaded strategy when a rule matches', async () => {
    const specialists = [{ userID: 1, FirstName: 'Alice', LastName: 'Smith' }];
    const claims = [{ ClaimID: 'CL50002', ReasonCode: 'CO45', InsuranceName: 'Aetna', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 1, rule_name: 'Rule1', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO45'] }),
      assign_strategy: 'least_loaded', assign_target: null,
    }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH5' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    const json = res.json.mock.calls[0][0];
    expect(json.assignments[0].strategy).toContain('least_loaded');
  });

  it('uses round_robin strategy', async () => {
    const specialists = [{ userID: 1, FirstName: 'A', LastName: 'B' }];
    const claims = [{ ClaimID: 'CL5X', ReasonCode: 'CO45', InsuranceName: 'X', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 2, rule_name: 'RRRule', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'equals', values: ['CO45'] }),
      assign_strategy: 'round_robin', assign_target: null,
    }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toContain('round_robin');
  });

  it('uses skill_match strategy when specialist has matching skill', async () => {
    const specialists = [{ userID: 7, FirstName: 'S', LastName: 'K' }];
    const claims = [{ ClaimID: 'CL5Y', ReasonCode: 'CO97', InsuranceName: 'X', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 3, rule_name: 'SkillRule', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO97'] }),
      assign_strategy: 'skill_match', assign_target: null,
    }];
    const skills = [{ user_id: 7, skill_type: 'reason_code', skill_value: 'CO97', proficiency: 5 }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: skills })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toContain('skill_match');
  });

  it('falls back past skill_match rule to least_loaded when no skilled specialist', async () => {
    const specialists = [{ userID: 9, FirstName: 'Z', LastName: 'Q' }];
    const claims = [{ ClaimID: 'CL5Z', ReasonCode: 'CO999', InsuranceName: 'X', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 4, rule_name: 'NoSkill', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO999'] }),
      assign_strategy: 'skill_match', assign_target: null,
    }];
    // specialist has no skills
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] }) // skills empty
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    // falls through to fallback
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toBe('fallback_least_loaded');
  });

  it('uses specific_user strategy when target found by name', async () => {
    const specialists = [{ userID: 5, FirstName: 'Specific', LastName: 'User' }];
    const claims = [{ ClaimID: 'CL5SU', ReasonCode: 'CO45', InsuranceName: 'X', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 5, rule_name: 'SpecRule', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'contains', values: ['45'] }),
      assign_strategy: 'specific_user', assign_target: 'Specific User',
    }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toContain('specific_user');
  });

  it('skips specific_user when target not found and falls back', async () => {
    const specialists = [{ userID: 5, FirstName: 'Alice', LastName: 'B' }];
    const claims = [{ ClaimID: 'CL5FB', ReasonCode: 'CO45', InsuranceName: 'X', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 6, rule_name: 'SpecMiss', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO45'] }),
      assign_strategy: 'specific_user', assign_target: 'Nobody Here',
    }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toBe('fallback_least_loaded');
  });

  it('specific_user matches by userID string', async () => {
    const specialists = [{ userID: 99, FirstName: 'ID', LastName: 'Match' }];
    const claims = [{ ClaimID: 'CL5ID', ReasonCode: 'CO1', InsuranceName: 'X', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 7, rule_name: 'IdRule', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO1'] }),
      assign_strategy: 'specific_user', assign_target: '99',
    }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toContain('specific_user');
  });

  it('skips rule with invalid JSON match_criteria and falls back', async () => {
    const specialists = [{ userID: 1, FirstName: 'A', LastName: 'B' }];
    const claims = [{ ClaimID: 'CL5BAD', ReasonCode: 'CO45', InsuranceName: 'X', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{ id: 8, rule_name: 'Bad', priority: 1, match_criteria: '{invalid json', assign_strategy: 'least_loaded', assign_target: null }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toBe('fallback_least_loaded');
  });

  it('claim does not match when claimValue is empty', async () => {
    const specialists = [{ userID: 1, FirstName: 'A', LastName: 'B' }];
    // claim with no ReasonCode, payer criteria
    const claims = [{ ClaimID: 'CL5EMPTY', ReasonCode: null, InsuranceName: null, PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 9, rule_name: 'NoMatch', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO45'] }),
      assign_strategy: 'least_loaded', assign_target: null,
    }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toBe('fallback_least_loaded');
  });

  it('uses default operator fallback (returns false) for unknown operator', async () => {
    const specialists = [{ userID: 1, FirstName: 'A', LastName: 'B' }];
    const claims = [{ ClaimID: 'CL5OP', ReasonCode: 'CO45', InsuranceName: null, PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 10, rule_name: 'BadOp', priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'unknown_op', values: ['CO45'] }),
      assign_strategy: 'least_loaded', assign_target: null,
    }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    // should fall back since criteria didn't match
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toBe('fallback_least_loaded');
  });

  it('maps payer field to InsuranceName', async () => {
    const specialists = [{ userID: 1, FirstName: 'A', LastName: 'B' }];
    const claims = [{ ClaimID: 'CL5P', ReasonCode: null, InsuranceName: 'aetna', PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    const rules = [{
      id: 11, rule_name: 'PayerRule', priority: 1,
      match_criteria: JSON.stringify({ field: 'payer', operator: 'in', values: ['aetna'] }),
      assign_strategy: 'least_loaded', assign_target: null,
    }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: rules })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH0' }] })
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].assignments[0].strategy).toContain('least_loaded');
  });

  it('clamps limit at 200', async () => {
    // Just verify it doesn't blow up and specialists returns 422 path
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: { limit: 9999 } }), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('uses ClaimHistoryId = CH0 default when no prior history', async () => {
    const specialists = [{ userID: 1, FirstName: 'A', LastName: 'B' }];
    const claims = [{ ClaimID: 'CL5X', ReasonCode: null, InsuranceName: null, PayerID: 1, DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }];
    mockQuery
      .mockResolvedValueOnce({ recordset: specialists })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [] }) // no prior history -> default CH0
      .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].count).toBe(1);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.run(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// DENIAL IQ - sla-config.ts (function-based controllers)
// ==============================================================================

describe('getSlaConfig', () => {
  it('returns data with no scopeFilter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, queue_type: 'denial' }] });
    const req = makeReq();
    const res = makeRes();
    await getSlaConfig(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 1, queue_type: 'denial' }] });
  });

  it('appends customer filter when scopeFilter.sql is present', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = Object.assign(makeReq(), { scopeFilter: { sql: 'customer_id = 5', customerId: 5 } });
    const res = makeRes();
    await getSlaConfig(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });
});

describe('upsertSlaConfig', () => {
  it('calls MERGE and returns ok:true', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const req = Object.assign(makeReq({
      body: { queue_type: 'denial', payer_class: 'Medicare', first_touch_hours: 24, followup_max_hours: 48, resolution_target_days: 30 },
    }), { scopeFilter: { customerId: 1 } });
    const res = makeRes();
    await upsertSlaConfig(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('uses defaults for optional body fields', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const req = Object.assign(makeReq({ body: {} }), { scopeFilter: { customerId: 1 } });
    const res = makeRes();
    await upsertSlaConfig(req, res);
    expect(mockInput).toHaveBeenCalledWith('ftHours', expect.anything(), 48);
    expect(mockInput).toHaveBeenCalledWith('fuHours', expect.anything(), 72);
    expect(mockInput).toHaveBeenCalledWith('resDays', expect.anything(), 30);
  });
});

describe('getSlaViolations', () => {
  it('returns open violations by default (open=true)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1 }] });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await getSlaViolations(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 1 }] });
  });

  it('returns all violations when open=false', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1 }, { id: 2 }] });
    const req = makeReq({ query: { open: 'false' } });
    const res = makeRes();
    await getSlaViolations(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 1 }, { id: 2 }] });
  });

  it('appends scopeFilter when present', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = Object.assign(makeReq({ query: {} }), { scopeFilter: { sql: 'customer_id = 5' } });
    const res = makeRes();
    await getSlaViolations(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });
});

describe('getSlaSummary', () => {
  it('returns summary data', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ violation_type: 'first_touch', total: 5 }] });
    const res = makeRes();
    await getSlaSummary(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ data: [{ violation_type: 'first_touch', total: 5 }] });
  });

  it('works without scopeFilter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await getSlaSummary(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });
});

// ==============================================================================
// DENIAL IQ - payer-intelligence.ts
// ==============================================================================

describe('PayerIntelligenceController.getCarcDetail', () => {
  let ctrl: PayerIntelligenceController;
  beforeEach(() => { ctrl = new PayerIntelligenceController(); });

  it('returns 400 when CARC code is missing', async () => {
    const res = makeRes();
    await ctrl.getCarcDetail(makeReq({ params: { code: '' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when code param is absent', async () => {
    const res = makeRes();
    await ctrl.getCarcDetail(makeReq({ params: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with CARC data from Carcs table', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ code: 'CO45', description: 'Charges exceed fee schedule' }] });
    const res = makeRes();
    await ctrl.getCarcDetail(makeReq({ params: { code: 'CO45' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.code).toBe('CO45');
  });

  it('falls back to CarcPayerGuidance when Carcs returns empty', async () => {
    // First query empty
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // Fallback guidance query returns a record
    mockQuery.mockResolvedValueOnce({ recordset: [{ code: 'CO45', description: null }] });
    const res = makeRes();
    await ctrl.getCarcDetail(makeReq({ params: { code: 'CO45' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 when both queries return empty', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.getCarcDetail(makeReq({ params: { code: 'ZZZ' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('passes payerName query param', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ code: 'CO45' }] });
    const res = makeRes();
    await ctrl.getCarcDetail(makeReq({ params: { code: 'CO45' }, query: { payerName: 'Aetna' } }), res);
    expect(mockInput).toHaveBeenCalledWith('PayerName', expect.anything(), 'Aetna');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.getCarcDetail(makeReq({ params: { code: 'CO45' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayerIntelligenceController.listCarcLibrary', () => {
  let ctrl: PayerIntelligenceController;
  beforeEach(() => { ctrl = new PayerIntelligenceController(); });

  it('returns 200 with data and total', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [],
      recordsets: [[{ code: 'CO45' }], [{ total: 1 }]],
    });
    const res = makeRes();
    await ctrl.listCarcLibrary(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json).toHaveProperty('page');
    expect(json).toHaveProperty('pageSize', 50);
  });

  it('handles pagination page param', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], recordsets: [[], [{ total: 0 }]] });
    const res = makeRes();
    await ctrl.listCarcLibrary(makeReq({ query: { page: '3', search: 'CO', category: 'Contractual' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].page).toBe(3);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.listCarcLibrary(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayerIntelligenceController.listCarcDescriptions', () => {
  let ctrl: PayerIntelligenceController;
  beforeEach(() => { ctrl = new PayerIntelligenceController(); });

  it('returns 200 with all CARC descriptions', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ code: 'CO45', description: 'desc' }] });
    const res = makeRes();
    await ctrl.listCarcDescriptions(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.listCarcDescriptions(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayerIntelligenceController.getDeadline', () => {
  let ctrl: PayerIntelligenceController;
  beforeEach(() => { ctrl = new PayerIntelligenceController(); });

  it('returns 200 with found deadline', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ payer_name: 'Aetna', deadline_days: 90, appeal_days: 60 }] });
    const res = makeRes();
    await ctrl.getDeadline(makeReq({ query: { payerName: 'Aetna' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.payer_name).toBe('Aetna');
  });

  it('returns 200 with generic defaults when payer not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.getDeadline(makeReq({ query: { payerName: 'Unknown Payer' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.deadline_days).toBe(180);
  });

  it('uses empty string when payerName not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.getDeadline(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.payer_name).toBe('Generic');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.getDeadline(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayerIntelligenceController.listDeadlines', () => {
  let ctrl: PayerIntelligenceController;
  beforeEach(() => { ctrl = new PayerIntelligenceController(); });

  it('returns 200 with all deadlines', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, payer_name: 'Aetna' }] });
    const res = makeRes();
    await ctrl.listDeadlines(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.listDeadlines(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayerIntelligenceController.upsertDeadline', () => {
  let ctrl: PayerIntelligenceController;
  beforeEach(() => { ctrl = new PayerIntelligenceController(); });

  it('returns 400 when payer_name is missing', async () => {
    const res = makeRes();
    await ctrl.upsertDeadline(makeReq({ body: { deadline_days: 90 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when deadline_days is missing', async () => {
    const res = makeRes();
    await ctrl.upsertDeadline(makeReq({ body: { payer_name: 'Aetna' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 on successful MERGE', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.upsertDeadline(makeReq({ body: { payer_name: 'Aetna', deadline_days: 90, appeal_days: 60, notes: 'Note' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('defaults appeal_days to 60 and notes to null when absent', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.upsertDeadline(makeReq({ body: { payer_name: 'Aetna', deadline_days: 90 } }), res);
    expect(mockInput).toHaveBeenCalledWith('AppealDays', expect.anything(), 60);
    expect(mockInput).toHaveBeenCalledWith('Notes', expect.anything(), null);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.upsertDeadline(makeReq({ body: { payer_name: 'Aetna', deadline_days: 90 } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// DENIAL IQ - org-hierarchy.ts
// ==============================================================================

describe('getOrgHierarchy', () => {
  it('returns data from view', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ mso_id: 1 }] });
    const res = makeRes();
    await getOrgHierarchy(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ data: [{ mso_id: 1 }] });
  });
});

describe('listMso', () => {
  it('returns active MSOs', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, mso_name: 'MSO1' }] });
    const res = makeRes();
    await listMso(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 1, mso_name: 'MSO1' }] });
  });
});

describe('createMso', () => {
  it('returns 201 with created MSO', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, mso_name: 'New MSO' }] });
    const req = Object.assign(makeReq({ body: { mso_name: 'New MSO' } }), { scopeFilter: { customerId: 2 } });
    const res = makeRes();
    await createMso(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.mso_name).toBe('New MSO');
  });

  it('works without scopeFilter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 2, mso_name: 'MSO2' }] });
    const res = makeRes();
    await createMso(makeReq({ body: { mso_name: 'MSO2' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('listRegions', () => {
  it('returns all active regions without msoId filter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, region_name: 'East' }] });
    const res = makeRes();
    await listRegions(makeReq({ query: {} }), res);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 1, region_name: 'East' }] });
  });

  it('filters by msoId when provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 2, region_name: 'West' }] });
    const res = makeRes();
    await listRegions(makeReq({ query: { msoId: '5' } }), res);
    expect(mockInput).toHaveBeenCalledWith('msoId', expect.anything(), 5);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 2, region_name: 'West' }] });
  });
});

describe('createRegion', () => {
  it('returns 201 with created region', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 3, region_name: 'North' }] });
    const req = Object.assign(makeReq({ body: { region_name: 'North', parent_mso_id: 1 } }), { scopeFilter: { customerId: 1 } });
    const res = makeRes();
    await createRegion(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('uses null for parent_mso_id when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 4, region_name: 'South' }] });
    const req = Object.assign(makeReq({ body: { region_name: 'South' } }), { scopeFilter: {} });
    const res = makeRes();
    await createRegion(req, res);
    expect(mockInput).toHaveBeenCalledWith('msoId', expect.anything(), null);
  });
});

describe('listDepartments', () => {
  it('returns departments without locationId filter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, department_name: 'Cardiology' }] });
    const res = makeRes();
    await listDepartments(makeReq({ query: {} }), res);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 1, department_name: 'Cardiology' }] });
  });

  it('filters by locationId when provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await listDepartments(makeReq({ query: { locationId: '7' } }), res);
    expect(mockInput).toHaveBeenCalledWith('locId', expect.anything(), 7);
  });
});

describe('createDepartment', () => {
  it('returns 201 with created department', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 5, department_name: 'Billing' }] });
    const req = Object.assign(makeReq({ body: { department_name: 'Billing', parent_location_id: 2 } }), { scopeFilter: { customerId: 1 } });
    const res = makeRes();
    await createDepartment(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('uses null for parent_location_id when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 6, department_name: 'Admin' }] });
    const req = Object.assign(makeReq({ body: { department_name: 'Admin' } }), { scopeFilter: {} });
    const res = makeRes();
    await createDepartment(req, res);
    expect(mockInput).toHaveBeenCalledWith('locId', expect.anything(), null);
  });
});

// ==============================================================================
// DENIAL IQ - claim-actions.ts
// ==============================================================================

describe('ClaimActionsController.startWork', () => {
  let ctrl: ClaimActionsController;
  beforeEach(() => { ctrl = new ClaimActionsController(); });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.startWork(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when user not resolved', async () => {
    (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null, isSuperAdmin: false, locations: [], providers: [], payers: [] });
    const res = makeRes();
    await ctrl.startWork(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 200 idempotent when work already started', async () => {
    // existing row with ClaimWorkStartedTime set
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1', ClaimWorkStartedTime: new Date() }] });
    const res = makeRes();
    await ctrl.startWork(makeReq({ body: { claimId: 'CL50001' }, headers: { 'x-actor-email': 'u@t.com' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].message).toContain('already started');
  });

  it('updates existing row when ClaimWorkStartedTime is null', async () => {
    // existing row without started time
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1', ClaimWorkStartedTime: null }] });
    // update query
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    // recordClaimEvent inner query (already mocked via utility mock)
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.startWork(makeReq({ body: { claimId: 'CL50001' }, headers: { 'x-actor-email': 'u@t.com' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].message).toBe('Work started');
  });

  it('returns no-op when no open row exists for user', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.startWork(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].claimHistoryId).toBeNull();
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.startWork(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimActionsController.close', () => {
  let ctrl: ClaimActionsController;
  beforeEach(() => { ctrl = new ClaimActionsController(); });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.close(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when user not resolved', async () => {
    (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null, isSuperAdmin: false, locations: [], providers: [], payers: [] });
    const res = makeRes();
    await ctrl.close(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 200 already closed when no open row', async () => {
    // find open row -> empty
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.close(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].message).toContain('already closed');
  });

  it('closes claim, creates pending row, returns 200', async () => {
    // find open row
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH10' }] });
    // update close
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    // pending config
    mockQuery.mockResolvedValueOnce({ recordset: [{ pending_days: 7 }] });
    // max id
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH10' }] });
    // claim data
    mockQuery.mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 100 }] });
    // insert pending
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    // recordClaimEvent
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

    const res = makeRes();
    await ctrl.close(makeReq({ body: { claimId: 'CL50001', progress: 50, claimStatus: 'Closed' }, headers: { 'x-actor-email': 'u@t.com' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].pendingDays).toBe(7);
  });

  it('uses default pending_days of 14 when config has none', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH11' }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // no config row
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // no max id -> CH0
    mockQuery.mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 0 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

    const res = makeRes();
    await ctrl.close(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.json.mock.calls[0][0].pendingDays).toBe(14);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.close(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimActionsController.closeAdjudicated', () => {
  let ctrl: ClaimActionsController;
  beforeEach(() => { ctrl = new ClaimActionsController(); });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.closeAdjudicated(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when user not resolved', async () => {
    (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null, isSuperAdmin: false, locations: [], providers: [], payers: [] });
    const res = makeRes();
    await ctrl.closeAdjudicated(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 200 already closed when no open row', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.closeAdjudicated(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].message).toBe('Claim already closed');
  });

  it('closes claim as adjudicated and returns 200', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH20' }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // recordClaimEvent

    const res = makeRes();
    await ctrl.closeAdjudicated(makeReq({ body: { claimId: 'CL50001', progress: 75 } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].message).toContain('adjudicated');
  });

  it('defaults progress to 100 when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH21' }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.closeAdjudicated(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(mockInput).toHaveBeenCalledWith('Progress', expect.anything(), 100);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.closeAdjudicated(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimActionsController.unassign', () => {
  let ctrl: ClaimActionsController;
  beforeEach(() => { ctrl = new ClaimActionsController(); });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.unassign(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when user not resolved', async () => {
    (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null, isSuperAdmin: false, locations: [], providers: [], payers: [] });
    const res = makeRes();
    await ctrl.unassign(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 200 with rows affected', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // recordClaimEvent
    const res = makeRes();
    await ctrl.unassign(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].rowsAffected).toBe(1);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.unassign(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimActionsController.writeOff', () => {
  let ctrl: ClaimActionsController;
  beforeEach(() => { ctrl = new ClaimActionsController(); });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.writeOff(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when user not resolved', async () => {
    (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null, isSuperAdmin: false, locations: [], providers: [], payers: [] });
    const res = makeRes();
    await ctrl.writeOff(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 404 when claim not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // claimData empty
    const res = makeRes();
    await ctrl.writeOff(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 and writes off claim with amount from body', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ customer_id: 1, ChargeAmt: 200, ClaimBalanceDue: 150 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // close row
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // PaymentTransaction insert
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // recordClaimEvent
    const res = makeRes();
    await ctrl.writeOff(makeReq({ body: { claimId: 'CL50001', amount: 100, reason: 'Patient balance' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].amount).toBe(100);
  });

  it('falls back to ClaimBalanceDue when amount not in body', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ customer_id: 1, ChargeAmt: 200, ClaimBalanceDue: 150 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.writeOff(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.json.mock.calls[0][0].amount).toBe(150);
  });

  it('continues (non-fatal) when PaymentTransaction insert fails', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ customer_id: 1, ChargeAmt: 200, ClaimBalanceDue: 0 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // close
    mockQuery.mockRejectedValueOnce(new Error('txn fail'));                 // PaymentTransaction fails
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // recordClaimEvent still runs
    const res = makeRes();
    await ctrl.writeOff(makeReq({ body: { claimId: 'CL50001' } }), res);
    // Should still succeed
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on outer DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.writeOff(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimActionsController.escalate', () => {
  let ctrl: ClaimActionsController;
  beforeEach(() => { ctrl = new ClaimActionsController(); });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.escalate(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when user not resolved', async () => {
    (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null, isSuperAdmin: false, locations: [], providers: [], payers: [] });
    const res = makeRes();
    await ctrl.escalate(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 422 when no active manager found', async () => {
    // close specialist row
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    // find manager -> empty
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.escalate(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].message).toContain('No active manager');
  });

  it('escalates claim to manager and returns 201', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });              // close specialist row
    mockQuery.mockResolvedValueOnce({ recordset: [] });                                 // my assigned manager (none)
    mockQuery.mockResolvedValueOnce({ recordset: [{ userID: 99 }] });                  // fallback: first manager
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH50' }] });       // max ClaimHistoryId
    mockQuery.mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 0, Progress: 0 }] }); // claim data
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });              // insert history row
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });              // insert note
    const res = makeRes();
    await ctrl.escalate(makeReq({ body: { claimId: 'CL50001', reason: 'Complex case' }, headers: { 'x-actor-email': 'sp@t.com' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].managerId).toBe(99);
  });

  it('uses default reason "Not specified" when reason not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // close specialist row
    mockQuery.mockResolvedValueOnce({ recordset: [] });                    // my assigned manager (none)
    mockQuery.mockResolvedValueOnce({ recordset: [{ userID: 10 }] });     // fallback: first manager
    mockQuery.mockResolvedValueOnce({ recordset: [] });                    // no prior CH id
    mockQuery.mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 0, Progress: 0 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // insert history
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // insert note
    const res = makeRes();
    await ctrl.escalate(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(mockInput).toHaveBeenCalledWith('NoteText', expect.anything(), expect.stringContaining('Not specified'));
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.escalate(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimActionsController.assign', () => {
  let ctrl: ClaimActionsController;
  beforeEach(() => { ctrl = new ClaimActionsController(); });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.assign(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when user not resolved', async () => {
    (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null, isSuperAdmin: false, locations: [], providers: [], payers: [] });
    const res = makeRes();
    await ctrl.assign(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('assigns claim to current user when assignToUserId not specified', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });           // close existing
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH60' }] });    // max id
    mockQuery.mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 500 }] }); // claim data
    mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimStatus: 'Assigned', CarcCode: null, ClaimBalanceDue: 500 }] }); // prev history
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });           // insert new row
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });           // recordClaimEvent
    const res = makeRes();
    await ctrl.assign(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].assignedTo).toBe(42); // userId from resolveUserScope mock
  });

  it('assigns claim to specified user when assignToUserId provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // no prior CH
    mockQuery.mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 0 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // no prev history
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.assign(makeReq({ body: { claimId: 'CL50001', assignToUserId: 77 } }), res);
    expect(res.json.mock.calls[0][0].assignedTo).toBe(77);
  });

  it('uses ChargeAmt as balance when no prior history', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 999 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // no prev history -> ph is undefined
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.assign(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(mockInput).toHaveBeenCalledWith('Balance', expect.anything(), 999);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.assign(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// DENIAL IQ - claim-comments.ts
// ==============================================================================

describe('ClaimCommentsController.getComments', () => {
  let ctrl: ClaimCommentsController;
  beforeEach(() => { ctrl = new ClaimCommentsController(); });

  it('returns threaded comments on success', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { id: 1, claimId: 'CL50001', parentId: null, authorId: 1, authorName: 'Alice B', authorRole: 'Specialist', body: 'Top', mentions: '', isEdited: false, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, claimId: 'CL50001', parentId: 1, authorId: 2, authorName: 'Bob C', authorRole: 'Manager', body: 'Reply', mentions: '', isEdited: false, createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    const res = makeRes();
    await ctrl.getComments(makeReq({ params: { claimId: 'CL50001' } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalCount: 2 }));
    const { comments } = res.json.mock.calls[0][0];
    expect(comments).toHaveLength(1);
    expect(comments[0].replies).toHaveLength(1);
  });

  it('returns empty thread list when no comments', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.getComments(makeReq({ params: { claimId: 'CL50001' } }), res);
    expect(res.json.mock.calls[0][0].comments).toHaveLength(0);
    expect(res.json.mock.calls[0][0].totalCount).toBe(0);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.getComments(makeReq({ params: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimCommentsController.addComment', () => {
  let ctrl: ClaimCommentsController;
  beforeEach(() => { ctrl = new ClaimCommentsController(); });

  it('returns 400 when body is empty', async () => {
    const res = makeRes();
    await ctrl.addComment(makeReq({ params: { claimId: 'CL50001' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when body is only whitespace', async () => {
    const res = makeRes();
    await ctrl.addComment(makeReq({ params: { claimId: 'CL50001' }, body: { body: '   ' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('inserts comment and returns the new record', async () => {
    const newComment = { id: 10, claimId: 'CL50001', parentId: null, authorId: 5, authorName: 'Bob', body: 'Test' };
    mockQuery.mockResolvedValueOnce({ recordset: [newComment] });
    const res = makeRes();
    await ctrl.addComment(makeReq({
      params: { claimId: 'CL50001' },
      body: { body: 'Test comment', parentId: null, mentions: [] },
      user: { email: 'u@t.com' },
    }), res);
    expect(res.json).toHaveBeenCalledWith(newComment);
  });

  it('sends notification for @mentioned users', async () => {
    const newComment = { id: 11, authorName: 'Alice', body: 'Hello @bob@test.com' };
    mockQuery.mockResolvedValueOnce({ recordset: [newComment] });          // insert comment
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // notification insert
    const res = makeRes();
    await ctrl.addComment(makeReq({
      params: { claimId: 'CL50001' },
      body: { body: 'Hello @bob@test.com' },
      user: { email: 'alice@t.com' },
    }), res);
    expect(res.json).toHaveBeenCalledWith(newComment);
    // Notification query should have been called
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('continues silently when notification insert fails', async () => {
    const newComment = { id: 12, authorName: 'Alice', body: 'Hi @bob@t.com' };
    mockQuery.mockResolvedValueOnce({ recordset: [newComment] });
    mockQuery.mockRejectedValueOnce(new Error('Notifications table missing'));
    const res = makeRes();
    await ctrl.addComment(makeReq({
      params: { claimId: 'CL50001' },
      body: { body: 'Hi @bob@t.com' },
      user: { email: 'alice@t.com' },
    }), res);
    // Should still respond successfully
    expect(res.json).toHaveBeenCalledWith(newComment);
  });

  it('returns 500 on outer DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.addComment(makeReq({ params: { claimId: 'CL50001' }, body: { body: 'Test' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimCommentsController.editComment', () => {
  let ctrl: ClaimCommentsController;
  beforeEach(() => { ctrl = new ClaimCommentsController(); });

  it('returns success on update', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.editComment(makeReq({ params: { commentId: '5' }, body: { body: 'Edited text' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.editComment(makeReq({ params: { commentId: '5' }, body: { body: 'Edit' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimCommentsController.deleteComment', () => {
  let ctrl: ClaimCommentsController;
  beforeEach(() => { ctrl = new ClaimCommentsController(); });

  it('deletes comment and returns success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.deleteComment(makeReq({ params: { commentId: '7' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.deleteComment(makeReq({ params: { commentId: '7' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// DENIAL IQ - claim-information.ts
// ==============================================================================

describe('ClaimInformation.get', () => {
  let ctrl: ClaimInformation;
  beforeEach(() => { ctrl = new ClaimInformation(); });

  it('returns 400 when claimId is missing', async () => {
    const res = makeRes();
    await ctrl.get(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with claim data', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ PatientName: 'John Doe', SubscriberName: 'Jane Doe' }] });
    const res = makeRes();
    await ctrl.get(makeReq({ query: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });

  it('returns 200 with empty data when claim not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.get(makeReq({ query: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// DENIAL IQ - claim-history.ts
// ==============================================================================

describe('ClaimHistoryController.getHistory', () => {
  let ctrl: ClaimHistoryController;
  beforeEach(() => { ctrl = new ClaimHistoryController(); });

  it('returns 400 when claimId is missing', async () => {
    const res = makeRes();
    await ctrl.getHistory(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with unified timeline including status, notes, steps', async () => {
    // history rows
    mockQuery.mockResolvedValueOnce({ recordset: [
      { ClaimHistoryId: 'CH1', ClaimID: 'CL50001', ClaimStatus: 'Assigned', AssignedTo: 1, AssignedToName: 'Alice B', AssignedToRole: 'Specialist', ClaimWorkStartedTime: new Date(), ClaimWorkEndedTime: null, ClaimBalanceDue: 100, CarcCode: 'CO45', Progress: 50, ClaimModifiedDate: new Date() },
      { ClaimHistoryId: 'CH2', ClaimID: 'CL50001', ClaimStatus: 'Closed', AssignedTo: 1, AssignedToName: 'Alice B', AssignedToRole: 'Specialist', ClaimWorkStartedTime: new Date(), ClaimWorkEndedTime: new Date(), ClaimBalanceDue: 0, CarcCode: null, Progress: 100, ClaimModifiedDate: new Date() },
    ]});
    // notes
    mockQuery.mockResolvedValueOnce({ recordset: [
      { id: 1, claim_id: 'CL50001', step_id: null, author_user_id: 'alice@t.com', note_text: 'Escalated', note_type: 'escalation', created_at: new Date() },
    ]});
    // steps
    mockQuery.mockResolvedValueOnce({ recordset: [
      { id: 1, claim_id: 'CL50001', step_id: 2, completed_by: 'alice@t.com', completed_at: new Date(), step_title: 'Verify Benefits' },
    ]});
    const res = makeRes();
    await ctrl.getHistory(makeReq({ query: { claimId: 'CL50001' } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Claim history' }));
    const { data } = res.json.mock.calls[0][0];
    // 2 status + 1 note + 1 step = 4 items
    expect(data).toHaveLength(4);
  });

  it('builds timeline with ClaimModifiedDate when ClaimWorkStartedTime is null', async () => {
    const modDate = new Date('2026-01-01');
    mockQuery.mockResolvedValueOnce({ recordset: [
      { ClaimHistoryId: 'CH1', ClaimStatus: 'Pending', AssignedTo: null, AssignedToName: null, AssignedToRole: null, ClaimWorkStartedTime: null, ClaimWorkEndedTime: null, ClaimBalanceDue: 0, CarcCode: null, Progress: 0, ClaimModifiedDate: modDate },
    ]});
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // notes
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // steps
    const res = makeRes();
    await ctrl.getHistory(makeReq({ query: { claimId: 'CL50001' } }), res);
    const { data } = res.json.mock.calls[0][0];
    expect(data[0].date).toBe(modDate);
    expect(data[0].performedBy).toBe('System');
  });

  it('uses "Unknown" for note author_user_id null', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [
      { id: 2, claim_id: 'CL50001', step_id: null, author_user_id: null, note_text: 'Note', note_type: 'note', created_at: new Date() },
    ]});
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.getHistory(makeReq({ query: { claimId: 'CL50001' } }), res);
    const { data } = res.json.mock.calls[0][0];
    expect(data[0].performedBy).toBe('Unknown');
  });

  it('uses "Unknown" for step completed_by null and step_title fallback', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [
      { id: 3, claim_id: 'CL50001', step_id: null, completed_by: null, completed_at: new Date(), step_title: null },
    ]});
    const res = makeRes();
    await ctrl.getHistory(makeReq({ query: { claimId: 'CL50001' } }), res);
    const { data } = res.json.mock.calls[0][0];
    expect(data[0].performedBy).toBe('Unknown');
    expect(data[0].action).toContain('Unknown');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.getHistory(makeReq({ query: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ==============================================================================
// DENIAL IQ - documents.ts
// ==============================================================================

describe('ClaimDocumentsController.list', () => {
  let ctrl: ClaimDocumentsController;
  beforeEach(() => { ctrl = new ClaimDocumentsController(); });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.list(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with document list', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, file_name: 'eob.pdf' }] });
    const res = makeRes();
    await ctrl.list(makeReq({ query: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });

  it('returns empty array when no documents found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.list(makeReq({ query: { claimId: 'CL50001' } }), res);
    expect(res.json.mock.calls[0][0].data).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.list(makeReq({ query: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimDocumentsController.upload', () => {
  let ctrl: ClaimDocumentsController;
  beforeEach(() => { ctrl = new ClaimDocumentsController(); });

  const mockFile = { originalname: 'eob.pdf', mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('') };

  it('returns 400 when no file uploaded', async () => {
    const res = makeRes();
    await ctrl.upload(makeReq({ body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('No file uploaded');
  });

  it('returns 400 when claimId missing', async () => {
    const res = makeRes();
    await ctrl.upload(makeReq({ file: mockFile, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('claimId is required');
  });

  it('returns 201 with inserted document row', async () => {
    const insertedDoc = { id: 5, claim_id: 'CL50001', file_name: 'eob.pdf' };
    mockQuery.mockResolvedValueOnce({ recordset: [insertedDoc] });
    const res = makeRes();
    await ctrl.upload(makeReq({ file: mockFile, body: { claimId: 'CL50001', docType: 'eob' }, headers: { 'x-actor-email': 'user@t.com' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data).toEqual(insertedDoc);
  });

  it('defaults docType to "other" when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 6 }] });
    const res = makeRes();
    await ctrl.upload(makeReq({ file: mockFile, body: { claimId: 'CL50001' } }), res);
    expect(mockInput).toHaveBeenCalledWith('docType', 'other');
  });

  it('defaults uploadedBy to "unknown" when header absent', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 7 }] });
    const res = makeRes();
    await ctrl.upload(makeReq({ file: mockFile, body: { claimId: 'CL50001' } }), res);
    expect(mockInput).toHaveBeenCalledWith('uploadedBy', 'unknown');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.upload(makeReq({ file: mockFile, body: { claimId: 'CL50001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimDocumentsController.download', () => {
  let ctrl: ClaimDocumentsController;
  beforeEach(() => { ctrl = new ClaimDocumentsController(); });

  it('returns 400 when id is not a number', async () => {
    const res = makeRes();
    await ctrl.download(makeReq({ params: { id: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when document not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.download(makeReq({ params: { id: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('streams document on success', async () => {
    const fileBuffer = Buffer.from('PDF content');
    mockQuery.mockResolvedValueOnce({ recordset: [{ file_name: 'eob.pdf', content_type: 'application/pdf', file_data: fileBuffer }] });
    const res = makeRes();
    await ctrl.download(makeReq({ params: { id: '1' } }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="eob.pdf"');
    expect(res.send).toHaveBeenCalledWith(fileBuffer);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.download(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimDocumentsController.remove', () => {
  let ctrl: ClaimDocumentsController;
  beforeEach(() => { ctrl = new ClaimDocumentsController(); });

  it('returns 400 when id is not a number', async () => {
    const res = makeRes();
    await ctrl.remove(makeReq({ params: { id: 'xyz' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 on successful delete', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
    const res = makeRes();
    await ctrl.remove(makeReq({ params: { id: '3' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].message).toBe('Document deleted');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.remove(makeReq({ params: { id: '3' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
