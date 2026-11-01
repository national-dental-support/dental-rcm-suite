/**
 * coverage-denial-claim-actions-v2.test.ts
 *
 * Targets the EXACT remaining uncovered branches (per current lcov.info) in:
 *
 *   1. src/controllers/denial-iq/claim-detail/claim-actions.ts
 *      - Line 197  branch 38 out0: closeAdjudicated - scope.userId == null -> 401
 *      - Line 254  branch 44 out0: unassign         - scope.userId == null -> 401
 *      - Line 296  branch 48 out0: writeOff          - scope.userId == null -> 401
 *
 *   2. src/controllers/denial-iq/claim-detail/bulk-actions.ts
 *      - Line 41   branch 2  out1: bulkAssign  - scope.userId == null -> 401
 *      - Line 75   branch 7  out1: bulkAssign  - assigned === 0 (no broadcast)
 *      - Line 99   branch 12 out1: bulkEscalate - scope.userId == null -> 401
 *      - Line 158  branch 22 out1: bulkEscalate - escalated === 0 (no broadcast)
 *      - Line 182  branch 27 out1: bulkClose   - scope.userId == null -> 401
 *      - Line 199  branch 31 out1: bulkClose   - closed === 0 (no broadcast)
 *      - Line 223  branch 36 out1: bulkReassign - reassigned === 0 (no broadcast)
 *      - Line 259  branch 38 out1: bulkReassign - reassigned === 0 (redundant guard, same zero path)
 *
 *   3. src/controllers/denial-iq/auto-assignment.ts
 *      - Line 47  branch 2  out0: req.body undefined -> limit defaults to 50
 *      - Line 145 branch 12 out0: claimMatchesCriteria - unknown field not in fieldMap (|| right side)
 *      - Line 145 branch 13 out1 + Line 146 branch 14/15 out0/1 + Line 147 branch 16 out1:
 *                claimMatchesCriteria - various ?? / || / !claimValue branch permutations
 *      - Line 243 branch 26 out1: claimMatchesCriteria 'in' operator - value NOT in list (returns false)
 *      - Line 280 branch 33 out0: findSkillMatchedSpecialist - specialist in index but wrong skill_type
 */

// -----------------------------------------------------------------------------
//  Shared mock state - declared BEFORE any jest.mock() calls
// -----------------------------------------------------------------------------

const mockQuery = jest.fn();
const mockRequestInstance: any = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
};

// Mock modules/db so DatabaseConnectionController gets a mock pool
jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => ({ request: () => mockRequestInstance }),
    }),
  },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/resolve-user-scope', () => ({
  resolveUserScope: jest.fn().mockResolvedValue({
    customerId: 1, userId: 10, role: 'Specialist', isAdmin: false,
    locations: [], providers: [],
  }),
  extractCustomerId: jest.fn().mockReturnValue(null),
  buildScopeFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildTeamFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildCustomerFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
}));

jest.mock('../websockets/index', () => ({
  broadcast: jest.fn(),
  pushNotification: jest.fn(),
  initWebSockets: jest.fn(),
  getIO: jest.fn(),
}));

jest.mock('../utils/claim-events', () => ({
  recordClaimEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  const fWithMax = Object.assign(f, { MAX: f() });
  return {
    __esModule: true,
    default: {
      NVarChar: fWithMax,
      Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(),
      Date: f(), Float: f(), VarChar: f, SmallInt: f(), UniqueIdentifier: f(),
      MAX: f(),
    },
    NVarChar: fWithMax,
    Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(),
    Date: f(), Float: f(), VarChar: f, SmallInt: f(), UniqueIdentifier: f(),
    MAX: f(),
    Request: jest.fn().mockImplementation(() => mockRequestInstance),
  };
});

jest.mock('../databaseManager', () => ({
  dbConfig: { server: 'test', database: 'test', user: 'sa', password: 'pw' },
}));

// -----------------------------------------------------------------------------
//  Helpers
// -----------------------------------------------------------------------------

const mockReq = (body: any = {}, headers: any = {}, query: any = {}, params: any = {}) =>
  ({ body, headers, query, params } as any);

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json   = jest.fn().mockReturnValue(r);
  return r;
};

const { resolveUserScope } = require('../utils/resolve-user-scope') as any;

beforeEach(() => {
  mockQuery.mockReset();
  resolveUserScope.mockResolvedValue({
    customerId: 1, userId: 10, role: 'Specialist', isAdmin: false,
    locations: [], providers: [],
  });
});

// =============================================================================
//  1. ClaimActionsController - scope.userId == null branches
// =============================================================================

describe('ClaimActionsController \u2014 scope.userId == null \u2192 401', () => {
  let ClaimActionsController: any;

  beforeAll(() => {
    ({ ClaimActionsController } = require('../controllers/denial-iq/claim-detail/claim-actions'));
  });

  // Line 197 branch 38 out0
  it('closeAdjudicated returns 401 when scope.userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ userId: null, customerId: 1 });
    const res = mockRes();
    await new ClaimActionsController().closeAdjudicated(
      mockReq({ claimId: 'CL5001' }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('user') }));
  });

  // Line 254 branch 44 out0
  it('unassign returns 401 when scope.userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ userId: null, customerId: 1 });
    const res = mockRes();
    await new ClaimActionsController().unassign(
      mockReq({ claimId: 'CL5001' }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('user') }));
  });

  // Line 296 branch 48 out0
  it('writeOff returns 401 when scope.userId is null', async () => {
    resolveUserScope.mockResolvedValueOnce({ userId: null, customerId: 1 });
    const res = mockRes();
    await new ClaimActionsController().writeOff(
      mockReq({ claimId: 'CL5001' }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('user') }));
  });
});

// =============================================================================
//  2. BulkActionsController - remaining uncovered branches
// =============================================================================

describe('BulkActionsController \u2014 remaining uncovered branches', () => {
  let BulkActionsController: any;
  const { broadcast } = require('../websockets/index') as any;

  beforeAll(() => {
    ({ BulkActionsController } = require('../controllers/denial-iq/claim-detail/bulk-actions'));
  });

  beforeEach(() => {
    (broadcast as jest.Mock).mockClear();
  });

  // -- bulkAssign -------------------------------------------------------------

  // Line 41 branch 2 out1 - scope.userId == null -> 401
  it('bulkAssign returns 401 when scope.userId is null (branch 2 out1)', async () => {
    resolveUserScope.mockResolvedValueOnce({ userId: null, customerId: 1 });
    const res = mockRes();
    await new BulkActionsController().bulkAssign(
      mockReq({ claimIds: ['CL5001'] }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(broadcast).not.toHaveBeenCalled();
  });

  // Line 75 branch 7 out1 - assigned === 0, no broadcast
  it('bulkAssign does not broadcast when 0 rows inserted (branch 7 out1)', async () => {
    // Query order: 1) closeReq UPDATE, 2) getNextHistoryNum SELECT, 3) INSERT
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [0] })       // closeReq UPDATE existing open rows
      .mockResolvedValueOnce({ recordset: [{ n: 10 }] })  // getNextHistoryNum
      .mockResolvedValueOnce({ rowsAffected: [0] });       // INSERT -> 0 rows
    const res = mockRes();
    await new BulkActionsController().bulkAssign(
      mockReq({ claimIds: ['CL5001'] }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }));
    expect(broadcast).not.toHaveBeenCalled();
  });

  // -- bulkEscalate ----------------------------------------------------------

  // Line 99 branch 12 out1 - scope.userId == null -> 401
  it('bulkEscalate returns 401 when scope.userId is null (branch 12 out1)', async () => {
    resolveUserScope.mockResolvedValueOnce({ userId: null, customerId: 1 });
    const res = mockRes();
    await new BulkActionsController().bulkEscalate(
      mockReq({ claimIds: ['CL5001'] }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(broadcast).not.toHaveBeenCalled();
  });

  // Line 158 branch 22 out1 - escalated === 0, no broadcast
  it('bulkEscalate does not broadcast when 0 rows escalated (branch 22 out1)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 5 }] }) // manager query
      .mockResolvedValueOnce({ rowsAffected: [0] })           // closeReq UPDATE
      .mockResolvedValueOnce({ recordset: [] })               // getNextHistoryNum -> n=0
      .mockResolvedValueOnce({ rowsAffected: [0] })           // insReq INSERT
      .mockResolvedValueOnce({ rowsAffected: [0] });          // noteReq INSERT
    const res = mockRes();
    await new BulkActionsController().bulkEscalate(
      mockReq({ claimIds: ['CL5001'] }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }));
    expect(broadcast).not.toHaveBeenCalled();
  });

  // -- bulkClose -------------------------------------------------------------

  // Line 182 branch 27 out1 - scope.userId == null -> 401
  it('bulkClose returns 401 when scope.userId is null (branch 27 out1)', async () => {
    resolveUserScope.mockResolvedValueOnce({ userId: null, customerId: 1 });
    const res = mockRes();
    await new BulkActionsController().bulkClose(
      mockReq({ claimIds: ['CL5001'] }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(broadcast).not.toHaveBeenCalled();
  });

  // Line 199 branch 31 out1 - closed === 0, no broadcast
  it('bulkClose does not broadcast when 0 rows closed (branch 31 out1)', async () => {
    mockQuery.mockResolvedValueOnce({ rowsAffected: [0] }); // UPDATE -> 0 rows
    const res = mockRes();
    await new BulkActionsController().bulkClose(
      mockReq({ claimIds: ['CL5001'] }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    // bulkClose returns { closed, skipped } not { count }
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ closed: 0 }));
    expect(broadcast).not.toHaveBeenCalled();
  });

  // -- bulkReassign ----------------------------------------------------------

  // Line 223 branch 36 out1 + Line 259 branch 38 out1 - reassigned === 0, no broadcast
  it('bulkReassign does not broadcast when 0 rows reassigned (branches 36/38 out1)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [0] })       // closeReq UPDATE
      .mockResolvedValueOnce({ recordset: [{ n: 50 }] })  // getNextHistoryNum
      .mockResolvedValueOnce({ rowsAffected: [0] });       // INSERT -> 0 rows
    const res = mockRes();
    await new BulkActionsController().bulkReassign(
      mockReq({ claimIds: ['CL5001'], toUserId: 7 }, { 'x-actor-email': 'a@b.com' }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0, toUserId: 7 }));
    expect(broadcast).not.toHaveBeenCalled();
  });
});

// =============================================================================
//  3. AutoAssignmentController - remaining uncovered branches
// =============================================================================

describe('AutoAssignmentController \u2014 remaining uncovered branches', () => {
  let AutoAssignmentController: any;

  beforeAll(() => {
    ({ AutoAssignmentController } = require('../controllers/denial-iq/auto-assignment'));
  });

  /**
   * Line 47 branch 2 out0:
   * `const limit = Math.min(req.body?.limit ?? 50, 200)`
   * When req.body is undefined (undefined?.limit === undefined -> ?? 50).
   * The existing tests pass body={} (limit undefined) or body={limit:500}.
   * Passing req with body=undefined exercises the optional-chain false branch.
   */
  it('uses default limit 50 when req.body is undefined (branch 2 out0)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }); // specialists empty -> 422
    const res = mockRes();
    // Pass a request whose body is explicitly undefined
    const req = { body: undefined, headers: {}, query: {}, params: {} } as any;
    await new AutoAssignmentController().run(req, res);
    // No specialists -> 422, but the limit computation branch is exercised
    expect(res.status).toHaveBeenCalledWith(422);
  });

  /**
   * Line 145 branch 12 out0:
   * `const claimField = fieldMap[criteria.field] || criteria.field`
   * When criteria.field is NOT in fieldMap (e.g., 'custom_field'), fieldMap lookup
   * returns undefined (falsy), so the || right-hand side (`criteria.field`) is used.
   * All existing tests use known fields ('reason_code', 'payer', 'payer_id').
   * Here we use field: 'charge_amount' which is not in fieldMap.
   */
  it('claimMatchesCriteria uses criteria.field directly when not in fieldMap (branch 12 out0 \u2014 unknown field)', async () => {
    const rule = {
      id: 1,
      rule_name: 'CustomField',
      priority: 1,
      match_criteria: JSON.stringify({ field: 'charge_amount', operator: 'equals', values: ['500'] }),
      assign_strategy: 'least_loaded',
      assign_target: null,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 1, FirstName: 'Alice', LastName: 'A' }] }) // specialists
      .mockResolvedValueOnce({ recordset: [] })         // queueMap
      .mockResolvedValueOnce({ recordset: [rule] })     // rules
      .mockResolvedValueOnce({ recordset: [] })         // skills
      // claim has charge_amount=500 - fieldMap has no 'charge_amount', so claimField stays 'charge_amount'
      // claim[claimField] = claim['charge_amount'] = '500'
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5001', DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 500, PayerID: 1, ReasonCode: null, InsuranceName: null, charge_amount: '500' }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH50' }] }) // maxId
      .mockResolvedValueOnce({ rowsAffected: [1] });    // INSERT
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq(), res);
    // Rule matched -> least_loaded strategy applied
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    const call = res.json.mock.calls[0][0];
    expect(call.assignments[0].strategy).toContain('least_loaded');
  });

  /**
   * Line 145 branch 13 out1 + Line 146 branch 14 out0 + Line 146 branch 15 out1 + Line 147 branch 16 out1:
   * These additional branches in claimMatchesCriteria cover:
   *   - fieldMap lookup IS falsy (unknown field)
   *   - claim[claimField] being null -> ?? '' -> ''
   *   - !claimValue === true -> return false
   *
   * When criteria.field is unknown AND the claim value for that field is null/undefined,
   * claimValue becomes '' and the function returns false early.
   */
  it('claimMatchesCriteria returns false when unknown field AND claim value is null/undefined (lines 145-147 branches)', async () => {
    const rule = {
      id: 1,
      rule_name: 'NullCustomField',
      priority: 1,
      match_criteria: JSON.stringify({ field: 'nonexistent_field', operator: 'in', values: ['foo'] }),
      assign_strategy: 'least_loaded',
      assign_target: null,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 2, FirstName: 'Bob', LastName: 'B' }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [rule] })
      .mockResolvedValueOnce({ recordset: [] })
      // claim['nonexistent_field'] is undefined -> ?? '' -> '' -> !claimValue -> return false -> rule skipped
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5002', DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 100, PayerID: 1, ReasonCode: null, InsuranceName: null }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH51' }] })
      .mockResolvedValueOnce({ rowsAffected: [1] });
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq(), res);
    // Rule not matched -> fallback
    const call = res.json.mock.calls[0][0];
    expect(call.assignments[0].strategy).toBe('fallback_least_loaded');
  });

  /**
   * Line 243 branch 26 out1:
   * `return values.includes(claimValue)` returning FALSE
   * Operator is 'in', claim value IS present but NOT in the values list.
   * e.g., ReasonCode = 'CO-99', values = ['CO-4'] -> includes returns false -> rule not matched.
   */
  it('claimMatchesCriteria "in" operator returns false when claimValue not in values list (branch 26 out1)', async () => {
    const rule = {
      id: 1,
      rule_name: 'InMiss',
      priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO-4'] }),
      assign_strategy: 'least_loaded',
      assign_target: null,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 3, FirstName: 'Carol', LastName: 'C' }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [rule] })
      .mockResolvedValueOnce({ recordset: [] })
      // ReasonCode = 'CO-99' is NOT in ['CO-4'] -> includes returns false -> rule not matched -> fallback
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5003', DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 200, PayerID: 2, ReasonCode: 'CO-99', InsuranceName: null }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH52' }] })
      .mockResolvedValueOnce({ rowsAffected: [1] });
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq(), res);
    const call = res.json.mock.calls[0][0];
    expect(call.assignments[0].strategy).toBe('fallback_least_loaded');
  });

  /**
   * Line 280 branch 33 out0:
   * `if (!typeSkills) return false` in findSkillMatchedSpecialist - the FALSE branch
   * (typeSkills IS defined, so we don't return false here).
   *
   * This happens when the specialist IS in skillIndex AND has the skill_type key in their
   * skill map, but none of their skill values overlap with requiredValues.
   * In that case we fall through the loop returning false from the filter.
   *
   * Setup: skill_match rule with reason_code 'CO-97'; specialist has skill_type 'reason_code'
   * with skill_value 'CO-4' (not 'CO-97') -> typeSkills is defined (not null), but no match.
   */
  it('findSkillMatchedSpecialist: specialist has skill_type but wrong skill_value \u2192 no match (branch 33 out0)', async () => {
    const rule = {
      id: 1,
      rule_name: 'SkillNoMatch',
      priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO-97'] }),
      assign_strategy: 'skill_match',
      assign_target: null,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 4, FirstName: 'Dave', LastName: 'D' }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [rule] })
      // Specialist has skill_type 'reason_code' but skill_value 'CO-4' (not 'CO-97')
      // -> skillIndex.get(4) exists, skillIndex.get(4).get('reason_code') exists (Set{'co-4'})
      // -> typeSkills is NOT null (branch 33 out0 - the false path of !typeSkills)
      // -> loop: 'co-97'.has -> false -> filter returns false -> qualified=[] -> returns null
      // -> skill_match returns null -> no skill match -> falls through to next rule -> fallback
      .mockResolvedValueOnce({ recordset: [{ user_id: 4, skill_type: 'reason_code', skill_value: 'CO-4', proficiency: 3 }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5004', DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 150, PayerID: 3, ReasonCode: 'CO-97', InsuranceName: null }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH53' }] })
      .mockResolvedValueOnce({ rowsAffected: [1] });
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq(), res);
    // skill_match finds no qualified specialist -> falls through -> fallback_least_loaded
    const call = res.json.mock.calls[0][0];
    expect(call.assignments[0].strategy).toBe('fallback_least_loaded');
  });

  /**
   * Additional coverage: findSkillMatchedSpecialist - specialist in skillIndex
   * but skill_type NOT present (typeSkills === undefined -> !typeSkills -> return false).
   * This covers the TRUE branch of !typeSkills (line 280 branch 33 out1 - already tracked).
   * We include it here for completeness to pair with the out0 test above.
   */
  it('findSkillMatchedSpecialist: specialist in index but missing skill_type \u2192 no match', async () => {
    const rule = {
      id: 1,
      rule_name: 'SkillTypeMissing',
      priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['CO-97'] }),
      assign_strategy: 'skill_match',
      assign_target: null,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 5, FirstName: 'Eve', LastName: 'E' }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [rule] })
      // Specialist has skill_type 'payer' (NOT 'reason_code') -> typeSkills for 'reason_code' is undefined
      .mockResolvedValueOnce({ recordset: [{ user_id: 5, skill_type: 'payer', skill_value: 'Medicare', proficiency: 4 }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5005', DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 300, PayerID: 1, ReasonCode: 'CO-97', InsuranceName: null }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH54' }] })
      .mockResolvedValueOnce({ rowsAffected: [1] });
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq(), res);
    const call = res.json.mock.calls[0][0];
    expect(call.assignments[0].strategy).toBe('fallback_least_loaded');
  });

  /**
   * Additional: skill index already has user_id AND skill_type entries
   * (lines 97-100 - the "already has" fast paths):
   *   if (!skillIndex.has(sk.user_id)) -> FALSE (already present)
   *   if (!userSkills.has(sk.skill_type)) -> FALSE (already present)
   * This fires when a specialist has 2+ skills of the SAME type.
   */
  it('skill index fast-path: adds second skill_value under same user_id and skill_type (already-has branches)', async () => {
    const rule = {
      id: 1,
      rule_name: 'MultiSkill',
      priority: 1,
      match_criteria: JSON.stringify({ field: 'reason_code', operator: 'in', values: ['co-4'] }),
      assign_strategy: 'skill_match',
      assign_target: null,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ userID: 6, FirstName: 'Frank', LastName: 'F' }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [rule] })
      // Two skills with same user_id and skill_type -> second row exercises "already has" fast paths
      .mockResolvedValueOnce({ recordset: [
        { user_id: 6, skill_type: 'reason_code', skill_value: 'CO-97', proficiency: 5 },
        { user_id: 6, skill_type: 'reason_code', skill_value: 'CO-4',  proficiency: 3 },
      ]})
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL5006', DateOfService: null, ClaimSubmittedDate: null, ChargeAmt: 100, PayerID: 1, ReasonCode: 'CO-4', InsuranceName: null }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH55' }] })
      .mockResolvedValueOnce({ rowsAffected: [1] });
    const res = mockRes();
    await new AutoAssignmentController().run(mockReq(), res);
    const call = res.json.mock.calls[0][0];
    // Frank has CO-4 skill -> matched -> skill_match strategy
    expect(call.assignments[0].strategy).toContain('skill_match');
  });
});
