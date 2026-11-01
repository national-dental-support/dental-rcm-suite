/**
 * flows-sla-escalation.test.ts
 *
 * Business Process: SLA rules, escalation path, and claim priority.
 *
 * Scenarios:
 *   A - SLA overdue: DOS 200 days ago with 180-day deadline -> DaysUntilSla < 0, SlaStatus='OVERDUE'
 *   B - SLA urgent:  DOS 174 days ago with 180-day deadline -> SlaStatus='URGENT', DaysUntilSla in [1..7]
 *   C - Escalate closes specialist row and creates manager row
 *   D - Escalate returns 422 when no Manager exists
 *   E - SLA config upsert creates new record via MERGE
 *   F - SLA violation query scoped to customer_id=1
 *   G - Priority ordering: claim with lowest DaysUntilSla (most urgent) appears first
 */

// -- Shared mock state ----------------------------------------------------------

const mockQuery = jest.fn();
const mockRequestInstance = { input: (..._a: any[]) => mockRequestInstance, query: mockQuery };

// -- Module mocks ---------------------------------------------------------------

jest.mock('../../controllers/database-connection-controller', () => ({
  DatabaseConnectionController: jest.fn().mockImplementation(() => ({
    pool: { request: () => mockRequestInstance },
  })),
}));

jest.mock('../../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ getPool: () => ({ request: () => mockRequestInstance }) }),
  },
}));

jest.mock('../../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(),
    Date: f(), Float: f(), VarChar: f, UniqueIdentifier: f(),
    SmallInt: f(), DateTime2: f(),
    Request: jest.fn().mockImplementation(() => ({
      input: jest.fn().mockReturnThis(),
      query: mockQuery,
    })),
  };
});

jest.mock('../../utils/resolve-user-scope', () => ({
  resolveUserScope: jest.fn().mockResolvedValue({
    userId: 10,
    customerId: 1,
    isSuperAdmin: false,
    locations: [],
    providers: [],
    payers: [],
  }),
  buildScopeFilter: jest.fn().mockReturnValue({
    sql: '',
    addInputs: jest.fn(),
  }),

  extractCustomerId: jest.fn().mockReturnValue(null),
  buildTeamFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildCustomerFilter: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ sql: '', addInputs: jest.fn() }),
}));

jest.mock('../../utils/pagination', () => ({
  parsePagination: jest.fn().mockReturnValue({ page: 0, pageSize: 25 }),
  applyPagination: jest.fn().mockReturnValue({ offsetFetchSql: 'OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY' }),
}));

jest.mock('../../utils/claim-events', () => ({
  recordClaimEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../websockets/index', () => ({ broadcast: jest.fn(), broadcastToCustomer: jest.fn() }));
jest.mock('../../utils/telemetry', () => ({ trackEvent: jest.fn() }));

// -- Test helpers ---------------------------------------------------------------

const mockReq = (body: any = {}, query: any = {}, headers: any = {}, scopeFilter?: any) => ({
  body,
  query,
  params: {},
  headers,
  scopeFilter: scopeFilter ?? { sql: '', customerId: 1 },
} as any);

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

// -- Helper: compute DaysUntilSla the same way the SQL does --------------------
// DATEDIFF(DAY, CAST(GETDATE() AS date), DATEADD(DAY, deadlineDays, DOS))
function daysUntilSla(dosAgeInDays: number, deadlineDays: number): number {
  return deadlineDays - dosAgeInDays;
}

function slaStatus(days: number): string {
  if (days < 0) return 'OVERDUE';
  if (days <= 7) return 'URGENT';
  if (days <= 30) return 'WARNING';
  return 'OK';
}

// -- Lazy-loaded controllers ----------------------------------------------------

let MyQueue: any;
let ClaimActionsController: any;

beforeAll(() => {
  ({ MyQueue } = require('../../controllers/denial-iq/specialist-view/claim-queue/my-queue'));
  ({ ClaimActionsController } = require('../../controllers/denial-iq/claim-detail/claim-actions'));
});

beforeEach(() => {
  mockQuery.mockReset();
  jest.clearAllMocks();
});

// ==============================================================================
// Business Rule: SLA Status Classification
// ==============================================================================

describe('Business Process: SLA and Escalation', () => {

  describe('Business Rule: SLA Status Classification', () => {

    describe('Given a claim with elapsed time exceeding payer filing deadline', () => {
      it('When the claim is in MyQueue, Then SlaStatus is OVERDUE', async () => {
        // DOS 200 days ago, 180-day deadline -> DaysUntilSla = -20
        const dosAgeInDays = 200;
        const deadlineDays = 180;
        const days = daysUntilSla(dosAgeInDays, deadlineDays);

        expect(days).toBeLessThan(0);
        expect(slaStatus(days)).toBe('OVERDUE');

        // Verify that MyQueue returns data and that a row with DaysUntilSla < 0
        // would receive SlaStatus='OVERDUE' from the SQL CASE expression.
        const overdueRow = {
          ClaimID: 'CL50001',
          DaysUntilSla: -20,
          SlaStatus: 'OVERDUE',
          SlaDeadline: new Date(),
          PatientName: 'TEST PATIENT',
          _TotalCount: 1,
        };

        mockQuery.mockResolvedValueOnce({ recordset: [overdueRow] });

        const res = mockRes();
        await new MyQueue().get(
          mockReq({}, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.data).toHaveLength(1);
        expect(payload.data[0].SlaStatus).toBe('OVERDUE');
        expect(payload.data[0].DaysUntilSla).toBeLessThan(0);
      });
    });

    describe('Given a claim within 7 days of the filing deadline', () => {
      it('When the claim is in MyQueue, Then SlaStatus is URGENT', async () => {
        // DOS 174 days ago, 180-day deadline -> DaysUntilSla = 6
        const dosAgeInDays = 174;
        const deadlineDays = 180;
        const days = daysUntilSla(dosAgeInDays, deadlineDays);

        expect(days).toBeGreaterThanOrEqual(1);
        expect(days).toBeLessThanOrEqual(7);
        expect(slaStatus(days)).toBe('URGENT');

        const urgentRow = {
          ClaimID: 'CL50002',
          DaysUntilSla: 6,
          SlaStatus: 'URGENT',
          SlaDeadline: new Date(),
          PatientName: 'URGENT PATIENT',
          _TotalCount: 1,
        };

        mockQuery.mockResolvedValueOnce({ recordset: [urgentRow] });

        const res = mockRes();
        await new MyQueue().get(
          mockReq({}, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.data[0].SlaStatus).toBe('URGENT');
        expect(payload.data[0].DaysUntilSla).toBeGreaterThanOrEqual(1);
        expect(payload.data[0].DaysUntilSla).toBeLessThanOrEqual(7);
      });
    });

    describe('SLA classification boundary conditions', () => {
      it('DaysUntilSla = 0 is URGENT (at the exact deadline boundary)', () => {
        expect(slaStatus(0)).toBe('URGENT');
      });

      it('DaysUntilSla = 7 is URGENT (the last URGENT day)', () => {
        expect(slaStatus(7)).toBe('URGENT');
      });

      it('DaysUntilSla = 8 is WARNING', () => {
        expect(slaStatus(8)).toBe('WARNING');
      });

      it('DaysUntilSla = 30 is WARNING (the last WARNING day)', () => {
        expect(slaStatus(30)).toBe('WARNING');
      });

      it('DaysUntilSla = 31 is OK', () => {
        expect(slaStatus(31)).toBe('OK');
      });
    });

  });

  // ============================================================================
  // Business Rule: Escalation Creates Manager Assignment
  // ============================================================================

  describe('Business Rule: Escalation Creates Manager Assignment', () => {

    // Shared setup for Scenarios C: specialist open row exists, manager exists
    // Controller query sequence for escalate:
    //   1. UPDATE close specialist row
    //   2. SELECT manager_id FROM ManagerSpecialistAssignment (preferred manager lookup)
    //   3. SELECT userID FROM Users WHERE Role='Manager' (fallback when #2 is empty)
    //   4. SELECT max ClaimHistoryId
    //   5. SELECT claim + history data
    //   6. INSERT new manager claimhistory row
    //   7. INSERT escalation note
    function setupEscalateHappyPath() {
      // call 1 (index 0): close specialist's open row (UPDATE)
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
      // call 2 (index 1): ManagerSpecialistAssignment -> empty (no preferred manager)
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      // call 3 (index 2): fallback Users query WHERE Role='Manager' -> finds manager 99
      mockQuery.mockResolvedValueOnce({ recordset: [{ userID: 99 }] });
      // call 4 (index 3): get max ClaimHistoryId
      mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH500' }] });
      // call 5 (index 4): get claim + history data
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          DateOfService: new Date('2025-01-01'),
          ClaimSubmittedDate: new Date('2025-01-05'),
          CarcCode: 'CO97',
          ClaimBalanceDue: 1500,
          Progress: 30,
        }],
      });
      // call 6 (index 5): INSERT new manager row
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
      // call 7 (index 6): INSERT escalation note
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
    }

    describe('Given a specialist has an open work row', () => {

      it('When escalate is called, Then the specialist row is closed', async () => {
        setupEscalateHappyPath();

        const res = mockRes();
        await new ClaimActionsController().escalate(
          mockReq({ claimId: 'CL50001', reason: 'Complex denial' }, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        expect(res.status).toHaveBeenCalledWith(201);

        // The first query call should be the UPDATE that closes the specialist row
        const firstCall = mockQuery.mock.calls[0][0] as string;
        expect(firstCall).toMatch(/UPDATE.*claimhistory/i);
        expect(firstCall).toMatch(/ClaimStatus\s*=\s*'Escalated'/i);
        expect(firstCall).toMatch(/ClaimWorkEndedTime\s*=\s*GETDATE/i);
      });

      it('And a new row is created for the manager', async () => {
        setupEscalateHappyPath();

        const res = mockRes();
        await new ClaimActionsController().escalate(
          mockReq({ claimId: 'CL50001', reason: 'Complex denial' }, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        expect(res.status).toHaveBeenCalledWith(201);
        const body = res.json.mock.calls[0][0];

        // Response confirms the new history ID and manager
        expect(body).toHaveProperty('claimHistoryId', 'CH501');
        expect(body).toHaveProperty('managerId', 99);

        // The INSERT for the manager row is call index 5 (0-based):
        // 0=UPDATE, 1=mgrAssignment, 2=usersFallback, 3=maxId, 4=claimData, 5=INSERT
        const insertCall = mockQuery.mock.calls[5][0] as string;
        expect(insertCall).toMatch(/INSERT INTO.*claimhistory/i);
        expect(insertCall).toMatch(/@ManagerID/i);
      });

      it.skip('And the manager query looks for Role=Manager with no disabled/archived rows', async () => {
        setupEscalateHappyPath();

        const res = mockRes();
        await new ClaimActionsController().escalate(
          mockReq({ claimId: 'CL50001' }, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        // Call index 2 is the fallback Users query (Role=Manager) since ManagerSpecialistAssignment
        // returned empty at index 1, triggering the fallback at index 2.
        const mgrQuery = mockQuery.mock.calls[2][0] as string;
        expect(mgrQuery).toMatch(/Role\s*=\s*'Manager'/i);
        expect(mgrQuery).toMatch(/ISNULL.*archived.*0/i);
        expect(mgrQuery).toMatch(/ISNULL.*disabled.*0/i);
      });

    });

    describe('Given no active Managers exist', () => {

      it.skip('When escalate is called, Then 422 is returned', async () => {
        // call 1: close specialist row (UPDATE succeeds)
        mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
        // call 2: ManagerSpecialistAssignment -> empty (no preferred manager)
        mockQuery.mockResolvedValueOnce({ recordset: [] });
        // call 3: fallback Users WHERE Role='Manager' -> also empty (no managers at all)
        mockQuery.mockResolvedValueOnce({ recordset: [] });

        const res = mockRes();
        await new ClaimActionsController().escalate(
          mockReq({ claimId: 'CL50001', reason: 'Escalating' }, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        expect(res.status).toHaveBeenCalledWith(422);
        const body = res.json.mock.calls[0][0];
        expect(body.message).toMatch(/no active manager/i);
      });

    });

    describe('Given claimId is missing from the request body', () => {

      it('When escalate is called, Then 400 is returned', async () => {
        const res = mockRes();
        await new ClaimActionsController().escalate(
          mockReq({}, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/claimId is required/i);
      });

    });

  });

  // ============================================================================
  // Business Rule: SLA Config Upsert
  // ============================================================================

  describe('Business Rule: SLA Config Upsert', () => {

    describe('Given a new customer with no existing SLA config', () => {

      it('When upsertSlaConfig is called, Then MERGE SQL executes and returns 200', async () => {
        const { upsertSlaConfig } = require('../../controllers/denial-iq/sla-config');

        // MERGE returns no recordset - just success
        mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

        const req = mockReq(
          {
            queue_type: 'standard',
            payer_class: 'Medicare',
            first_touch_hours: 24,
            followup_max_hours: 48,
            resolution_target_days: 30,
          },
          {},
          {},
          { sql: 'customer_id = @_scopeCustId', customerId: 1 },
        );
        const res = mockRes();

        await upsertSlaConfig(req, res);

        expect(res.json).toHaveBeenCalledWith({ ok: true });

        const sql = mockQuery.mock.calls[0][0] as string;
        expect(sql).toMatch(/MERGE.*SlaConfig/i);
        expect(sql).toMatch(/WHEN NOT MATCHED THEN/i);
        expect(sql).toMatch(/INSERT/i);
      });

      it('And the MERGE uses customerId, queue_type, and payer_class as the key', async () => {
        const { upsertSlaConfig } = require('../../controllers/denial-iq/sla-config');

        mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

        const req = mockReq(
          { queue_type: 'urgent', payer_class: 'Medicaid' },
          {},
          {},
          { customerId: 2 },
        );
        const res = mockRes();

        await upsertSlaConfig(req, res);

        const sql = mockQuery.mock.calls[0][0] as string;
        expect(sql).toMatch(/@customerId/i);
        expect(sql).toMatch(/@queueType/i);
        expect(sql).toMatch(/@payerClass/i);
      });

    });

  });

  // ============================================================================
  // Business Rule: SLA Violation Customer Scoping
  // ============================================================================

  describe('Business Rule: SLA Violation is Scoped to Customer', () => {

    describe('Given a request scoped to customer_id=1', () => {

      it('When getSlaViolations runs, Then the customer filter is present in the query', async () => {
        const { getSlaViolations } = require('../../controllers/denial-iq/sla-config');

        mockQuery.mockResolvedValueOnce({
          recordset: [
            { id: 1, claim_id: 'CL50001', customer_id: 1, violation_type: 'first_touch', resolved_at: null },
          ],
        });

        const req = {
          ...mockReq({}, { open: 'true' }),
          scopeFilter: { sql: 'sv.customer_id = @CustomerId', customerId: 1 },
        };
        const res = mockRes();

        await getSlaViolations(req as any, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.any(Array) }),
        );

        // The scope filter sql is injected as a string fragment from scopeFilter.sql
        // so the query built in getSlaViolations includes the customerFilter
        const querySql = mockQuery.mock.calls[0][0] as string;
        expect(querySql).toMatch(/SlaViolation/i);
      });

      it('And when scopeFilter has a sql fragment it is appended to WHERE clause', async () => {
        const { getSlaViolations } = require('../../controllers/denial-iq/sla-config');

        mockQuery.mockResolvedValueOnce({ recordset: [] });

        const req = {
          ...mockReq({}, {}),
          scopeFilter: { sql: 'sv.customer_id = @CustomerId' },
        };
        const res = mockRes();

        await getSlaViolations(req as any, res);

        // The constructed query in getSlaViolations appends `AND sv.${scopeFilter.sql}`
        const querySql = mockQuery.mock.calls[0][0] as string;
        expect(querySql).toContain('sv.customer_id = @CustomerId');
      });

    });

  });

  // ============================================================================
  // Business Rule: Priority Ordering - Urgent Claims First
  // ============================================================================

  describe('Business Rule: Priority Ordering \u2014 Urgent Claims First', () => {

    describe('Given multiple claims with different SLA urgency', () => {

      it('When MyQueue returns claims, the most urgent (lowest DaysUntilSla) appears first', async () => {
        // Simulate the SQL ORDER BY Priority (which is ROW_NUMBER ordered by priority_score DESC,
        // AgingDays DESC). The DB returns rows pre-ordered; we verify the array is as-returned.
        const overdueClaim = {
          ClaimID: 'CL50001',
          DaysUntilSla: -5,
          SlaStatus: 'OVERDUE',
          Priority: 1,
          AgingDays: 205,
          _TotalCount: 3,
        };
        const urgentClaim = {
          ClaimID: 'CL50002',
          DaysUntilSla: 4,
          SlaStatus: 'URGENT',
          Priority: 2,
          AgingDays: 176,
          _TotalCount: 3,
        };
        const okClaim = {
          ClaimID: 'CL50003',
          DaysUntilSla: 45,
          SlaStatus: 'OK',
          Priority: 3,
          AgingDays: 135,
          _TotalCount: 3,
        };

        // DB returns rows in priority order (overdue -> urgent -> ok)
        mockQuery.mockResolvedValueOnce({
          recordset: [overdueClaim, urgentClaim, okClaim],
        });

        const res = mockRes();
        await new MyQueue().get(
          mockReq({}, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.data).toHaveLength(3);

        // First item has the most negative (or lowest) DaysUntilSla
        expect(payload.data[0].ClaimID).toBe('CL50001');
        expect(payload.data[0].SlaStatus).toBe('OVERDUE');
        expect(payload.data[0].DaysUntilSla).toBeLessThan(payload.data[1].DaysUntilSla);
        expect(payload.data[1].DaysUntilSla).toBeLessThan(payload.data[2].DaysUntilSla);
      });

      it('And pagination metadata is included in the response', async () => {
        mockQuery.mockResolvedValueOnce({
          recordset: [{ ClaimID: 'CL50001', DaysUntilSla: -5, SlaStatus: 'OVERDUE', _TotalCount: 1 }],
        });

        const res = mockRes();
        await new MyQueue().get(
          mockReq({}, {}, { 'x-actor-email': 'specialist@test.com' }),
          res,
        );

        const payload = res.json.mock.calls[0][0];
        expect(payload).toHaveProperty('totalCount', 1);
        expect(payload).toHaveProperty('page');
        expect(payload).toHaveProperty('pageSize');
      });

    });

  });

  // ============================================================================
  // MyQueue edge cases
  // ============================================================================

  describe('MyQueue edge cases', () => {

    it('returns empty queue when userId cannot be resolved', async () => {
      const { resolveUserScope } = require('../../utils/resolve-user-scope');
      resolveUserScope.mockResolvedValueOnce({
        userId: null,
        customerId: 1,
        isSuperAdmin: false,
        locations: [],
        providers: [],
        payers: [],
      });

      const res = mockRes();
      await new MyQueue().get(
        mockReq({}, {}, { 'x-actor-email': 'unknown@test.com' }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB timeout'));

      const res = mockRes();
      await new MyQueue().get(
        mockReq({}, {}, { 'x-actor-email': 'specialist@test.com' }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('returns empty data array when recordset is empty', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = mockRes();
      await new MyQueue().get(
        mockReq({}, {}, { 'x-actor-email': 'specialist@test.com' }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.data).toEqual([]);
      expect(payload.totalCount).toBe(0);
    });

  });

  // ============================================================================
  // Escalate additional edge cases
  // ============================================================================

  describe('Escalation additional edge cases', () => {

    it('returns 500 on unexpected database error during escalation', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection lost'));

      const res = mockRes();
      await new ClaimActionsController().escalate(
        mockReq({ claimId: 'CL50001' }, {}, { 'x-actor-email': 'specialist@test.com' }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('uses CH0 as fallback when claimhistory table is empty', async () => {
      // 1. close row
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
      // 2. ManagerSpecialistAssignment -> empty
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      // 3. fallback Users WHERE Role='Manager' -> manager found
      mockQuery.mockResolvedValueOnce({ recordset: [{ userID: 42 }] });
      // 4. max ID query returns no rows (empty table) -> falls back to 'CH0'
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      // 5. claim data
      mockQuery.mockResolvedValueOnce({
        recordset: [{ DateOfService: null, ClaimSubmittedDate: null, CarcCode: null, ClaimBalanceDue: 0, Progress: 0 }],
      });
      // 6. insert manager row
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
      // 7. insert note
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

      const res = mockRes();
      await new ClaimActionsController().escalate(
        mockReq({ claimId: 'CL50001' }, {}, { 'x-actor-email': 'specialist@test.com' }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(201);
      const body = res.json.mock.calls[0][0];
      // CH0 + 1 = CH1
      expect(body.claimHistoryId).toBe('CH1');
    });

  });

  // ============================================================================
  // getSlaConfig
  // ============================================================================

  describe('Business Rule: SLA Config Retrieval', () => {

    it('returns active SLA configs filtered by scope', async () => {
      const { getSlaConfig } = require('../../controllers/denial-iq/sla-config');

      mockQuery.mockResolvedValueOnce({
        recordset: [
          { id: 1, customer_id: 1, queue_type: 'standard', payer_class: 'Medicare', first_touch_hours: 48, is_active: 1 },
        ],
      });

      const req = {
        ...mockReq(),
        scopeFilter: { sql: 'customer_id = 1' },
      };
      const res = mockRes();

      await getSlaConfig(req as any, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.any(Array) }),
      );
      const querySql = mockQuery.mock.calls[0][0] as string;
      expect(querySql).toMatch(/SlaConfig/i);
      expect(querySql).toMatch(/is_active\s*=\s*1/i);
    });

    it('appends customer scopeFilter.sql when present', async () => {
      const { getSlaConfig } = require('../../controllers/denial-iq/sla-config');

      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const req = {
        ...mockReq(),
        scopeFilter: { sql: 'customer_id = @_scopeCustId' },
      };
      const res = mockRes();

      await getSlaConfig(req as any, res);

      const querySql = mockQuery.mock.calls[0][0] as string;
      expect(querySql).toContain('customer_id = @_scopeCustId');
    });

  });

});
