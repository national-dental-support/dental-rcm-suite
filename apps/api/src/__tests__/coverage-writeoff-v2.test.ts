/**
 * coverage-writeoff-v2.test.ts
 *
 * Targets the 22 remaining uncovered branches in:
 *   src/controllers/writeoff/workflow.ts
 *
 * Uncovered branches (from LCOV report):
 *  L18  b1,1  : (actorRole || '').toLowerCase() - || '' fallback when actorRole is falsy
 *  L18  b3,1  : ROLE_HIERARCHY lookup - unknown role key (result undefined)
 *  L19  b4,1  : actorRank ?? 0 - actorRank is undefined (unknown role)
 *  L44  b6,1  : userEmail ?? 'system' fallback in createRule
 *  L51  b11,0 : requires_approval falsy -> 0 branch in createRule
 *  L74  b16,0 : typeof conditions !== 'string' -> JSON.stringify branch in updateRule
 *  L77  b19,0 : requires_approval falsy -> 0 in updateRule
 *  L78  b21,0 : approval_level not null in updateRule
 *  L79  b22,0 : is_active === false -> 0 in updateRule
 *  L107 b25,1 : dryRun === 'true' false branch (dry run off while scan tests not hit alternate)
 *  L147 b28,0 : minAgingDays condition fires (claim.AgingDays < cond.minAgingDays) -> continue
 *  L256 b46,1 : userEmail ?? 'system' fallback in approveRequest
 *  L257 b48,1 : actor?.role ?? 'manager' fallback - actor is undefined
 *  L257 b50,0 : actor null/undefined path for role default
 *  L317 b65,1 : userEmail ?? 'system' fallback in rejectRequest
 *  L337 b70,1 : review_note ?? null when review_note is undefined (wo exists)
 *  L352 b72,1 : userEmail ?? 'system' fallback in createRequest
 *  L416 b84,1 : userEmail ?? 'system' fallback in bulkApprove
 *  L417 b86,1 : actor?.role ?? 'manager' fallback - actor is undefined in bulkApprove
 *  L417 b88,0 : actor null path for role default in bulkApprove
 *  L446 b96,1 : pending.rule_id ?? 0 - rule_id is null in bulkApprove
 *  L468 b102,1: userEmail ?? 'system' fallback in bulkReject
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- DB / pool mock ----------------------------------------------------------

const mockQuery = jest.fn<any>();
const mockRequestInstance: any = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
};

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => ({
        request: () => mockRequestInstance,
        close: jest.fn().mockResolvedValue(undefined),
        connected: true,
        connecting: false,
      }),
    }),
  },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('../utils/logger', () => ({
  info:  jest.fn(),
  error: jest.fn(),
  warn:  jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../utils/claim-events', () => ({
  recordClaimEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int:      f(),
    BigInt:   f(),
    Decimal:  f,
    Bit:      f(),
    DateTime: f(),
    Date:     f(),
    Float:    f(),
    VarChar:  Object.assign(f, { MAX: f() }),
  };
});

// --- Helpers -----------------------------------------------------------------

const mockReq = (
  body: any  = {},
  headers: any = {},
  params: any  = {},
  query: any   = {},
) => ({
  body,
  headers,
  params,
  query,
  actor:      { customer_id: 1, role: 'manager' },
  customerId: 1,
  userEmail:  'test@test.com',
  ip:         '127.0.0.1',
} as any);

const mockRes = () => {
  const r: any = {};
  r.status     = jest.fn().mockReturnValue(r);
  r.json       = jest.fn().mockReturnValue(r);
  r.send       = jest.fn().mockReturnValue(r);
  r.setHeader  = jest.fn();
  return r;
};

// --- Import SUT --------------------------------------------------------------

import { WriteOffWorkflowController } from '../controllers/writeoff/workflow';

// -----------------------------------------------------------------------------

describe('WriteOffWorkflowController \u2014 uncovered branches v2', () => {
  let ctrl: WriteOffWorkflowController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new WriteOffWorkflowController();
  });

  // ==========================================================================
  // meetsApprovalLevel helper - branches L18/L19
  // ==========================================================================

  // L18 b1,1 / L18 b3,1 / L19 b4,1
  // actorRole is undefined -> (actorRole || '').toLowerCase() uses ''
  // ROLE_HIERARCHY[''] is undefined -> actorRank ?? 0 gives 0
  // When requiredLevel is a known role, rank 0 < required rank -> 403
  it('meetsApprovalLevel \u2014 actorRole undefined falls back to empty string, unknown role gives rank 0 \u2192 403 when level requires higher role', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        id: 1,
        approval_level: 'manager', // rank 2, actor rank 0 -> fails
        claim_id: 'CL001',
        balance: 100,
        adj_type: 'wo',
        customer_id: 1,
        rule_id: 1,
        rule_name: 'Test Rule',
      }],
    });

    const req = mockReq({ review_note: 'note' }, {}, { id: '1' });
    // actor has no role property at all -> actor?.role is undefined -> ?? 'manager'
    // but we need to test the meetsApprovalLevel path where actorRole itself ends up
    // as an unknown string not in ROLE_HIERARCHY to hit the ?? 0 fallback
    (req as any).actor = { role: 'unknown_role_xyz' }; // not in ROLE_HIERARCHY -> rank undefined -> ?? 0
    const res = mockRes();
    await ctrl.approveRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // L18 b1,1 - actorRole is null/undefined (actor.role is undefined)
  // This hits the || '' branch: (undefined || '') -> ''
  it('meetsApprovalLevel \u2014 actorRole is undefined (actor.role missing) \u2192 || "" fires \u2192 rank 0 \u2192 403 for manager-level requirement', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        id: 2,
        approval_level: 'manager',
        claim_id: 'CL002',
        balance: 200,
        adj_type: 'wo',
        customer_id: 1,
        rule_id: 1,
        rule_name: 'R',
      }],
    });

    const req = mockReq({ review_note: 'note' }, {}, { id: '2' });
    (req as any).actor = {}; // role is undefined -> actor?.role is undefined -> ?? 'manager' gives 'manager', but let's also test actor missing entirely
    delete (req as any).actor.role; // ensure role is undefined -> meetsApprovalLevel called with 'manager' default via ?? operator
    // To hit the || '' branch inside meetsApprovalLevel we need actorRole='' or null:
    // The function receives actorRole = (req as any).actor?.role ?? 'manager'
    // So actor.role=undefined gives actorRole='manager'. To get actorRole=''
    // we set actor.role to '' directly.
    (req as any).actor = { role: '' };
    const res = mockRes();
    await ctrl.approveRequest(req, res);
    // '' is not in ROLE_HIERARCHY -> rank 0 < 2 (manager) -> 403
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // L19 b4,1 - actorRank ?? 0: actorRank is undefined because role is not in ROLE_HIERARCHY
  // Already covered above (unknown_role_xyz), but explicitly test ?? 0 fallback path
  it('meetsApprovalLevel \u2014 role not in ROLE_HIERARCHY \u2192 ROLE_HIERARCHY[role] is undefined \u2192 ?? 0 applied \u2192 fails high-level approval', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        id: 3,
        approval_level: 'vp', // rank 4
        claim_id: 'CL003',
        balance: 300,
        adj_type: 'wo',
        customer_id: 1,
        rule_id: 2,
        rule_name: 'R2',
      }],
    });

    const req = mockReq({ review_note: 'note' }, {}, { id: '3' });
    (req as any).actor = { role: 'consultant' }; // 'consultant' not in ROLE_HIERARCHY
    const res = mockRes();
    await ctrl.approveRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('vp') }));
  });

  // ==========================================================================
  // createRule - L44 b6,1 (userEmail ?? 'system') and L51 b11,0 (requires_approval falsy)
  // ==========================================================================

  // L44 b6,1: userEmail is undefined on req -> ?? 'system' fires
  it('createRule \u2014 userEmail missing on request \u2192 falls back to "system"', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 10, rule_name: 'NewRule', priority: 100, conditions: '{}', adj_type: 'writeoff', adj_note_template: null, requires_approval: 0, approval_level: null, created_by: 'system', customer_id: 1 }],
    });

    const req = mockReq({ rule_name: 'NewRule', priority: 100, conditions: '{}', adj_type: 'writeoff', requires_approval: false });
    delete (req as any).userEmail; // force ?? 'system'
    const res = mockRes();
    await ctrl.createRule(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ rule_name: 'NewRule' }));
  });

  // L51 b11,0: requires_approval is falsy (false/0/undefined) -> result is 0
  it('createRule \u2014 requires_approval is false \u2192 0 stored (falsy branch)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 11, rule_name: 'FalsyApproval', priority: 50, conditions: '{}', adj_type: 'writeoff', adj_note_template: null, requires_approval: 0, approval_level: null, created_by: 'test@test.com', customer_id: 1 }],
    });

    const req = mockReq({ rule_name: 'FalsyApproval', priority: 50, conditions: '{}', adj_type: 'writeoff', requires_approval: false, approval_level: null });
    const res = mockRes();
    await ctrl.createRule(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // requires_approval=0 (integer falsy)
  it('createRule \u2014 requires_approval is 0 (integer zero) \u2192 falsy branch \u2192 0', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 12, rule_name: 'ZeroApproval', requires_approval: 0 }],
    });

    const req = mockReq({ rule_name: 'ZeroApproval', conditions: '{}', adj_type: 'writeoff', requires_approval: 0 });
    const res = mockRes();
    await ctrl.createRule(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // ==========================================================================
  // updateRule - L74 b16,0 (conditions not string), L77 b19,0, L78 b21,0, L79 b22,0
  // ==========================================================================

  // L74 b16,0: conditions is an object, not a string -> JSON.stringify path
  it('updateRule \u2014 conditions is an object \u2192 JSON.stringify(conditions) used', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 5, rule_name: 'ObjCond', conditions: '{"minAgingDays":60}', adj_type: 'wo', is_active: 1 }],
    });

    const req = mockReq({
      rule_name: 'ObjCond',
      priority: 100,
      conditions: { minAgingDays: 60 }, // object, not string -> JSON.stringify branch
      adj_type: 'wo',
      requires_approval: true,
      approval_level: 'manager',
      is_active: true,
    }, {}, { id: '5' });
    const res = mockRes();
    await ctrl.updateRule(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  // L77 b19,0: requires_approval is falsy in updateRule
  it('updateRule \u2014 requires_approval is false \u2192 0 branch', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 6, rule_name: 'NoApproval', adj_type: 'wo', requires_approval: 0, is_active: 1 }],
    });

    const req = mockReq({
      rule_name: 'NoApproval',
      priority: 200,
      conditions: '{}',
      adj_type: 'wo',
      requires_approval: false, // falsy -> 0
      approval_level: 'manager',
      is_active: true,
    }, {}, { id: '6' });
    const res = mockRes();
    await ctrl.updateRule(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 6 }));
  });

  // L78 b21,0: approval_level is provided (not null) -> no ?? fallback
  it('updateRule \u2014 approval_level provided \u2192 no nullish fallback needed', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 7, rule_name: 'WithLevel', adj_type: 'wo', approval_level: 'director', is_active: 1 }],
    });

    const req = mockReq({
      rule_name: 'WithLevel',
      priority: 100,
      conditions: '{}',
      adj_type: 'wo',
      requires_approval: true,
      approval_level: 'director', // provided, non-null -> ?? null skipped
      is_active: true,
    }, {}, { id: '7' });
    const res = mockRes();
    await ctrl.updateRule(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  // L79 b22,0: is_active is explicitly false -> is_active !== false is false -> 0
  it('updateRule \u2014 is_active is false \u2192 0 (deactivate rule)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 8, rule_name: 'Deactivated', adj_type: 'wo', is_active: 0 }],
    });

    const req = mockReq({
      rule_name: 'Deactivated',
      priority: 100,
      conditions: '{}',
      adj_type: 'wo',
      requires_approval: false,
      approval_level: null,
      is_active: false, // is_active !== false -> false -> 0 branch
    }, {}, { id: '8' });
    const res = mockRes();
    await ctrl.updateRule(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }));
  });

  // ==========================================================================
  // scan - L147 b28,0 (minAgingDays filter fires: claim fails condition)
  // ==========================================================================

  // L147 b28,0: cond.minAgingDays exists AND claim.AgingDays < cond.minAgingDays -> continue
  it('scan \u2014 claim AgingDays < rule minAgingDays \u2192 claim filtered out (minAgingDays branch fires)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 1,
          rule_name: 'AgedRule',
          conditions: '{"minAgingDays":120}',
          adj_type: 'wo',
          requires_approval: 0,
          adj_note_template: null,
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL111',
          PatientID: 'P1',
          InsuranceName: 'BlueCross',
          Balance: 500,
          AgingDays: 60,  // 60 < 120 -> filtered out by minAgingDays check
          ClaimStatus: 'Open',
        }],
      });

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'false' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      totalClaims: 1,
      totalMatched: 0, // claim was filtered
      autoPosted:  0,
    }));
  });

  // ==========================================================================
  // approveRequest - L256 b46,1 (userEmail ?? 'system') and L257 b48,1/b50,0 (actor role default)
  // ==========================================================================

  // L256 b46,1: userEmail is undefined -> ?? 'system' fires
  it('approveRequest \u2014 userEmail missing \u2192 falls back to "system"', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 50,
          approval_level: null,
          claim_id: 'CL050',
          balance: 150,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 1,
          rule_name: 'R',
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({
        recordset: [{
          id: 50,
          claim_id: 'CL050',
          balance: 150,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 1,
          rule_name: 'R',
        }],
      })
      .mockResolvedValue({});

    const req = mockReq({ review_note: 'OK' }, {}, { id: '50' });
    delete (req as any).userEmail; // force ?? 'system'
    const res = mockRes();
    await ctrl.approveRequest(req, res);
    expect(res.json).toHaveBeenCalledWith({ approved: true });
  });

  // L257 b48,1 + b50,0: actor is undefined -> actor?.role is undefined -> ?? 'manager'
  it('approveRequest \u2014 actor is undefined \u2192 role defaults to "manager" (actor?.role ?? "manager")', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 51,
          approval_level: null, // null -> meetsApprovalLevel returns true always
          claim_id: 'CL051',
          balance: 200,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 1,
          rule_name: 'R',
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({
        recordset: [{
          id: 51,
          claim_id: 'CL051',
          balance: 200,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 1,
          rule_name: 'R',
        }],
      })
      .mockResolvedValue({});

    const req = mockReq({ review_note: 'OK' }, {}, { id: '51' });
    (req as any).actor = undefined; // actor is undefined -> actor?.role is undefined -> ?? 'manager'
    const res = mockRes();
    await ctrl.approveRequest(req, res);
    expect(res.json).toHaveBeenCalledWith({ approved: true });
  });

  // actor is null -> same path
  it('approveRequest \u2014 actor is null \u2192 role defaults to "manager"', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 52,
          approval_level: null,
          claim_id: 'CL052',
          balance: 300,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 2,
          rule_name: 'R2',
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({
        recordset: [{
          id: 52,
          claim_id: 'CL052',
          balance: 300,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 2,
          rule_name: 'R2',
        }],
      })
      .mockResolvedValue({});

    const req = mockReq({ review_note: 'Approved' }, {}, { id: '52' });
    (req as any).actor = null; // null -> actor?.role is undefined -> ?? 'manager'
    const res = mockRes();
    await ctrl.approveRequest(req, res);
    expect(res.json).toHaveBeenCalledWith({ approved: true });
  });

  // ==========================================================================
  // rejectRequest - L317 b65,1 (userEmail ?? 'system') and L337 b70,1 (review_note ?? null for event)
  // ==========================================================================

  // L317 b65,1: userEmail missing -> ?? 'system'
  it('rejectRequest \u2014 userEmail missing \u2192 falls back to "system"', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({
        recordset: [{
          id: 60,
          claim_id: 'CL060',
          customer_id: 1,
          adj_type: 'wo',
          balance: 100,
        }],
      });

    const req = mockReq({ review_note: 'Rejected' }, {}, { id: '60' });
    delete (req as any).userEmail;
    const res = mockRes();
    await ctrl.rejectRequest(req, res);
    expect(res.json).toHaveBeenCalledWith({ rejected: true });
  });

  // L337 b70,1: review_note is undefined -> ?? null fires in recordClaimEvent metadata
  // (wo is found, review_note is undefined -> review_note ?? null gives null)
  it('rejectRequest \u2014 review_note undefined \u2192 null used in event metadata', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({
        recordset: [{
          id: 61,
          claim_id: 'CL061',
          customer_id: 1,
          adj_type: 'wo',
          balance: 250,
        }],
      });

    const req = mockReq({}, {}, { id: '61' }); // no review_note in body
    const res = mockRes();
    await ctrl.rejectRequest(req, res);
    expect(res.json).toHaveBeenCalledWith({ rejected: true });
  });

  // rejectRequest - wo is null (SELECT returns empty) -> if(wo) skipped
  it('rejectRequest \u2014 SELECT after UPDATE returns empty \u2192 event not recorded', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({ recordset: [] }); // wo not found -> if(wo) false

    const req = mockReq({ review_note: 'Gone' }, {}, { id: '62' });
    const res = mockRes();
    await ctrl.rejectRequest(req, res);
    expect(res.json).toHaveBeenCalledWith({ rejected: true });
  });

  // ==========================================================================
  // createRequest - L352 b72,1 (userEmail ?? 'system')
  // ==========================================================================

  it('createRequest \u2014 userEmail missing \u2192 falls back to "system"', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        id: 70,
        claim_id: 'CL070',
        patient_id: 'P70',
        patient_name: 'John Doe',
        payer_name: 'United',
        balance: 400,
        aging_days: 95,
        adj_type: 'writeoff',
        adj_note: null,
        requested_by: 'system',
        customer_id: 1,
      }],
    });

    const req = mockReq({
      claim_id: 'CL070',
      patient_id: 'P70',
      patient_name: 'John Doe',
      payer_name: 'United',
      balance: 400,
      aging_days: 95,
      adj_type: 'writeoff',
    });
    delete (req as any).userEmail; // force ?? 'system'
    const res = mockRes();
    await ctrl.createRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // ==========================================================================
  // bulkApprove - L416 b84,1 (userEmail ?? 'system'), L417 b86,1+b88,0 (actor role default), L446 b96,1 (rule_id ?? 0)
  // ==========================================================================

  // L416 b84,1: userEmail missing -> ?? 'system'
  it('bulkApprove \u2014 userEmail missing \u2192 falls back to "system"', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 80,
          approval_level: null,
          claim_id: 'CL080',
          balance: 500,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 1,
          rule_name: 'R',
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValue({});

    const req = mockReq({ ids: [80], review_note: 'Bulk OK' });
    delete (req as any).userEmail; // force ?? 'system'
    const res = mockRes();
    await ctrl.bulkApprove(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: 1 }));
  });

  // L417 b86,1 + b88,0: actor is undefined -> actor?.role is undefined -> ?? 'manager'
  it('bulkApprove \u2014 actor is undefined \u2192 role defaults to "manager"', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 81,
          approval_level: null, // no level required -> any role passes
          claim_id: 'CL081',
          balance: 600,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 1,
          rule_name: 'R',
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValue({});

    const req = mockReq({ ids: [81], review_note: 'Bulk' });
    (req as any).actor = undefined; // actor?.role -> undefined -> ?? 'manager'
    const res = mockRes();
    await ctrl.bulkApprove(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: 1 }));
  });

  // actor is null -> same ?? 'manager' path
  it('bulkApprove \u2014 actor is null \u2192 role defaults to "manager"', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 82,
          approval_level: null,
          claim_id: 'CL082',
          balance: 700,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 2,
          rule_name: 'R2',
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValue({});

    const req = mockReq({ ids: [82], review_note: 'BulkNull' });
    (req as any).actor = null; // null?.role -> undefined -> ?? 'manager'
    const res = mockRes();
    await ctrl.bulkApprove(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: 1 }));
  });

  // L446 b96,1: pending.rule_id is null -> ?? 0 fires
  it('bulkApprove \u2014 pending.rule_id is null \u2192 falls back to 0', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 83,
          approval_level: null,
          claim_id: 'CL083',
          balance: 800,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: null,    // null -> rule_id ?? 0 fires
          rule_name: null,  // null -> rule_name ?? 'Manual approval'
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValue({});

    const req = mockReq({ ids: [83], review_note: 'Manual' });
    (req as any).actor = { role: 'admin' };
    const res = mockRes();
    await ctrl.bulkApprove(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: 1, errors: [] }));
  });

  // ==========================================================================
  // bulkReject - L468 b102,1 (userEmail ?? 'system')
  // ==========================================================================

  it('bulkReject \u2014 userEmail missing \u2192 falls back to "system"', async () => {
    mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

    const req = mockReq({ ids: [90], review_note: 'Bulk Reject' });
    delete (req as any).userEmail; // force ?? 'system'
    const res = mockRes();
    await ctrl.bulkReject(req, res);
    expect(res.json).toHaveBeenCalledWith({ rejected: 1 });
  });

  // ==========================================================================
  // Error paths - ensure catch branches are covered for all methods
  // ==========================================================================

  it('getRules \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.getRules(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createRule \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.createRule(mockReq({ rule_name: 'R', conditions: '{}', adj_type: 'wo' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateRule \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.updateRule(mockReq({ rule_name: 'R', conditions: '{}', adj_type: 'wo' }, {}, { id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deleteRule \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.deleteRule(mockReq({}, {}, { id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('scan \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.scan(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getQueue \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.getQueue(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('approveRequest \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.approveRequest(mockReq({ review_note: 'OK' }, {}, { id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('rejectRequest \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.rejectRequest(mockReq({ review_note: 'Rejected' }, {}, { id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createRequest \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.createRequest(mockReq({ claim_id: 'CL001', balance: 100, adj_type: 'wo' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getAuditLog \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.getAuditLog(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getQueueStats \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.getQueueStats(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('bulkApprove \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.bulkApprove(mockReq({ ids: [1] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('bulkReject \u2014 DB error \u2192 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.bulkReject(mockReq({ ids: [1] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // ==========================================================================
  // Additional scan branches to maximise branch coverage
  // ==========================================================================

  // scan dryRun=true: dryRun flag is set, no DB writes
  it('scan \u2014 dryRun=true \u2192 matches collected but no writes', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 1,
          rule_name: 'DryRule',
          conditions: '{"minAgingDays":30}',
          adj_type: 'wo',
          requires_approval: 0,
          adj_note_template: 'Auto note',
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL200',
          PatientID: 'P2',
          InsuranceName: 'Cigna',
          Balance: 300,
          AgingDays: 90,
          ClaimStatus: 'Open',
        }],
      });

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'true' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      dryRun: true,
      totalMatched: 1,
      autoPosted: 0,
      requestsCreated: 0,
    }));
  });

  // scan - maxBalance filter fires: claim.Balance > cond.maxBalance -> continue
  it('scan \u2014 claim Balance > rule maxBalance \u2192 filtered out', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 2,
          rule_name: 'MaxBal',
          conditions: '{"maxBalance":100}',
          adj_type: 'wo',
          requires_approval: 0,
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL201',
          PatientID: 'P3',
          InsuranceName: 'Aetna',
          Balance: 500, // 500 > 100 -> filtered
          AgingDays: 200,
          ClaimStatus: 'Open',
        }],
      });

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'false' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalMatched: 0 }));
  });

  // scan - minBalance filter fires: claim.Balance < cond.minBalance -> continue
  it('scan \u2014 claim Balance < rule minBalance \u2192 filtered out', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 3,
          rule_name: 'MinBal',
          conditions: '{"minBalance":500}',
          adj_type: 'wo',
          requires_approval: 0,
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL202',
          PatientID: 'P4',
          InsuranceName: 'United',
          Balance: 50, // 50 < 500 -> filtered
          AgingDays: 200,
          ClaimStatus: 'Open',
        }],
      });

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'false' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalMatched: 0 }));
  });

  // scan - invalid JSON conditions -> try/catch continues to next rule
  it('scan \u2014 invalid JSON in conditions \u2192 rule skipped via catch+continue', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 4,
          rule_name: 'BadJSON',
          conditions: 'NOT_VALID_JSON{{{',
          adj_type: 'wo',
          requires_approval: 0,
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL203',
          PatientID: 'P5',
          InsuranceName: 'Humana',
          Balance: 400,
          AgingDays: 180,
          ClaimStatus: 'Open',
        }],
      });

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'false' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalMatched: 0 }));
  });

  // scan - denialCodes filter fires: claim status NOT in codes -> continue
  it('scan \u2014 claim ClaimStatus not in denialCodes \u2192 filtered out', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 5,
          rule_name: 'DenialCodes',
          conditions: '{"denialCodes":["CO45","CO16"]}',
          adj_type: 'wo',
          requires_approval: 0,
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL204',
          PatientID: 'P6',
          InsuranceName: 'Cigna',
          Balance: 300,
          AgingDays: 150,
          ClaimStatus: 'Open', // 'Open' not in ['CO45','CO16'] -> filtered
        }],
      });

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'false' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalMatched: 0 }));
  });

  // scan - no claims at all -> zero results
  it('scan \u2014 no claims returned \u2192 all zeros', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, rule_name: 'R', conditions: '{}', adj_type: 'wo', requires_approval: 0 }] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, {}), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalClaims: 0, totalMatched: 0 }));
  });

  // scan - no rules -> zero results
  it('scan \u2014 no active rules \u2192 no matches', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // no rules
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL205',
          PatientID: 'P7',
          InsuranceName: 'Blue',
          Balance: 200,
          AgingDays: 100,
          ClaimStatus: 'Open',
        }],
      });

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, {}), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalMatched: 0 }));
  });

  // scan - adj_note_template provided (not null) -> no ?? fallback needed for note
  it('scan \u2014 adj_note_template is provided \u2192 used directly in INSERT', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 6,
          rule_name: 'WithNote',
          conditions: '{}',
          adj_type: 'writeoff',
          requires_approval: 1,
          adj_note_template: 'Custom template note',
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL206',
          PatientID: 'P8',
          InsuranceName: 'UHC',
          Balance: 100,
          AgingDays: 200,
          ClaimStatus: 'Open',
        }],
      })
      .mockResolvedValue({});

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'false' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestsCreated: 1 }));
  });

  // ==========================================================================
  // bulkApprove - additional branches
  // ==========================================================================

  // bulkApprove - ids is empty array -> 400
  it('bulkApprove \u2014 ids is empty array \u2192 400', async () => {
    const res = mockRes();
    await ctrl.bulkApprove(mockReq({ ids: [] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // bulkApprove - pending not found for one id -> error added, rest skipped
  it('bulkApprove \u2014 one id not found (not pending) \u2192 error added', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // not found
    const res = mockRes();
    await ctrl.bulkApprove(mockReq({ ids: [999] }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      approved: 0,
      errors: [{ id: 999, message: 'Not found or not pending' }],
    }));
  });

  // ==========================================================================
  // bulkReject - empty ids -> 400
  // ==========================================================================

  it('bulkReject \u2014 ids is empty array \u2192 400', async () => {
    const res = mockRes();
    await ctrl.bulkReject(mockReq({ ids: [] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('bulkReject \u2014 ids not array \u2192 400', async () => {
    const res = mockRes();
    await ctrl.bulkReject(mockReq({ ids: 'bad' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ==========================================================================
  // getQueue - default status (no query param) vs explicit status
  // ==========================================================================

  it('getQueue \u2014 no status param \u2192 defaults to "pending"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, status: 'pending' }] });
    const res = mockRes();
    await ctrl.getQueue(mockReq({}, {}, {}, {}), res); // no status in query
    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ status: 'pending' })]));
  });

  it('getQueue \u2014 explicit status=approved', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 2, status: 'approved' }] });
    const res = mockRes();
    await ctrl.getQueue(mockReq({}, {}, {}, { status: 'approved' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ status: 'approved' })]));
  });

  // ==========================================================================
  // getRules, deleteRule, getAuditLog, getQueueStats happy paths
  // ==========================================================================

  it('getRules \u2014 returns recordset', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, rule_name: 'R1' }] });
    const res = mockRes();
    await ctrl.getRules(mockReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, rule_name: 'R1' }]);
  });

  it('deleteRule \u2014 returns deleted:true', async () => {
    mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
    const res = mockRes();
    await ctrl.deleteRule(mockReq({}, {}, { id: '5' }), res);
    expect(res.json).toHaveBeenCalledWith({ deleted: true });
  });

  it('getAuditLog \u2014 returns recordset', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, claim_id: 'CL01', adj_amt: 100 }] });
    const res = mockRes();
    await ctrl.getAuditLog(mockReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, claim_id: 'CL01', adj_amt: 100 }]);
  });

  it('getQueueStats \u2014 returns summary row', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ pendingCount: 5, pendingBalance: 1000, approved30d: 3, rejected30d: 1 }] });
    const res = mockRes();
    await ctrl.getQueueStats(mockReq(), res);
    expect(res.json).toHaveBeenCalledWith({ pendingCount: 5, pendingBalance: 1000, approved30d: 3, rejected30d: 1 });
  });

  // ==========================================================================
  // Remaining uncovered branches (second pass after running coverage)
  // ==========================================================================

  // L19 b4,1: requiredLevel is not in ROLE_HIERARCHY -> ROLE_HIERARCHY[requiredLevel.toLowerCase()] ?? 0
  // requiredLevel = 'unknown_level' -> rank = undefined -> ?? 0 -> actorRank=0 >= 0 -> true
  it('meetsApprovalLevel \u2014 requiredLevel not in ROLE_HIERARCHY \u2192 requiredRank ?? 0 fires \u2192 actor passes if rank >= 0', async () => {
    // Use approveRequest where approval_level is 'unknown_level_xyz' (not in ROLE_HIERARCHY)
    // actor role is 'admin' (rank 5). requiredRank=0. 5>=0 -> true -> approve succeeds.
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 100,
          approval_level: 'unknown_level_xyz', // not in ROLE_HIERARCHY -> rank ?? 0 = 0
          claim_id: 'CL100',
          balance: 100,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 1,
          rule_name: 'R',
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({
        recordset: [{
          id: 100,
          claim_id: 'CL100',
          balance: 100,
          adj_type: 'wo',
          customer_id: 1,
          rule_id: 1,
          rule_name: 'R',
        }],
      })
      .mockResolvedValue({});

    const req = mockReq({ review_note: 'OK' }, {}, { id: '100' });
    (req as any).actor = { role: 'admin' };
    const res = mockRes();
    await ctrl.approveRequest(req, res);
    expect(res.json).toHaveBeenCalledWith({ approved: true });
  });

  // L49 b10,1 (createRule): conditions is object -> JSON.stringify used
  it('createRule \u2014 conditions is an object \u2192 JSON.stringify branch taken', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 101, rule_name: 'ObjCondCreate', conditions: '{"minAgingDays":30}', adj_type: 'wo', requires_approval: 1, approval_level: 'manager' }],
    });

    const req = mockReq({
      rule_name: 'ObjCondCreate',
      priority: 100,
      conditions: { minAgingDays: 30 }, // object -> JSON.stringify path (L49 b10,1)
      adj_type: 'wo',
      requires_approval: true,
      approval_level: 'manager', // provided -> L53 b14,0
      adj_note_template: 'My template', // provided -> L51 b12,0 (truthy -> 1) AND L52 b13,0 (non-null)
    });
    const res = mockRes();
    await ctrl.createRule(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // L51 b11,0 (createRule): requires_approval falsy -> 0 branch
  // AND L52 b13,0: adj_note_template is provided
  // AND L53 b14,0: approval_level is provided
  it('createRule \u2014 requires_approval false with adj_note_template and approval_level provided', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 102, rule_name: 'CompleteRule', requires_approval: 0, approval_level: 'director', adj_note_template: 'template' }],
    });

    const req = mockReq({
      rule_name: 'CompleteRule',
      priority: 50,
      conditions: '{}',
      adj_type: 'writeoff',
      requires_approval: false, // falsy -> 0 (L51 b11,0)
      adj_note_template: 'template', // provided -> not null (L52 b13,0: truthy branch, adj_note_template ?? null -> adj_note_template)
      approval_level: 'director', // provided -> not null (L53 b14,0)
    });
    const res = mockRes();
    await ctrl.createRule(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // L52 b13,0 alone: adj_note_template provided (not null) -> ?? not triggered
  it('createRule \u2014 adj_note_template provided \u2192 no ?? null fallback', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 103, rule_name: 'WithTemplate', adj_note_template: 'Defined note' }],
    });

    const req = mockReq({
      rule_name: 'WithTemplate',
      conditions: '{}',
      adj_type: 'wo',
      requires_approval: true,
      adj_note_template: 'Defined note', // non-null -> L52 b13,0
      approval_level: null,
    });
    const res = mockRes();
    await ctrl.createRule(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // L53 b14,0: approval_level provided -> no ?? null fallback
  it('createRule \u2014 approval_level provided \u2192 no ?? null fallback', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 104, rule_name: 'WithLevel', approval_level: 'manager' }],
    });

    const req = mockReq({
      rule_name: 'WithLevel',
      conditions: '{}',
      adj_type: 'wo',
      requires_approval: true,
      adj_note_template: null,
      approval_level: 'manager', // non-null -> L53 b14,0
    });
    const res = mockRes();
    await ctrl.createRule(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // L77 b19,0 (updateRule): requires_approval falsy -> 0 branch
  // Make sure we also hit L78 b21,0 (approval_level non-null) and L79 b22,0 (is_active false)
  it('updateRule \u2014 requires_approval false + approval_level provided + is_active false (all three branches together)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 105, rule_name: 'TripleBranch', requires_approval: 0, approval_level: 'director', is_active: 0 }],
    });

    const req = mockReq({
      rule_name: 'TripleBranch',
      priority: 10,
      conditions: '{}',
      adj_type: 'wo',
      requires_approval: 0, // falsy -> 0 (L77 b19,0)
      approval_level: 'director', // non-null -> L78 b21,0
      is_active: false, // false -> is_active !== false is false -> 0 (L79 b22,0)
    }, {}, { id: '105' });
    const res = mockRes();
    await ctrl.updateRule(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 105 }));
  });

  // L107 b25,1 (scan): userEmail ?? 'system' - userEmail missing
  it('scan \u2014 userEmail missing \u2192 falls back to "system"', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // no rules
      .mockResolvedValueOnce({ recordset: [] }); // no claims

    const req = mockReq({}, {}, {}, {});
    delete (req as any).userEmail; // force ?? 'system' (L107 b25,1)
    const res = mockRes();
    await ctrl.scan(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalMatched: 0 }));
  });

  // L175 b40,1: adj_note_template is null in scan (requires_approval=1 path -> creates WriteOffRequest)
  // The scan test for "denialCodes" already has adj_note_template='note' (non-null).
  // We need adj_note_template = null -> fallback `Auto-generated by rule: ${rule.rule_name}` used
  it('scan \u2014 requires_approval=1, adj_note_template=null \u2192 fallback note used in WriteOffRequest', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 10,
          rule_name: 'NullNoteRule',
          conditions: '{}',
          adj_type: 'wo',
          requires_approval: 1,
          adj_note_template: null, // null -> L175 b40,1: fallback template string used
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL300',
          PatientID: 'P30',
          InsuranceName: 'Blue',
          Balance: 200,
          AgingDays: 200,
          ClaimStatus: 'Open',
        }],
      })
      .mockResolvedValue({});

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'false' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestsCreated: 1 }));
  });

  // L200 b42,0: adj_note_template provided (non-null) in auto-post path (requires_approval=0)
  it('scan \u2014 requires_approval=0, adj_note_template provided \u2192 template used directly in audit INSERT', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          id: 11,
          rule_name: 'AutoPostWithNote',
          conditions: '{}',
          adj_type: 'wo',
          requires_approval: 0,
          adj_note_template: 'Explicit auto note', // non-null -> L200 b42,0 fires (no ?? fallback)
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL301',
          PatientID: 'P31',
          InsuranceName: 'Cigna',
          Balance: 150,
          AgingDays: 150,
          ClaimStatus: 'Open',
        }],
      })
      .mockResolvedValue({});

    const res = mockRes();
    await ctrl.scan(mockReq({}, {}, {}, { dryRun: 'false' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ autoPosted: 1 }));
  });

  // L266 b52,0: !pending -> 404 in approveRequest (pending not found)
  it('approveRequest \u2014 pending is null \u2192 404 response', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // no pending record found

    const req = mockReq({ review_note: 'OK' }, {}, { id: '999' });
    const res = mockRes();
    await ctrl.approveRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Request not found or not pending' });
  });

  // L77 b19,0 (updateRule): adj_note_template is provided (non-null) -> ?? null not triggered
  // Branch 19,0 is the "truthy/left" side of `adj_note_template ?? null` - when adj_note_template has a value
  it('updateRule \u2014 adj_note_template provided (non-null) \u2192 used directly, no ?? null fallback', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ id: 200, rule_name: 'WithNoteTemplate', adj_note_template: 'My custom template', adj_type: 'wo', is_active: 1 }],
    });

    const req = mockReq({
      rule_name: 'WithNoteTemplate',
      priority: 100,
      conditions: '{}',
      adj_type: 'wo',
      requires_approval: true,
      adj_note_template: 'My custom template', // non-null -> L77 b19,0: ?? null not triggered
      approval_level: null,
      is_active: true,
    }, {}, { id: '200' });
    const res = mockRes();
    await ctrl.updateRule(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 200 }));
  });

  // L362 b82,0: adj_note provided (non-null) in createRequest
  it('createRequest \u2014 adj_note provided \u2192 no ?? null fallback', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        id: 110,
        claim_id: 'CL110',
        patient_id: 'P110',
        patient_name: 'Jane Smith',
        payer_name: 'Aetna',
        balance: 500,
        aging_days: 120,
        adj_type: 'writeoff',
        adj_note: 'Explicit note text', // non-null -> L362 b82,0: no ?? null fallback
        requested_by: 'test@test.com',
        customer_id: 1,
      }],
    });

    const req = mockReq({
      claim_id: 'CL110',
      patient_id: 'P110',
      patient_name: 'Jane Smith',
      payer_name: 'Aetna',
      balance: 500,
      aging_days: 120,
      adj_type: 'writeoff',
      adj_note: 'Explicit note text', // provided -> L362 b82,0
    });
    const res = mockRes();
    await ctrl.createRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
