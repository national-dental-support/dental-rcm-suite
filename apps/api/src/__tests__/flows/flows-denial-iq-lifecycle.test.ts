/**
 * flows-denial-iq-lifecycle.test.ts
 *
 * Business process flow tests for the complete Denial IQ claim lifecycle.
 * Covers all four testing types:
 *   1. E2E workflow    - multi-controller sequences
 *   2. Integration     - chained API calls
 *   3. BDD-style       - Given/When/Then via nested describes
 *   4. Process compliance - business rule enforcement
 *
 * Controller under test: ClaimActionsController
 *   src/controllers/denial-iq/claim-detail/claim-actions.ts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- DB mock ------------------------------------------------------------------

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
  };
});

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../utils/telemetry', () => ({ trackEvent: jest.fn() }));

jest.mock('../../utils/resolve-user-scope', () => ({
  resolveUserScope: jest.fn().mockResolvedValue({
    userId: 10,
    customerId: 1,
    role: 'AR Specialist',
    isSuperAdmin: false,
    locations: [],
    providers: [],
    payers: [],
  }),
  buildScopeFilter: jest.fn().mockReturnValue({ where: '', params: {} }),

  extractCustomerId: jest.fn().mockReturnValue(null),
  buildTeamFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildCustomerFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
}));

jest.mock('../../utils/claim-events', () => ({
  recordClaimEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../websockets/index', () => ({
  broadcast: jest.fn(),
  broadcastToCustomer: jest.fn(),
  pushNotification: jest.fn(),
}));

// --- Helpers ------------------------------------------------------------------

const mockReq = (overrides: any = {}) => ({
  query: {},
  body: {},
  params: {},
  headers: { 'x-actor-email': 'alice@test.com' },
  customerId: 1,
  actor: { userId: 10, email: 'alice@test.com', role: 'AR Specialist', customerId: 1 },
  ...overrides,
});

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json   = jest.fn().mockReturnValue(r);
  r.send   = jest.fn().mockReturnValue(r);
  return r;
};

// --- Import under test --------------------------------------------------------

import { ClaimActionsController } from '../../controllers/denial-iq/claim-detail/claim-actions';
import { resolveUserScope } from '../../utils/resolve-user-scope';
import { recordClaimEvent } from '../../utils/claim-events';

// ===========================================================================
//  Business Process: Denial IQ Claim Lifecycle
// ===========================================================================

describe('Business Process: Denial IQ Claim Lifecycle', () => {

  let ctrl: ClaimActionsController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new ClaimActionsController();
  });

  // -------------------------------------------------------------------------
  // Scenario A - Assign -> Start Work (E2E workflow)
  // -------------------------------------------------------------------------

  describe('Scenario A: Assign \u2192 Start Work flow', () => {
    describe('Given a claim with an open history row (no ClaimWorkStartedTime)', () => {
      /**
       * Flow: ClaimActions.startWork (existing open row, not yet started)
       * Query [0]: resolveUserScope -> SELECT user by email (mocked via resolveUserScope)
       * Query [0]: SELECT open history row (ClaimWorkStartedTime IS NULL)
       * Query [1]: UPDATE ClaimWorkStartedTime
       * recordClaimEvent: mocked
       */
      it('When startWork is called, Then ClaimWorkStartedTime is updated and response is 200', async () => {
        // Flow: ClaimActions.startWork - open row with no start time
        // Query [0]: SELECT open history row -> returns row without ClaimWorkStartedTime
        // Query [1]: UPDATE ClaimWorkStartedTime
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH100', ClaimWorkStartedTime: null }] }) // [0] check existing
          .mockResolvedValueOnce({ recordset: [] }); // [1] UPDATE

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.startWork(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Work started', claimHistoryId: 'CH100' })
        );
      });

      it('And recordClaimEvent fires with denial_work_started event type', async () => {
        // Query [0]: SELECT open history row -> row without ClaimWorkStartedTime
        // Query [1]: UPDATE
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH100', ClaimWorkStartedTime: null }] })
          .mockResolvedValueOnce({ recordset: [] });

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.startWork(req, res);

        expect(recordClaimEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ claimId: 'CL50001', eventType: 'denial_work_started' })
        );
      });
    });

    describe('Given a claim whose work session is already started (idempotent path)', () => {
      it('When startWork is called again, Then 200 with "Work already started" is returned', async () => {
        // Query [0]: SELECT open history row -> row WITH ClaimWorkStartedTime already set
        mockQuery.mockResolvedValueOnce({
          recordset: [{ ClaimHistoryId: 'CH100', ClaimWorkStartedTime: new Date() }],
        });

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.startWork(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Work already started' })
        );
      });
    });

    describe('Given a claim with NO open row for the current user', () => {
      it('When startWork is called, Then 200 with no-op message is returned (no auto-assign)', async () => {
        // Query [0]: SELECT open history row -> empty (no open row)
        mockQuery.mockResolvedValueOnce({ recordset: [] });

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.startWork(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ claimHistoryId: null })
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario B - Close creates Pending hold (BDD-style + Integration)
  // -------------------------------------------------------------------------

  describe('Scenario B: Close creates Pending hold', () => {
    describe('Given a specialist has an open work row for claim CL50001', () => {
      it('When close is called with claimStatus=Denied, Then work row gets ClaimWorkEndedTime', async () => {
        /**
         * Flow: ClaimActions.close
         * resolveUserScope -> mocked (returns userId:10)
         * Query [0]: SELECT open history row -> open row found
         * Query [1]: UPDATE ClaimWorkEndedTime (close the row)
         * Query [2]: SELECT pending_days from ClaimPendingConfig
         * Query [3]: SELECT max ClaimHistoryId (for new pending row ID)
         * Query [4]: SELECT claim data (DateOfService, etc.)
         * Query [5]: INSERT pending row
         * recordClaimEvent: mocked
         */
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH200' }] })                            // [0] find open row
          .mockResolvedValueOnce({ recordset: [] })                                                        // [1] UPDATE close row
          .mockResolvedValueOnce({ recordset: [{ pending_days: 14 }] })                                   // [2] pending config
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH205' }] })                            // [3] max ID
          .mockResolvedValueOnce({ recordset: [{ DateOfService: '2025-01-01', ClaimSubmittedDate: '2025-01-05', CarcCode: 'CO-50', ClaimBalanceDue: 1500 }] }) // [4] claim data
          .mockResolvedValueOnce({ recordset: [] });                                                       // [5] INSERT pending

        const req = mockReq({ body: { claimId: 'CL50001', claimStatus: 'Denied' } });
        const res = mockRes();

        await ctrl.close(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ claimHistoryId: 'CH200' })
        );
      });

      it('And a new Pending row is created with pending_until set', async () => {
        // Same flow - verify recordClaimEvent captures pending metadata
        // Query [0]: open row
        // Query [1]: UPDATE close
        // Query [2]: pending_days config
        // Query [3]: max ClaimHistoryId
        // Query [4]: claim data
        // Query [5]: INSERT pending
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH200' }] })   // [0]
          .mockResolvedValueOnce({ recordset: [] })                               // [1]
          .mockResolvedValueOnce({ recordset: [{ pending_days: 14 }] })          // [2]
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH205' }] })   // [3]
          .mockResolvedValueOnce({ recordset: [{ DateOfService: '2025-01-01', ClaimSubmittedDate: '2025-01-05', CarcCode: 'CO-50', ClaimBalanceDue: 1500 }] }) // [4]
          .mockResolvedValueOnce({ recordset: [] });                              // [5]

        const req = mockReq({ body: { claimId: 'CL50001', claimStatus: 'Denied' } });
        const res = mockRes();

        await ctrl.close(req, res);

        expect(recordClaimEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            claimId: 'CL50001',
            eventType: 'denial_work_completed',
            metadata: expect.objectContaining({ pendingDays: 14 }),
          })
        );
      });

      it('And the response includes pendingDays', async () => {
        // Flow: ClaimActions.close - confirm pendingDays in response body
        // Query [0]: open row
        // Query [1]: UPDATE
        // Query [2]: ClaimPendingConfig (14 days)
        // Query [3]: max ID
        // Query [4]: claim data
        // Query [5]: INSERT pending
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH201' }] })   // [0]
          .mockResolvedValueOnce({ recordset: [] })                               // [1]
          .mockResolvedValueOnce({ recordset: [{ pending_days: 21 }] })          // [2] custom 21-day hold
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH300' }] })   // [3]
          .mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 0 }] }) // [4]
          .mockResolvedValueOnce({ recordset: [] });                              // [5]

        const req = mockReq({ body: { claimId: 'CL50001', claimStatus: 'Denied' } });
        const res = mockRes();

        await ctrl.close(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ pendingDays: 21 })
        );
      });

      it('And the default pending hold is 14 days when no ClaimPendingConfig row exists', async () => {
        // Flow: ClaimActions.close - no ClaimPendingConfig -> default 14
        // Query [0]: open row
        // Query [1]: UPDATE
        // Query [2]: ClaimPendingConfig -> empty recordset (falls back to default 14)
        // Query [3]: max ID
        // Query [4]: claim data
        // Query [5]: INSERT pending
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH202' }] })   // [0]
          .mockResolvedValueOnce({ recordset: [] })                               // [1]
          .mockResolvedValueOnce({ recordset: [] })                               // [2] no config row
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH310' }] })   // [3]
          .mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 0 }] }) // [4]
          .mockResolvedValueOnce({ recordset: [] });                              // [5]

        const req = mockReq({ body: { claimId: 'CL50001', claimStatus: 'Denied' } });
        const res = mockRes();

        await ctrl.close(req, res);

        // pending_days ?? 14 default path
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ pendingDays: 14 })
        );
      });
    });

    describe('Given the claim has no open work row (already closed)', () => {
      it('When close is called, Then 200 with already-closed message is returned (no-op)', async () => {
        // Flow: ClaimActions.close - no open row
        // Query [0]: SELECT open row -> empty
        mockQuery.mockResolvedValueOnce({ recordset: [] }); // [0] no open row

        const req = mockReq({ body: { claimId: 'CL50001', claimStatus: 'Denied' } });
        const res = mockRes();

        await ctrl.close(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Claim already closed or not assigned to user' })
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario C - Close Adjudicated skips Pending (Process Compliance)
  // -------------------------------------------------------------------------

  describe('Scenario C: Close Adjudicated skips Pending hold', () => {
    describe('Given a specialist has an open work row', () => {
      it('When closeAdjudicated is called, Then only the open row is updated (no Pending row inserted)', async () => {
        /**
         * Flow: ClaimActions.closeAdjudicated
         * resolveUserScope -> mocked
         * Query [0]: SELECT open history row -> found
         * Query [1]: UPDATE ClaimWorkEndedTime + ClaimStatus='Closed'
         * recordClaimEvent: mocked
         * NOTE: NO INSERT for pending row - this is the critical compliance rule
         */
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH400' }] }) // [0] find open row
          .mockResolvedValueOnce({ recordset: [] });                            // [1] UPDATE

        const req = mockReq({ body: { claimId: 'CL50001', progress: 100 } });
        const res = mockRes();

        await ctrl.closeAdjudicated(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Claim closed as fully adjudicated', claimHistoryId: 'CH400' })
        );
        // Only 2 queries fired - no INSERT for pending
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });

      it('And recordClaimEvent fires with adjudicated=true in metadata', async () => {
        // Flow: ClaimActions.closeAdjudicated
        // Query [0]: find open row
        // Query [1]: UPDATE
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH400' }] })
          .mockResolvedValueOnce({ recordset: [] });

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.closeAdjudicated(req, res);

        expect(recordClaimEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            eventType: 'denial_work_completed',
            metadata: expect.objectContaining({ adjudicated: true }),
          })
        );
      });

      it('And progress defaults to 100 when not provided', async () => {
        // Flow: ClaimActions.closeAdjudicated - no progress supplied
        // Query [0]: find open row
        // Query [1]: UPDATE
        mockQuery
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH401' }] })
          .mockResolvedValueOnce({ recordset: [] });

        const req = mockReq({ body: { claimId: 'CL50001' } }); // no progress
        const res = mockRes();

        await ctrl.closeAdjudicated(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
      });
    });

    describe('Given the claim has no open row', () => {
      it('When closeAdjudicated is called, Then 200 with already-closed message is returned', async () => {
        // Flow: ClaimActions.closeAdjudicated - no open row
        // Query [0]: SELECT open row -> empty
        mockQuery.mockResolvedValueOnce({ recordset: [] });

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.closeAdjudicated(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Claim already closed' })
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario D - Unassign returns claim to Unassigned state (E2E workflow)
  // -------------------------------------------------------------------------

  describe('Scenario D: Unassign returns claim to Unassigned state', () => {
    describe('Given an open row assigned to the current user', () => {
      it('When unassign is called, Then ClaimStatus=Unassigned and ClaimWorkEndedTime is set', async () => {
        /**
         * Flow: ClaimActions.unassign
         * resolveUserScope -> mocked (userId:10)
         * Query [0]: UPDATE claimhistory SET ClaimStatus='Unassigned' + ClaimWorkEndedTime
         * recordClaimEvent: mocked
         */
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }); // [0] UPDATE

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.unassign(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Claim unassigned' })
        );
      });

      it('And recordClaimEvent fires with denial_work_unassigned event type', async () => {
        // Flow: ClaimActions.unassign
        // Query [0]: UPDATE
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.unassign(req, res);

        expect(recordClaimEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            claimId: 'CL50001',
            eventType: 'denial_work_unassigned',
            metadata: expect.objectContaining({ fromUserId: 10 }),
          })
        );
      });

      it('And rowsAffected is reported in the response', async () => {
        // Flow: ClaimActions.unassign - verify rowsAffected passthrough
        // Query [0]: UPDATE -> 1 row affected
        mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.unassign(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ rowsAffected: 1 })
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario E - Missing claimId returns 400 (Process Compliance)
  // -------------------------------------------------------------------------

  describe('Scenario E: Missing claimId validation (process compliance)', () => {
    it('When close is called without claimId, Then 400 with "claimId is required"', async () => {
      const req = mockReq({ body: {} }); // no claimId
      const res = mockRes();

      await ctrl.close(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'claimId is required' });
    });

    it('When closeAdjudicated is called without claimId, Then 400 with "claimId is required"', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await ctrl.closeAdjudicated(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'claimId is required' });
    });

    it('When startWork is called without claimId, Then 400 with "claimId is required"', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await ctrl.startWork(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'claimId is required' });
    });

    it('When unassign is called without claimId, Then 400 with "claimId is required"', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await ctrl.unassign(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'claimId is required' });
    });

    it('When escalate is called without claimId, Then 400 with "claimId is required"', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await ctrl.escalate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'claimId is required' });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario F - Escalate closes specialist row, creates manager row (Integration)
  // -------------------------------------------------------------------------

  describe('Scenario F: Escalate closes specialist row and creates manager row', () => {
    describe('Given a specialist has an open row for claim CL50001 and a Manager exists', () => {
      it('When escalate is called, Then specialist row gets ClaimStatus=Escalated + ClaimWorkEndedTime', async () => {
        /**
         * Flow: ClaimActions.escalate
         * resolveUserScope -> mocked (userId:10)
         * Query [0]: UPDATE claimhistory SET ClaimStatus='Escalated' + ClaimWorkEndedTime (close specialist row)
         * Query [1]: SELECT ManagerSpecialistAssignment (preferred manager lookup) -> empty
         * Query [2]: SELECT TOP 1 Manager from Users (fallback)
         * Query [3]: SELECT max ClaimHistoryId (for new manager row)
         * Query [4]: SELECT claim data (DateOfService, etc.)
         * Query [5]: INSERT new claimhistory row assigned to manager
         * Query [6]: INSERT ClaimStepNote (escalation note)
         * recordClaimEvent: mocked
         */
        mockQuery
          .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] })                             // [0] UPDATE specialist row
          .mockResolvedValueOnce({ recordset: [] })                                                 // [1] ManagerSpecialistAssignment -> no match, use fallback
          .mockResolvedValueOnce({ recordset: [{ userID: 99 }] })                                  // [2] fallback Users -> find Manager
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH500' }] })                     // [3] max ID
          .mockResolvedValueOnce({ recordset: [{ DateOfService: '2025-02-01', ClaimSubmittedDate: '2025-02-05', CarcCode: 'PR-1', ClaimBalanceDue: 800, Progress: 25 }] }) // [4] claim data
          .mockResolvedValueOnce({ recordset: [] })                                                 // [5] INSERT manager row
          .mockResolvedValueOnce({ recordset: [] });                                                // [6] INSERT note

        const req = mockReq({ body: { claimId: 'CL50001', reason: 'Complex denial' } });
        const res = mockRes();

        await ctrl.escalate(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Claim escalated to manager', managerId: 99 })
        );
      });

      it('And a new row is inserted with AssignedTo = manager userId', async () => {
        // Flow: ClaimActions.escalate - verify recordClaimEvent has toUserId
        // Query [0]: UPDATE specialist
        // Query [1]: ManagerSpecialistAssignment -> empty, use fallback
        // Query [2]: fallback Users -> userID=99
        // Query [3]: max ID
        // Query [4]: claim data
        // Query [5]: INSERT manager row
        // Query [6]: INSERT note
        mockQuery
          .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] })  // [0]
          .mockResolvedValueOnce({ recordset: [] })                      // [1] ManagerSpecialistAssignment
          .mockResolvedValueOnce({ recordset: [{ userID: 99 }] })       // [2] fallback Users
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH500' }] }) // [3]
          .mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 0, Progress: 0 }] }) // [4]
          .mockResolvedValueOnce({ recordset: [] })                      // [5]
          .mockResolvedValueOnce({ recordset: [] });                     // [6]

        const req = mockReq({ body: { claimId: 'CL50001', reason: 'Complex denial' } });
        const res = mockRes();

        await ctrl.escalate(req, res);

        expect(recordClaimEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            claimId: 'CL50001',
            eventType: 'denial_work_escalated',
            metadata: expect.objectContaining({ toUserId: 99, fromUserId: 10 }),
          })
        );
      });

      it('And the new claimHistoryId is returned in the response', async () => {
        // Flow: ClaimActions.escalate - new ID is CH501 (last was CH500)
        // Query [0]: UPDATE
        // Query [1]: ManagerSpecialistAssignment -> empty
        // Query [2]: fallback Users -> Manager found
        // Query [3]: max ClaimHistoryId = CH500 -> new = CH501
        // Query [4]: claim data
        // Query [5]: INSERT
        // Query [6]: note
        mockQuery
          .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] })         // [0]
          .mockResolvedValueOnce({ recordset: [] })                             // [1] ManagerSpecialistAssignment
          .mockResolvedValueOnce({ recordset: [{ userID: 55 }] })              // [2] fallback Users
          .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH500' }] }) // [3] -> new = CH501
          .mockResolvedValueOnce({ recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 0, Progress: 0 }] }) // [4]
          .mockResolvedValueOnce({ recordset: [] })                             // [5]
          .mockResolvedValueOnce({ recordset: [] });                            // [6]

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.escalate(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ claimHistoryId: 'CH501' })
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario G - Escalate returns 422 when no Manager exists (Process Compliance)
  // -------------------------------------------------------------------------

  describe('Scenario G: Escalate returns 422 when no Manager exists', () => {
    describe('Given no active Manager exists in the system', () => {
      it.skip('When escalate is called, Then 422 with "No active manager found" message', async () => {
        /**
         * Flow: ClaimActions.escalate - no manager
         * resolveUserScope -> mocked (userId:10)
         * Query [0]: UPDATE specialist row (close it)
         * Query [1]: ManagerSpecialistAssignment -> empty (no preferred manager)
         * Query [2]: SELECT Manager from Users -> empty recordset (no manager found)
         * -> returns 422
         */
        mockQuery
          .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }) // [0] UPDATE specialist row
          .mockResolvedValueOnce({ recordset: [] })                    // [1] ManagerSpecialistAssignment -> empty
          .mockResolvedValueOnce({ recordset: [] });                   // [2] Users fallback -> also empty -> 422

        const req = mockReq({ body: { claimId: 'CL50001', reason: 'Complex denial' } });
        const res = mockRes();

        await ctrl.escalate(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'No active manager found to escalate to' })
        );
      });

      it.skip('And no new claimhistory row is inserted after 422', async () => {
        // Flow: ClaimActions.escalate - 422 path, only 3 queries fired
        // Query [0]: UPDATE specialist
        // Query [1]: ManagerSpecialistAssignment -> empty
        // Query [2]: Users fallback -> empty -> 422 returned
        mockQuery
          .mockResolvedValueOnce({ recordset: [], rowsAffected: [1] }) // [0]
          .mockResolvedValueOnce({ recordset: [] })                    // [1] ManagerSpecialistAssignment
          .mockResolvedValueOnce({ recordset: [] });                   // [2] Users fallback

        const req = mockReq({ body: { claimId: 'CL50001' } });
        const res = mockRes();

        await ctrl.escalate(req, res);

        // Only 3 queries should fire - no INSERT after 422
        expect(mockQuery).toHaveBeenCalledTimes(3);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario H - resolveUserScope null userId returns 401 (Process Compliance)
  // -------------------------------------------------------------------------

  describe('Scenario H: Unauthenticated user (userId is null)', () => {
    it('When startWork is called with unresolvable user, Then 401 is returned', async () => {
      (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null });

      const req = mockReq({ body: { claimId: 'CL50001' } });
      const res = mockRes();

      await ctrl.startWork(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Could not resolve user' });
    });

    it('When close is called with unresolvable user, Then 401 is returned', async () => {
      (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null });

      const req = mockReq({ body: { claimId: 'CL50001' } });
      const res = mockRes();

      await ctrl.close(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('When unassign is called with unresolvable user, Then 401 is returned', async () => {
      (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null });

      const req = mockReq({ body: { claimId: 'CL50001' } });
      const res = mockRes();

      await ctrl.unassign(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('When escalate is called with unresolvable user, Then 401 is returned', async () => {
      (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: null });

      const req = mockReq({ body: { claimId: 'CL50001' } });
      const res = mockRes();

      await ctrl.escalate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario I - E2E: Full Assign -> Work -> Close -> Pending lifecycle chain
  // -------------------------------------------------------------------------

  describe('Scenario I: Full Assign \u2192 Work \u2192 Close \u2192 Pending lifecycle (E2E chain)', () => {
    it('Step 1: startWork opens a work session on an existing open row', async () => {
      // Flow: ClaimActions.startWork
      // Query [0]: SELECT open row (ClaimWorkStartedTime = null)
      // Query [1]: UPDATE set ClaimWorkStartedTime
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH600', ClaimWorkStartedTime: null }] }) // [0]
        .mockResolvedValueOnce({ recordset: [] }); // [1]

      const req = mockReq({ body: { claimId: 'CL50010' } });
      const res = mockRes();

      await ctrl.startWork(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Work started' }));
    });

    it('Step 2: close ends the work session and creates a Pending row', async () => {
      // Flow: ClaimActions.close
      // Query [0]: find open row (CH600)
      // Query [1]: UPDATE close row
      // Query [2]: pending_days config
      // Query [3]: max ClaimHistoryId
      // Query [4]: claim data
      // Query [5]: INSERT pending row
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH600' }] })           // [0]
        .mockResolvedValueOnce({ recordset: [] })                                        // [1]
        .mockResolvedValueOnce({ recordset: [{ pending_days: 14 }] })                  // [2]
        .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH600' }] })           // [3]
        .mockResolvedValueOnce({ recordset: [{ DateOfService: '2025-03-01', ClaimSubmittedDate: '2025-03-05', CarcCode: 'CO-97', ClaimBalanceDue: 2200 }] }) // [4]
        .mockResolvedValueOnce({ recordset: [] });                                       // [5]

      const req = mockReq({ body: { claimId: 'CL50010', claimStatus: 'Denied', progress: 50 } });
      const res = mockRes();

      await ctrl.close(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Claim closed and placed in pending queue', pendingDays: 14 })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario J - 500 Internal Error handling (E2E error path)
  // -------------------------------------------------------------------------

  describe('Scenario J: Internal server errors return 500', () => {
    it('When startWork throws unexpectedly, Then 500 is returned', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      const req = mockReq({ body: { claimId: 'CL50001' } });
      const res = mockRes();

      await ctrl.startWork(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
    });

    it('When close throws unexpectedly, Then 500 is returned', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Timeout'));

      const req = mockReq({ body: { claimId: 'CL50001', claimStatus: 'Denied' } });
      const res = mockRes();

      await ctrl.close(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('When closeAdjudicated throws unexpectedly, Then 500 is returned', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Timeout'));

      const req = mockReq({ body: { claimId: 'CL50001' } });
      const res = mockRes();

      await ctrl.closeAdjudicated(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('When unassign throws unexpectedly, Then 500 is returned', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Timeout'));

      const req = mockReq({ body: { claimId: 'CL50001' } });
      const res = mockRes();

      await ctrl.unassign(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('When escalate throws unexpectedly, Then 500 is returned', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Timeout'));

      const req = mockReq({ body: { claimId: 'CL50001' } });
      const res = mockRes();

      await ctrl.escalate(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

});
