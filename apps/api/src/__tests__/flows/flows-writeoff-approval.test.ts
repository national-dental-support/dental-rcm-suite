/**
 * flows-writeoff-approval.test.ts
 *
 * Business Process Flow Test - Write-Off Approval Workflow
 *
 * Testing patterns covered:
 *  1. E2E (simulated via controller + mock pool)
 *  2. Integration (controller interacts with mock DB layer)
 *  3. BDD (Given/When/Then structure)
 *  4. Process Compliance (role-hierarchy enforcement)
 *
 * Scenarios:
 *  A - Scan creates WriteOffRequest when approval required
 *  B - Scan auto-posts (WriteOffAuditLog) when no approval required
 *  C - Manager can approve a pending request
 *  D - AR Specialist cannot approve (403)
 *  E - Director-level rule cannot be approved by Manager (403)
 *  F - Bulk approve with mixed eligibility
 *  G - Reject clears pending, records event
 *  H - Scan dry-run returns matches but inserts nothing
 *  Pure - meetsApprovalLevel business rules tested directly via public methods
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- DB / pool mock ----------------------------------------------------------

const mockQuery = jest.fn<any>();
const mockRequestInstance: any = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
};

jest.mock('../../modules/db', () => ({
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

jest.mock('../../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(),
    BigInt: f(),
    Decimal: f,
    Bit: f(),
    DateTime: f(),
    Date: f(),
    Float: f(),
    VarChar: Object.assign(f, { MAX: f() }),
    UniqueIdentifier: f(),
    SmallInt: f(),
    Request: jest.fn().mockImplementation(() => mockRequestInstance),
    default: { NVarChar: Object.assign(f, { MAX: f() }), Int: f(), Decimal: f, Bit: f() },
  };
});

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../utils/claim-events', () => ({
  recordClaimEvent: jest.fn().mockResolvedValue(undefined),
}));

// --- Import mocked utilities -------------------------------------------------

import { recordClaimEvent } from '../../utils/claim-events';

// --- Import SUT --------------------------------------------------------------

import { WriteOffWorkflowController } from '../../controllers/writeoff/workflow';

// --- Helpers -----------------------------------------------------------------

const makeReq = (
  body: any = {},
  params: any = {},
  query: any = {},
  overrides: any = {},
) => ({
  body,
  headers: {},
  params,
  query,
  actor: { customer_id: 1, role: 'manager' },
  customerId: 1,
  userEmail: 'manager@test.com',
  ip: '127.0.0.1',
  ...overrides,
} as any);

const makeRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn();
  return r;
};

// Shorthand claim record returned by the aged-claims query
const agedClaim = (id: string, agingDays = 120, balance = 250.0) => ({
  ClaimID: id,
  PatientID: `PAT-${id}`,
  InsuranceName: 'Blue Cross',
  ClaimStatus: 'DENIED',
  Balance: balance,
  AgingDays: agingDays,
});

// Shorthand rule record
const makeRule = (id: number, requiresApproval: boolean, approvalLevel: string | null = null, extraCond: any = {}) => ({
  id,
  rule_name: `Rule-${id}`,
  priority: id * 10,
  conditions: JSON.stringify({ minAgingDays: 90, ...extraCond }),
  adj_type: 'contractual',
  adj_note_template: null,
  requires_approval: requiresApproval ? 1 : 0,
  approval_level: approvalLevel,
  is_active: 1,
});

// --- Test Suite ---------------------------------------------------------------

describe('Business Process: Write-Off Approval Workflow', () => {
  let ctrl: WriteOffWorkflowController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new WriteOffWorkflowController();
  });

  // ===========================================================================
  // Scenario A - Scan creates WriteOffRequest when approval required (E2E)
  // ===========================================================================

  describe('Scenario A \u2014 E2E: Scan creates WriteOffRequest when approval is required', () => {
    it('Given a rule with requires_approval=true, When scan() runs (not dryRun), Then WriteOffRequest INSERT executes and claim event is recorded', async () => {
      const rule = makeRule(1, true, 'manager');
      const claim = agedClaim('CL50001');

      // Call 1: getRules
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      // Call 2: aged-claims CTE
      mockQuery.mockResolvedValueOnce({ recordset: [claim] });
      // Call 3: INSERT INTO WriteOffRequest
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const req = makeReq({}, {}, {});
      const res = makeRes();

      await ctrl.scan(req, res);

      // Response shape
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: false,
          totalMatched: 1,
          requestsCreated: 1,
          autoPosted: 0,
        }),
      );

      // At least one query should contain WriteOffRequest
      const allQueries: string[] = mockQuery.mock.calls.map((c: any) => String(c[0]));
      expect(allQueries.some(q => q.includes('WriteOffRequest'))).toBe(true);

      // Claim event recorded for writeoff_requested
      expect(recordClaimEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          claimId: 'CL50001',
          eventType: 'writeoff_requested',
        }),
      );
    });

    it('Given multiple claims matching a requires_approval rule, Each gets its own WriteOffRequest and event', async () => {
      const rule = makeRule(2, true, 'director');
      const claims = [agedClaim('CL50002'), agedClaim('CL50003')];

      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({ recordset: claims });
      // Two INSERT calls
      mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [1] });

      const req = makeReq();
      const res = makeRes();

      await ctrl.scan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ requestsCreated: 2, autoPosted: 0, totalMatched: 2 }),
      );
      expect(recordClaimEvent).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Scenario B - Scan auto-posts when no approval required (Integration)
  // ===========================================================================

  describe('Scenario B \u2014 Integration: Scan auto-posts when no approval required', () => {
    it('Given a rule with requires_approval=false, When scan() runs, Then WriteOffAuditLog INSERT executes and no WriteOffRequest is created', async () => {
      const rule = makeRule(10, false);
      const claim = agedClaim('CL50010', 200, 75.0);

      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({ recordset: [claim] });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // AuditLog INSERT

      const req = makeReq();
      const res = makeRes();

      await ctrl.scan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          autoPosted: 1,
          requestsCreated: 0,
          totalMatched: 1,
        }),
      );

      // AuditLog INSERT should appear in query calls
      const allQueries: string[] = mockQuery.mock.calls.map((c: any) => String(c[0]));
      expect(allQueries.some(q => q.includes('WriteOffAuditLog'))).toBe(true);
      // No WriteOffRequest INSERT
      const writeoffRequestInserts = allQueries.filter(q =>
        q.includes('INSERT INTO WriteOffRequest'),
      );
      expect(writeoffRequestInserts).toHaveLength(0);

      expect(recordClaimEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'writeoff_auto_posted' }),
      );
    });

    it('Given no active rules match the claim conditions, Then no requests or audit entries are created', async () => {
      // Rule requires minAgingDays=200, claim only has 120 days
      const rule = makeRule(11, false, null, { minAgingDays: 200 });
      const claim = agedClaim('CL50011', 120, 100.0);

      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({ recordset: [claim] });

      const req = makeReq();
      const res = makeRes();

      await ctrl.scan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ autoPosted: 0, requestsCreated: 0, totalMatched: 0 }),
      );
      expect(recordClaimEvent).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Scenario C - Manager can approve a pending request (BDD)
  // ===========================================================================

  describe('Business Rule: Role Hierarchy Enforcement', () => {
    describe('Given a write-off request requiring Manager approval', () => {
      const pendingRecord = {
        id: 100,
        claim_id: 'CL50100',
        rule_id: 1,
        rule_name: 'Manager-Level Rule',
        balance: 500.0,
        adj_type: 'contractual',
        adj_note: 'Auto-generated',
        customer_id: 1,
        approval_level: 'manager',
        status: 'pending',
      };

      it('When an AR Specialist attempts approval, Then 403 Forbidden is returned', async () => {
        // Scenario D - Process Compliance
        mockQuery.mockResolvedValueOnce({ recordset: [pendingRecord] });

        const req = makeReq({ review_note: 'approve' }, { id: '100' }, {}, {
          actor: { role: 'ar_specialist' },
          userEmail: 'specialist@test.com',
        });
        const res = makeRes();

        await ctrl.approveRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('manager'),
          }),
        );
      });

      it('When a Manager attempts approval, Then the request is approved successfully', async () => {
        // Scenario C
        mockQuery.mockResolvedValueOnce({ recordset: [pendingRecord] }); // reqCheck
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // UPDATE
        mockQuery.mockResolvedValueOnce({ recordset: [pendingRecord] }); // SELECT after update
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // AuditLog INSERT

        const req = makeReq({ review_note: 'Looks good' }, { id: '100' }, {}, {
          actor: { role: 'manager' },
          userEmail: 'manager@test.com',
        });
        const res = makeRes();

        await ctrl.approveRequest(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
        expect(recordClaimEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ eventType: 'writeoff_approved', claimId: 'CL50100' }),
        );
      });

      it('When an Admin attempts approval, Then the request is approved (Admin > Manager)', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [pendingRecord] });
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
        mockQuery.mockResolvedValueOnce({ recordset: [pendingRecord] });
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

        const req = makeReq({ review_note: 'Admin approved' }, { id: '100' }, {}, {
          actor: { role: 'admin' },
          userEmail: 'admin@test.com',
        });
        const res = makeRes();

        await ctrl.approveRequest(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
      });
    });

    // -------------------------------------------------------------------------
    // Scenario E - Director-level rule cannot be approved by Manager
    // -------------------------------------------------------------------------

    describe('Given a write-off request requiring Director approval', () => {
      const directorPending = {
        id: 200,
        claim_id: 'CL50200',
        rule_id: 5,
        rule_name: 'Director-Level Rule',
        balance: 9500.0,
        adj_type: 'contractual',
        adj_note: 'High-value write-off',
        customer_id: 1,
        approval_level: 'director',
        status: 'pending',
      };

      it('When a Manager attempts approval, Then 403 is returned', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [directorPending] });

        const req = makeReq({ review_note: 'approve' }, { id: '200' }, {}, {
          actor: { role: 'manager' },
        });
        const res = makeRes();

        await ctrl.approveRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('director'),
          }),
        );
      });

      it('When a Director attempts approval, Then it succeeds', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [directorPending] });
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
        mockQuery.mockResolvedValueOnce({ recordset: [directorPending] });
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

        const req = makeReq({ review_note: 'Director approved' }, { id: '200' }, {}, {
          actor: { role: 'director' },
          userEmail: 'director@test.com',
        });
        const res = makeRes();

        await ctrl.approveRequest(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
      });

      it('When a VP attempts approval, Then it succeeds (VP > Director)', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [directorPending] });
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
        mockQuery.mockResolvedValueOnce({ recordset: [directorPending] });
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

        const req = makeReq({ review_note: 'VP approved' }, { id: '200' }, {}, {
          actor: { role: 'vp' },
          userEmail: 'vp@test.com',
        });
        const res = makeRes();

        await ctrl.approveRequest(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
      });
    });
  });

  // ===========================================================================
  // Scenario F - Bulk approve with mixed eligibility
  // ===========================================================================

  describe('Scenario F \u2014 Integration: Bulk approve with mixed eligibility', () => {
    it('Given three pending requests (two manager-level, one director-level), When Manager bulk-approves all, Then eligible ones succeed and director-required one fails', async () => {
      const managerPending1 = {
        id: 301, claim_id: 'CL50301', rule_id: 1, rule_name: 'R1',
        balance: 100, adj_type: 'contractual', customer_id: 1,
        approval_level: 'manager', status: 'pending',
      };
      const managerPending2 = {
        id: 302, claim_id: 'CL50302', rule_id: 1, rule_name: 'R1',
        balance: 200, adj_type: 'contractual', customer_id: 1,
        approval_level: 'manager', status: 'pending',
      };
      const directorPending = {
        id: 303, claim_id: 'CL50303', rule_id: 5, rule_name: 'R5',
        balance: 9000, adj_type: 'contractual', customer_id: 1,
        approval_level: 'director', status: 'pending',
      };

      // id=301: check -> eligible
      mockQuery.mockResolvedValueOnce({ recordset: [managerPending1] });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // AuditLog

      // id=302: check -> eligible
      mockQuery.mockResolvedValueOnce({ recordset: [managerPending2] });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // AuditLog

      // id=303: check -> director-level, manager cannot approve
      mockQuery.mockResolvedValueOnce({ recordset: [directorPending] });

      const req = makeReq(
        { ids: [301, 302, 303], review_note: 'Bulk approval' },
        {}, {}, {
          actor: { role: 'manager' },
          userEmail: 'manager@test.com',
        },
      );
      const res = makeRes();

      await ctrl.bulkApprove(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          approved: 2,
          errors: expect.arrayContaining([
            expect.objectContaining({ id: 303, message: expect.stringContaining('director') }),
          ]),
        }),
      );
    });

    it('Given an empty ids array, When bulkApprove is called, Then 400 is returned', async () => {
      const req = makeReq({ ids: [] });
      const res = makeRes();

      await ctrl.bulkApprove(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'ids array required' }));
    });

    it('Given a Director actor, When bulk-approving all three including director-level, Then all three succeed', async () => {
      const records = [
        { id: 401, claim_id: 'CL50401', rule_id: 1, rule_name: 'R1', balance: 100, adj_type: 'contractual', customer_id: 1, approval_level: 'manager', status: 'pending' },
        { id: 402, claim_id: 'CL50402', rule_id: 5, rule_name: 'R5', balance: 500, adj_type: 'contractual', customer_id: 1, approval_level: 'director', status: 'pending' },
        { id: 403, claim_id: 'CL50403', rule_id: 6, rule_name: 'R6', balance: 250, adj_type: 'contractual', customer_id: 1, approval_level: null, status: 'pending' },
      ];

      for (const rec of records) {
        mockQuery.mockResolvedValueOnce({ recordset: [rec] }); // check
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // UPDATE
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // AuditLog
      }

      const req = makeReq(
        { ids: [401, 402, 403], review_note: 'Director bulk' },
        {}, {}, { actor: { role: 'director' }, userEmail: 'director@test.com' },
      );
      const res = makeRes();

      await ctrl.bulkApprove(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ approved: 3, errors: [] }),
      );
    });
  });

  // ===========================================================================
  // Scenario G - Reject clears pending, records event (BDD)
  // ===========================================================================

  describe('Scenario G \u2014 BDD: Reject clears pending and records event', () => {
    describe('Given a pending write-off request', () => {
      const pendingForReject = {
        id: 500,
        claim_id: 'CL50500',
        adj_type: 'contractual',
        balance: 750.0,
        customer_id: 1,
        status: 'pending',
      };

      it('When rejectRequest is called, Then status becomes rejected', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // UPDATE
        mockQuery.mockResolvedValueOnce({ recordset: [{ ...pendingForReject, status: 'rejected' }] }); // SELECT

        const req = makeReq({ review_note: 'Does not qualify' }, { id: '500' }, {}, {
          userEmail: 'manager@test.com',
        });
        const res = makeRes();

        await ctrl.rejectRequest(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ rejected: true }));
      });

      it('When rejectRequest is called, Then a writeoff_rejected event is recorded', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // UPDATE
        mockQuery.mockResolvedValueOnce({ recordset: [{ ...pendingForReject, status: 'rejected' }] }); // SELECT

        const req = makeReq({ review_note: 'Rejected by manager' }, { id: '500' }, {}, {
          userEmail: 'manager@test.com',
        });
        const res = makeRes();

        await ctrl.rejectRequest(req, res);

        expect(recordClaimEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            claimId: 'CL50500',
            eventType: 'writeoff_rejected',
          }),
        );
      });

      it('When rejectRequest is called with no review_note, Then review_note defaults to null in event metadata', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
        mockQuery.mockResolvedValueOnce({ recordset: [{ ...pendingForReject, status: 'rejected' }] });

        const req = makeReq({}, { id: '500' }); // no review_note in body
        const res = makeRes();

        await ctrl.rejectRequest(req, res);

        expect(recordClaimEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            metadata: expect.objectContaining({ reviewNote: null }),
          }),
        );
      });
    });
  });

  // ===========================================================================
  // Scenario H - Scan dry-run returns matches but inserts nothing
  // ===========================================================================

  describe('Scenario H \u2014 Process Compliance: Dry-run scan returns matches without inserting', () => {
    it('When scan runs with dryRun=true, Then no INSERT queries are executed and response shows matches with zero posted/requested', async () => {
      const rule = makeRule(20, true, 'manager');
      const claims = [agedClaim('CL50020'), agedClaim('CL50021')];

      mockQuery.mockResolvedValueOnce({ recordset: [rule] }); // getRules
      mockQuery.mockResolvedValueOnce({ recordset: claims }); // aged-claims

      const req = makeReq({}, {}, { dryRun: 'true' });
      const res = makeRes();

      await ctrl.scan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
          totalMatched: 2,
          autoPosted: 0,
          requestsCreated: 0,
        }),
      );

      // Only 2 queries should have been made (getRules + aged-claims) - no INSERTs
      expect(mockQuery).toHaveBeenCalledTimes(2);

      // recordClaimEvent must NOT have been called in dry-run
      expect(recordClaimEvent).not.toHaveBeenCalled();
    });

    it('When scan runs with dryRun=true against auto-post rule, Then no AuditLog INSERT and zero autoPosted', async () => {
      const rule = makeRule(21, false); // no approval required
      const claim = agedClaim('CL50022');

      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({ recordset: [claim] });

      const req = makeReq({}, {}, { dryRun: 'true' });
      const res = makeRes();

      await ctrl.scan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true, autoPosted: 0, requestsCreated: 0, totalMatched: 1 }),
      );

      const allQueries: string[] = mockQuery.mock.calls.map((c: any) => String(c[0]));
      const insertCalls = allQueries.filter(q => q.includes('INSERT'));
      expect(insertCalls).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Pure Business Rule Tests - meetsApprovalLevel via public API
  // ===========================================================================

  describe('Business Rule: Role Hierarchy \u2014 Pure Logic Tests', () => {
    /**
     * meetsApprovalLevel is private but exercised through approveRequest.
     * These tests validate the ROLE_HIERARCHY rankings defined in workflow.ts:
     *   ar_specialist=1, manager=2, director=3, vp=4, admin=5, super_admin=6
     */

    const pendingWithLevel = (level: string | null, id = 999) => ({
      id,
      claim_id: `CL5${id}`,
      rule_id: 1,
      rule_name: 'Test',
      balance: 100,
      adj_type: 'contractual',
      adj_note: null,
      customer_id: 1,
      approval_level: level,
      status: 'pending',
    });

    const tryApprove = async (actorRole: string, requiredLevel: string | null, id = 999) => {
      jest.clearAllMocks();
      mockQuery.mockResolvedValueOnce({ recordset: [pendingWithLevel(requiredLevel, id)] });
      mockQuery.mockResolvedValue({ recordset: [pendingWithLevel(requiredLevel, id)], rowsAffected: [1] });

      const req = makeReq({ review_note: 'test' }, { id: String(id) }, {}, {
        actor: { role: actorRole },
        userEmail: `${actorRole}@test.com`,
      });
      const res = makeRes();
      await ctrl.approveRequest(req, res);
      return res;
    };

    it('AR Specialist (rank 1) cannot meet manager (rank 2) requirement \u2192 403', async () => {
      const res = await tryApprove('ar_specialist', 'manager');
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('Manager (rank 2) meets manager (rank 2) requirement \u2192 approved', async () => {
      const res = await tryApprove('manager', 'manager');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
    });

    it('Manager (rank 2) cannot meet director (rank 3) requirement \u2192 403', async () => {
      const res = await tryApprove('manager', 'director');
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('Director (rank 3) meets director (rank 3) requirement \u2192 approved', async () => {
      const res = await tryApprove('director', 'director');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
    });

    it('Director (rank 3) cannot meet vp (rank 4) requirement \u2192 403', async () => {
      const res = await tryApprove('director', 'vp');
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('VP (rank 4) meets vp (rank 4) requirement \u2192 approved', async () => {
      const res = await tryApprove('vp', 'vp');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
    });

    it('Admin (rank 5) can approve any level including vp (rank 4) \u2192 approved', async () => {
      const res = await tryApprove('admin', 'vp');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
    });

    it('Super_admin (rank 6) can approve any level \u2192 approved', async () => {
      const res = await tryApprove('super_admin', 'director');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
    });

    it('No approval_level required (null) \u2192 any role can approve \u2192 approved', async () => {
      const res = await tryApprove('ar_specialist', null);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
    });

    it('Unknown role not in hierarchy \u2192 rank defaults to 0 \u2192 403 for any non-null level', async () => {
      const res = await tryApprove('contractor', 'manager');
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('Empty string role \u2192 rank defaults to 0 \u2192 403 for manager requirement', async () => {
      jest.clearAllMocks();
      mockQuery.mockResolvedValueOnce({ recordset: [pendingWithLevel('manager', 900)] });

      const req = makeReq({ review_note: 'test' }, { id: '900' }, {}, {
        actor: { role: '' },
        userEmail: 'anon@test.com',
      });
      const res = makeRes();
      await ctrl.approveRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ===========================================================================
  // Approver not found / not pending (404)
  // ===========================================================================

  describe('Process Compliance: Request not found or already processed', () => {
    it('When approveRequest is called for a non-existent ID, Then 404 is returned', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] }); // not found

      const req = makeReq({ review_note: 'approve' }, { id: '9999' });
      const res = makeRes();

      await ctrl.approveRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('not found') }),
      );
    });

    it('When rejectRequest is called and the SELECT after UPDATE returns no record, Then no event is recorded', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] }); // UPDATE (no rows)
      mockQuery.mockResolvedValueOnce({ recordset: [] }); // SELECT - wo not found

      const req = makeReq({ review_note: 'n/a' }, { id: '9998' });
      const res = makeRes();

      await ctrl.rejectRequest(req, res);

      // Should still return 200 rejected:true
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ rejected: true }));
      // But no event since wo is null
      expect(recordClaimEvent).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error handling (500 paths)
  // ===========================================================================

  describe('Error Handling: Internal errors return 500', () => {
    it('scan() returns 500 when DB throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      const req = makeReq();
      const res = makeRes();

      await ctrl.scan(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('approveRequest() returns 500 when DB throws during reqCheck', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Timeout'));

      const req = makeReq({ review_note: 'approve' }, { id: '1' });
      const res = makeRes();

      await ctrl.approveRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('rejectRequest() returns 500 when DB throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Timeout'));

      const req = makeReq({ review_note: 'reject' }, { id: '1' });
      const res = makeRes();

      await ctrl.rejectRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('bulkApprove() returns 500 when DB throws mid-loop', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Pool exhausted'));

      const req = makeReq({ ids: [1], review_note: 'bulk' });
      const res = makeRes();

      await ctrl.bulkApprove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ===========================================================================
  // Scan condition filtering (process compliance - first-matching-rule-wins)
  // ===========================================================================

  describe('Process Compliance: Scan condition filtering and first-rule-wins', () => {
    it('Given two rules and a claim that only matches the second, When scan runs, Then only the second rule fires', async () => {
      const rule1 = makeRule(30, true, 'manager', { maxBalance: 50 }); // maxBalance=50, claim has 300
      const rule2 = makeRule(31, false, null, { minAgingDays: 90 }); // matches

      const claim = agedClaim('CL50030', 150, 300.0);

      mockQuery.mockResolvedValueOnce({ recordset: [rule1, rule2] });
      mockQuery.mockResolvedValueOnce({ recordset: [claim] });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // AuditLog for rule2

      const req = makeReq();
      const res = makeRes();

      await ctrl.scan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ autoPosted: 1, requestsCreated: 0, totalMatched: 1 }),
      );
    });

    it('Given two rules both matching a claim, When scan runs, Then only the first rule fires (first-wins)', async () => {
      const rule1 = makeRule(40, true, 'manager');  // requires_approval
      const rule2 = makeRule(41, false);            // auto-post

      const claim = agedClaim('CL50040', 200, 150.0);

      mockQuery.mockResolvedValueOnce({ recordset: [rule1, rule2] });
      mockQuery.mockResolvedValueOnce({ recordset: [claim] });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // WriteOffRequest INSERT

      const req = makeReq();
      const res = makeRes();

      await ctrl.scan(req, res);

      // rule1 (requires_approval) fires first -> requestsCreated=1, autoPosted=0
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ requestsCreated: 1, autoPosted: 0 }),
      );
    });

    it('Given a rule with invalid JSON conditions, When scan runs, Then the rule is skipped', async () => {
      const badRule = { ...makeRule(50, true, 'manager'), conditions: 'NOT_VALID_JSON' };
      const claim = agedClaim('CL50050');

      mockQuery.mockResolvedValueOnce({ recordset: [badRule] });
      mockQuery.mockResolvedValueOnce({ recordset: [claim] });

      const req = makeReq();
      const res = makeRes();

      await ctrl.scan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ totalMatched: 0, requestsCreated: 0, autoPosted: 0 }),
      );
    });
  });
});
