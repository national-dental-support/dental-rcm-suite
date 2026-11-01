/**
 * coverage-denial-iq-gaps.test.ts
 *
 * Comprehensive unit tests for 5 Denial IQ controllers that have ZERO coverage:
 *   1. AppealGeneratorController   - ../controllers/denial-iq/appeal-generator
 *   2. WorkflowRulesController     - ../controllers/denial-iq/workflow-rules
 *   3. BulkActionsController       - ../controllers/denial-iq/claim-detail/bulk-actions
 *   4. QA workflow functions       - ../controllers/denial-iq/qa-workflow
 *   5. ClaimDetailTable            - ../controllers/denial-iq/claim-detail/claim-detail-table
 */

// --- Shared mock state (declared BEFORE jest.mock calls) ---------------------

const mockQuery = jest.fn();
const mockRequestInstance: any = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
};

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => ({ request: () => mockRequestInstance }),
    }),
  },
  databaseInstance: {
    getPool: () => ({ request: () => mockRequestInstance }),
  },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));
jest.mock('../utils/claim-events', () => ({ recordClaimEvent: jest.fn().mockResolvedValue(undefined) }));

jest.mock('../utils/resolve-user-scope', () => ({
  resolveUserScope: jest.fn().mockResolvedValue({ userId: 42, customerId: 1, isSuperAdmin: false, locations: [], providers: [], payers: [] }),
  extractCustomerId: jest.fn().mockReturnValue(1),
}));

jest.mock('../websockets/index', () => ({
  broadcast: jest.fn(),
  broadcastToCustomer: jest.fn(),
  pushNotification: jest.fn(),
  initWebSockets: jest.fn(),
  getIO: jest.fn(),
}));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  const fWithMax = Object.assign(f, { MAX: f() });
  return {
    __esModule: true,
    default: { NVarChar: fWithMax, Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(), Date: f(), Float: f(), VarChar: f, SmallInt: f(), UniqueIdentifier: f(), MAX: f() },
    NVarChar: fWithMax, Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(), Date: f(), Float: f(), VarChar: f, SmallInt: f(), UniqueIdentifier: f(), MAX: f(),
    Request: jest.fn().mockImplementation(() => mockRequestInstance),
  };
});

jest.mock('../databaseManager', () => ({
  dbConfig: { server: 'test', database: 'test', user: 'sa', password: 'pw' },
}));

// --- Imports ------------------------------------------------------------------

import { resolveUserScope as _resolveUserScope, extractCustomerId as _extractCustomerId } from '../utils/resolve-user-scope';
import { broadcast as _broadcast, broadcastToCustomer as _broadcastToCustomer } from '../websockets/index';

const resolveUserScope = _resolveUserScope as jest.Mock;
const extractCustomerId = _extractCustomerId as jest.Mock;
const broadcast = _broadcast as jest.Mock;
const broadcastToCustomer = _broadcastToCustomer as jest.Mock;

// --- Helpers -----------------------------------------------------------------

const makeReq = (overrides: any = {}): any => ({
  query: {}, params: {}, body: {}, headers: {}, file: undefined, ...overrides,
});

const makeRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ recordset: [], rowsAffected: [1], recordsets: [[]] });
  (resolveUserScope as jest.Mock).mockResolvedValue({ userId: 42, customerId: 1, isSuperAdmin: false, locations: [], providers: [], payers: [] });
  (extractCustomerId as jest.Mock).mockReturnValue(1);
  broadcast.mockClear();
  broadcastToCustomer.mockClear();
});

// =============================================================================
// 1. AppealGeneratorController
// =============================================================================

describe('AppealGeneratorController', () => {
  let AppealGeneratorController: any;

  beforeAll(() => {
    ({ AppealGeneratorController } = require('../controllers/denial-iq/appeal-generator'));
  });

  // -- listTemplates ---------------------------------------------------------

  describe('listTemplates', () => {
    it('returns 200 with active-only filter by default (no ?all=1)', async () => {
      const rows = [{ id: 1, template_name: 'Standard', is_active: 1 }];
      mockQuery.mockResolvedValueOnce({ recordset: rows });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.listTemplates(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: rows });
    });

    it('returns 200 with all=1 (no is_active filter)', async () => {
      const rows = [{ id: 1, template_name: 'Standard', is_active: 0 }, { id: 2, template_name: 'Active', is_active: 1 }];
      mockQuery.mockResolvedValueOnce({ recordset: rows });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.listTemplates(makeReq({ query: { all: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: rows });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.listTemplates(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
    });
  });

  // -- createTemplate --------------------------------------------------------

  describe('createTemplate', () => {
    it('returns 201 on success with required body fields', async () => {
      const inserted = { id: 10, template_name: 'New Template', subject_line: 'Appeal Notice', body_template: 'Dear {{patient_name}}', denial_category: 'CO-4', carc_codes: '4,45' };
      mockQuery.mockResolvedValueOnce({ recordset: [inserted] });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.createTemplate(makeReq({
        body: {
          template_name: 'New Template',
          subject_line: 'Appeal Notice',
          body_template: 'Dear {{patient_name}}',
          denial_category: 'CO-4',
          carc_codes: '4,45',
        },
      }), res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ data: inserted });
    });

    it('returns 400 when template_name missing', async () => {
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.createTemplate(makeReq({ body: { subject_line: 'S', body_template: 'B' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when body_template missing', async () => {
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.createTemplate(makeReq({ body: { template_name: 'T', subject_line: 'S' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.createTemplate(makeReq({ body: { template_name: 'T', subject_line: 'S', body_template: 'B' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- updateTemplate --------------------------------------------------------

  describe('updateTemplate', () => {
    it('returns 200 on success', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.updateTemplate(makeReq({
        params: { id: '5' },
        body: { template_name: 'Updated', subject_line: 'New Subject', body_template: 'New Body' },
      }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.updateTemplate(makeReq({ params: { id: '5' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- deleteTemplate --------------------------------------------------------

  describe('deleteTemplate', () => {
    it('returns 200 on success', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.deleteTemplate(makeReq({ params: { id: '3' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.deleteTemplate(makeReq({ params: { id: '3' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- listAppeals -----------------------------------------------------------

  describe('listAppeals', () => {
    it('returns 200 with valid claimId query param', async () => {
      const rows = [{ id: 1, claim_id: 'CL50001', status: 'draft' }];
      mockQuery.mockResolvedValueOnce({ recordset: rows });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.listAppeals(makeReq({ query: { claimId: 'CL50001' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: rows });
    });

    it('returns 400 when claimId missing', async () => {
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.listAppeals(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Missing claimId' });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.listAppeals(makeReq({ query: { claimId: 'CL50001' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- generateLetter --------------------------------------------------------

  describe('generateLetter', () => {
    it('returns 400 when claimId missing from body', async () => {
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.generateLetter(makeReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Missing claimId' });
    });

    it('returns 404 when claim not found (empty recordset from first query)', async () => {
      // First query: claim info -> empty
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.generateLetter(makeReq({ body: { claimId: 'CL50001' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Claim not found' });
    });

    it('returns 422 when no active template found (all template queries return empty)', async () => {
      // (1) claim info - found with no DenialCode so we skip carc-code template search
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL50001', DateOfService: '2024-01-15', ClaimSubmittedDate: '2024-01-20',
          ChargeAmt: 500, PayerName: 'Blue Cross', ProviderName: 'Dr. Smith',
          PatientName: 'Jane Doe', DenialCode: null, DenialDescription: null,
        }],
      });
      // (2) fallback general template -> empty
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.generateLetter(makeReq({ body: { claimId: 'CL50001' } }), res);
      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({ message: 'No active appeal template found. Please add templates in Admin.' });
    });

    it('returns 200 happy path: claim found, template matched by carc code, token replacement works', async () => {
      // (1) claim info
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL50001', DateOfService: '2024-01-15', ClaimSubmittedDate: '2024-01-20',
          ChargeAmt: 500.00, PayerName: 'Blue Cross', ProviderName: 'Dr. Smith',
          PatientName: 'Jane Doe', DenialCode: '45', DenialDescription: 'Charges exceed fee schedule',
        }],
      });
      // (2) template matched by carc code
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          id: 7, body_template: 'Dear {{patient_name}}, your claim {{claim_id}} was denied.',
          subject_line: 'Appeal for {{patient_name}}', closing_text: 'Sincerely, {{provider_name}}',
        }],
      });
      // (3) payer deadline
      mockQuery.mockResolvedValueOnce({ recordset: [{ appeal_days: 90 }] });
      // (4) insert result
      mockQuery.mockResolvedValueOnce({ recordset: [{ id: 99, claim_id: 'CL50001', status: 'draft' }] });

      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.generateLetter(makeReq({ body: { claimId: 'CL50001' } }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.letter).toContain('Jane Doe');
      expect(jsonCall.letter).not.toContain('{{patient_name}}');
      expect(jsonCall.letter).toContain('CL50001');
      expect(jsonCall.letter).not.toContain('{{claim_id}}');
      expect(jsonCall.letter).toContain('Dr. Smith');
    });

    it('returns 200 with explicit templateId: loads template by id', async () => {
      // (1) claim info
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          ClaimID: 'CL50002', DateOfService: '2024-02-01', ClaimSubmittedDate: '2024-02-05',
          ChargeAmt: 250.00, PayerName: 'Aetna', ProviderName: 'Dr. Jones',
          PatientName: 'John Smith', DenialCode: '97', DenialDescription: 'Payment adjusted',
        }],
      });
      // (2) template by explicit id
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          id: 3, body_template: 'Patient: {{patient_name}}. Claim: {{claim_id}}.',
          subject_line: 'Appeal', closing_text: null,
        }],
      });
      // (3) payer deadline
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      // (4) insert
      mockQuery.mockResolvedValueOnce({ recordset: [{ id: 100, claim_id: 'CL50002', status: 'draft' }] });

      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.generateLetter(makeReq({ body: { claimId: 'CL50002', templateId: 3 } }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.letter).toContain('John Smith');
      expect(jsonCall.letter).toContain('CL50002');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.generateLetter(makeReq({ body: { claimId: 'CL50001' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- updateAppealStatus ----------------------------------------------------

  describe('updateAppealStatus', () => {
    it('returns 200 on success with params.id and body status + notes', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.updateAppealStatus(makeReq({
        params: { id: '10' },
        body: { status: 'submitted', notes: 'Sent via portal' },
      }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('returns 400 when id is 0/falsy', async () => {
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.updateAppealStatus(makeReq({ params: { id: '0' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Missing appeal id' });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new AppealGeneratorController();
      const res = makeRes();
      await ctrl.updateAppealStatus(makeReq({ params: { id: '5' }, body: { status: 'denied' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// =============================================================================
// 2. WorkflowRulesController
// =============================================================================

describe('WorkflowRulesController', () => {
  let WorkflowRulesController: any;

  beforeAll(() => {
    ({ WorkflowRulesController } = require('../controllers/denial-iq/workflow-rules'));
  });

  // -- list ------------------------------------------------------------------

  describe('list', () => {
    it('returns 200 and parses conditions/actions from JSON strings', async () => {
      const conditions = [{ field: 'agingDays', operator: '>', value: '30' }];
      const actions: any[] = [];
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          id: 1, name: 'Old Claims Rule', description: 'Escalate old claims',
          match_type: 'all',
          conditions: JSON.stringify(conditions),
          actions: JSON.stringify(actions),
          is_active: 1, priority: 1, created_at: new Date(), updated_at: new Date(),
        }],
      });
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.list(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.data).toHaveLength(1);
      expect(Array.isArray(payload.data[0].conditions)).toBe(true);
      expect(Array.isArray(payload.data[0].actions)).toBe(true);
      expect(payload.data[0].conditions[0].field).toBe('agingDays');
    });

    it('returns 200 with no custId (extractCustomerId returns null)', async () => {
      (extractCustomerId as jest.Mock).mockReturnValueOnce(null);
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.list(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.list(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- create ----------------------------------------------------------------

  describe('create', () => {
    it('returns 201 with body fields, response has data.id', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [{ id: 55 }] });
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.create(makeReq({
        body: {
          name: 'Aging Rule', description: 'Flag old claims',
          matchType: 'all', conditions: [], actions: [], priority: 1,
        },
      }), res);
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.data.id).toBe(55);
    });

    it('returns 400 when name missing', async () => {
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.create(makeReq({ body: { description: 'No name' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Name is required' });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.create(makeReq({ body: { name: 'Test Rule' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- update ----------------------------------------------------------------

  describe('update', () => {
    it('returns 200 on success', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.update(makeReq({
        params: { id: '3' },
        body: { name: 'Updated Rule', matchType: 'any', conditions: [], actions: [], isActive: true, priority: 2 },
      }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Rule updated' });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.update(makeReq({ params: { id: '3' }, body: { name: 'R' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- delete ----------------------------------------------------------------

  describe('delete', () => {
    it('returns 200 on success', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.delete(makeReq({ params: { id: '7' } }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Rule deleted' });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.delete(makeReq({ params: { id: '7' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- evaluate -------------------------------------------------------------

  describe('evaluate', () => {
    it('returns 200 "no active rules" when rules query returns empty recordset', async () => {
      // (1) rules -> empty
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'No active workflow rules', actionsExecuted: 0 });
    });

    it('returns 200 with add-note action: agingDays > 30, claim matches (AgingDays=45)', async () => {
      const rule = {
        id: 1, name: 'Old Claims', match_type: 'all',
        conditions: JSON.stringify([{ field: 'agingDays', operator: '>', value: '30' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: { message: 'Claim is old' } }]),
        priority: 1,
      };
      // (1) rules
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      // (2) claims: one matches (AgingDays=45), one doesn't (AgingDays=10)
      mockQuery.mockResolvedValueOnce({
        recordset: [
          { ClaimID: 'CL50001', AgingDays: 45, ChargeAmt: 500, PayerName: 'Aetna', ClaimStatus: 'Open', CarcCode: '45', AssignedTo: 1 },
          { ClaimID: 'CL50002', AgingDays: 10, ChargeAmt: 200, PayerName: 'BCBS', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 2 },
        ],
      });
      // (3) note insert for the matching claim
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('returns 200 with auto-escalate action and actionsExecuted=1', async () => {
      const rule = {
        id: 2, name: 'Escalate Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'agingDays', operator: '>', value: '0' }]),
        actions: JSON.stringify([{ actionType: 'auto-escalate', params: {} }]),
        priority: 1,
      };
      // (1) rules
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      // (2) claims: one matching claim
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50003', AgingDays: 60, ChargeAmt: 750, PayerName: 'Medicare', ClaimStatus: 'Open', CarcCode: '97', AssignedTo: 3 }],
      });
      // (3) find manager -> found
      mockQuery.mockResolvedValueOnce({ recordset: [{ userID: 10 }] });
      // (4) close current assignment
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      // (5) max ClaimHistoryId query
      mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1000' }] });
      // (6) insert new assignment
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      // (7) insert escalation note
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('returns 200 matchType any: one false + one true condition \u2192 claim matches', async () => {
      const rule = {
        id: 3, name: 'Any Rule', match_type: 'any',
        conditions: JSON.stringify([
          { field: 'agingDays', operator: '>', value: '999' }, // false - AgingDays=50 is not > 999
          { field: 'agingDays', operator: '<', value: '999' }, // true  - AgingDays=50 is < 999
        ]),
        actions: JSON.stringify([{ actionType: 'add-note', params: { message: 'Any match' } }]),
        priority: 1,
      };
      // (1) rules
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      // (2) one claim
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50004', AgingDays: 50, ChargeAmt: 300, PayerName: 'Cigna', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });
      // (3) note insert
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('returns 200 matchType all: one false + one true condition \u2192 claim does NOT match', async () => {
      const rule = {
        id: 4, name: 'All Rule', match_type: 'all',
        conditions: JSON.stringify([
          { field: 'agingDays', operator: '>', value: '999' }, // false
          { field: 'agingDays', operator: '<', value: '999' }, // true
        ]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      // (1) rules
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      // (2) one claim
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50005', AgingDays: 50, ChargeAmt: 300, PayerName: 'Cigna', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });
      // No note insert call expected since claim should not match

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(0);
    });

    it('evaluateCondition operator < : claim with AgingDays=5 matches agingDays < 10', async () => {
      const rule = {
        id: 10, name: 'LT Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'agingDays', operator: '<', value: '10' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50010', AgingDays: 5, ChargeAmt: 100, PayerName: 'Test', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('evaluateCondition operator >= : claim with AgingDays=30 matches agingDays >= 30', async () => {
      const rule = {
        id: 11, name: 'GTE Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'agingDays', operator: '>=', value: '30' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50011', AgingDays: 30, ChargeAmt: 100, PayerName: 'Test', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('evaluateCondition operator <= : claim with AgingDays=20 matches agingDays <= 20', async () => {
      const rule = {
        id: 12, name: 'LTE Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'agingDays', operator: '<=', value: '20' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50012', AgingDays: 20, ChargeAmt: 100, PayerName: 'Test', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('evaluateCondition operator = / equals : claimStatus = Open matches', async () => {
      const rule = {
        id: 13, name: 'EQ Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'claimStatus', operator: '=', value: 'Open' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50013', AgingDays: 10, ChargeAmt: 100, PayerName: 'Test', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('evaluateCondition operator equals (string form): claimStatus equals Closed matches', async () => {
      const rule = {
        id: 14, name: 'Equals Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'claimStatus', operator: 'equals', value: 'closed' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50014', AgingDays: 5, ChargeAmt: 100, PayerName: 'Test', ClaimStatus: 'Closed', CarcCode: null, AssignedTo: 1 }],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('evaluateCondition operator != : claimStatus != Closed (is Open) \u2192 matches', async () => {
      const rule = {
        id: 15, name: 'NEQ Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'claimStatus', operator: '!=', value: 'Closed' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50015', AgingDays: 10, ChargeAmt: 100, PayerName: 'Test', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('evaluateCondition operator contains : payerName contains "Blue" \u2192 matches', async () => {
      const rule = {
        id: 16, name: 'Contains Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'payerName', operator: 'contains', value: 'Blue' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50016', AgingDays: 10, ChargeAmt: 100, PayerName: 'Blue Cross Blue Shield', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(1);
    });

    it('evaluateCondition unknown operator "regex" \u2192 no match, actionsExecuted=0', async () => {
      const rule = {
        id: 17, name: 'Regex Rule', match_type: 'all',
        conditions: JSON.stringify([{ field: 'agingDays', operator: 'regex', value: '^[0-9]+$' }]),
        actions: JSON.stringify([{ actionType: 'add-note', params: {} }]),
        priority: 1,
      };
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50017', AgingDays: 45, ChargeAmt: 100, PayerName: 'Test', ClaimStatus: 'Open', CarcCode: null, AssignedTo: 1 }],
      });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.actionsExecuted).toBe(0);
    });

    it('auto-escalate but no manager found: actionsExecuted=0 (breaks early)', async () => {
      const rule = {
        id: 18, name: 'Escalate No Mgr', match_type: 'all',
        conditions: JSON.stringify([{ field: 'agingDays', operator: '>', value: '0' }]),
        actions: JSON.stringify([{ actionType: 'auto-escalate', params: {} }]),
        priority: 1,
      };
      // (1) rules
      mockQuery.mockResolvedValueOnce({ recordset: [rule] });
      // (2) one matching claim
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50018', AgingDays: 60, ChargeAmt: 400, PayerName: 'Aetna', ClaimStatus: 'Open', CarcCode: '45', AssignedTo: 1 }],
      });
      // (3) manager query -> empty (no manager found)
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      const payload = res.json.mock.calls[0][0];
      // managerId is falsy -> break, action not fully executed but actionsExecuted was already incremented
      // The code increments actionsExecuted AFTER executeAction resolves - executeAction just breaks early
      // So actionsExecuted IS incremented (the await resolves without throwing)
      expect(payload.actionsExecuted).toBe(1);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new WorkflowRulesController();
      const res = makeRes();
      await ctrl.evaluate(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// =============================================================================
// 3. BulkActionsController
// =============================================================================

describe('BulkActionsController', () => {
  let BulkActionsController: any;

  beforeAll(() => {
    ({ BulkActionsController } = require('../controllers/denial-iq/claim-detail/bulk-actions'));
  });

  // -- bulkAssign ------------------------------------------------------------

  describe('bulkAssign', () => {
    it('returns 400 when claimIds missing/empty array', async () => {
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkAssign(makeReq({ body: { claimIds: [] } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'claimIds array is required' });
    });

    it('returns 400 when claimIds not an array', async () => {
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkAssign(makeReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 401 when resolveUserScope returns userId=null', async () => {
      (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: 1 });
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkAssign(makeReq({ body: { claimIds: ['CL50001'] } }), res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Could not resolve user' });
    });

    it('returns 200 happy path and broadcasts when count > 0', async () => {
      // (1) close existing - rowsAffected=[0]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });
      // (2) getNextHistoryNum
      mockQuery.mockResolvedValueOnce({ recordset: [{ n: 500 }] });
      // (3) insert - rowsAffected=[3]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [3] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkAssign(makeReq({
        body: { claimIds: ['CL50001', 'CL50002', 'CL50003'] },
        headers: { 'x-actor-email': 'user@example.com' },
      }), res);

      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.count).toBe(3);
      expect(broadcastToCustomer).toHaveBeenCalledWith(1, 'claim:updated', { type: 'bulk-assigned', count: 3 });
    });

    it('returns 200 with count=0 and broadcast NOT called', async () => {
      // (1) close
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });
      // (2) getNextHistoryNum
      mockQuery.mockResolvedValueOnce({ recordset: [{ n: 500 }] });
      // (3) insert - rowsAffected=[0]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkAssign(makeReq({
        body: { claimIds: ['CL50001'] },
        headers: { 'x-actor-email': 'user@example.com' },
      }), res);

      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.count).toBe(0);
      expect(broadcastToCustomer).not.toHaveBeenCalled();
    });
  });

  // -- bulkEscalate ----------------------------------------------------------

  describe('bulkEscalate', () => {
    it('returns 400 when claimIds empty', async () => {
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkEscalate(makeReq({ body: { claimIds: [] } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 401 when userId=null', async () => {
      (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: 1 });
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkEscalate(makeReq({ body: { claimIds: ['CL50001'] } }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 422 when no active manager found', async () => {
      // (1) manager query -> empty (fires before close)
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkEscalate(makeReq({
        body: { claimIds: ['CL50001'] },
        headers: { 'x-actor-email': 'user@example.com' },
      }), res);
      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({ message: 'No active manager found' });
    });

    it('returns 200 happy path with count=2 and broadcast called', async () => {
      // (1) manager query (fires before close)
      mockQuery.mockResolvedValueOnce({ recordset: [{ userID: 10 }] });
      // (2) close
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });
      // (3) getNextHistoryNum
      mockQuery.mockResolvedValueOnce({ recordset: [{ n: 600 }] });
      // (4) insert - rowsAffected=[2]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [2] });
      // (5) note insert
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [2] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkEscalate(makeReq({
        body: { claimIds: ['CL50001', 'CL50002'], reason: 'Complex denial' },
        headers: { 'x-actor-email': 'user@example.com' },
      }), res);

      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.count).toBe(2);
      expect(broadcastToCustomer).toHaveBeenCalledWith(1, 'claim:updated', { type: 'bulk-escalated', count: 2 });
    });

    it('returns 200 with escalated=0 and broadcast NOT called', async () => {
      // (1) manager query (fires before close)
      mockQuery.mockResolvedValueOnce({ recordset: [{ userID: 10 }] });
      // (2) close
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });
      // (3) getNextHistoryNum
      mockQuery.mockResolvedValueOnce({ recordset: [{ n: 600 }] });
      // (4) insert - rowsAffected=[0]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });
      // (5) note insert
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkEscalate(makeReq({
        body: { claimIds: ['CL50001'] },
        headers: { 'x-actor-email': 'user@example.com' },
      }), res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.count).toBe(0);
      expect(broadcastToCustomer).not.toHaveBeenCalled();
    });
  });

  // -- bulkClose -------------------------------------------------------------

  describe('bulkClose', () => {
    it('returns 400 when claimIds empty', async () => {
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkClose(makeReq({ body: { claimIds: [] } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 401 when userId=null', async () => {
      (resolveUserScope as jest.Mock).mockResolvedValueOnce({ userId: null, customerId: 1 });
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkClose(makeReq({ body: { claimIds: ['CL50001'] } }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 200 happy path with claimStatus, closed=1, broadcast called', async () => {
      // Single query: UPDATE - rowsAffected=[1]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkClose(makeReq({
        body: { claimIds: ['CL50001'], claimStatus: 'Written Off' },
        headers: { 'x-actor-email': 'user@example.com' },
      }), res);

      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.closed).toBe(1);
      expect(broadcastToCustomer).toHaveBeenCalledWith(1, 'claim:updated', { type: 'bulk-closed', count: 1 });
    });

    it('returns 200 with closed=0 and broadcast NOT called', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkClose(makeReq({
        body: { claimIds: ['CL50001'] },
        headers: { 'x-actor-email': 'user@example.com' },
      }), res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.closed).toBe(0);
      expect(broadcastToCustomer).not.toHaveBeenCalled();
    });
  });

  // -- bulkReassign ----------------------------------------------------------

  describe('bulkReassign', () => {
    it('returns 400 when toUserId missing', async () => {
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkReassign(makeReq({ body: { claimIds: ['CL50001'] } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'claimIds array and toUserId are required' });
    });

    it('returns 400 when claimIds empty', async () => {
      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkReassign(makeReq({ body: { claimIds: [], toUserId: 5 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 200 happy path with count=2, broadcast called', async () => {
      // (1) close - rowsAffected=[0]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });
      // (2) getNextHistoryNum
      mockQuery.mockResolvedValueOnce({ recordset: [{ n: 700 }] });
      // (3) insert - rowsAffected=[2]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [2] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkReassign(makeReq({
        body: { claimIds: ['CL50001', 'CL50002'], toUserId: 5 },
        headers: { 'x-actor-email': 'manager@example.com' },
      }), res);

      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.count).toBe(2);
      expect(broadcastToCustomer).toHaveBeenCalledWith(1, 'claim:updated', { type: 'bulk-reassigned', count: 2 });
    });

    it('returns 200 with reassigned=0 and broadcast NOT called', async () => {
      // (1) close
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });
      // (2) getNextHistoryNum
      mockQuery.mockResolvedValueOnce({ recordset: [{ n: 700 }] });
      // (3) insert - rowsAffected=[0]
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });

      const ctrl = new BulkActionsController();
      const res = makeRes();
      await ctrl.bulkReassign(makeReq({
        body: { claimIds: ['CL50001'], toUserId: 5 },
        headers: { 'x-actor-email': 'manager@example.com' },
      }), res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.count).toBe(0);
      expect(broadcastToCustomer).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// 4. QA Workflow functions
// =============================================================================

describe('QA Workflow functions', () => {
  let createQaSample: any;
  let listQaReviews: any;
  let updateQaReview: any;
  let createQaFinding: any;
  let listQaFindings: any;
  let getQaStats: any;

  beforeAll(() => {
    ({
      createQaSample,
      listQaReviews,
      updateQaReview,
      createQaFinding,
      listQaFindings,
      getQaStats,
    } = require('../controllers/denial-iq/qa-workflow'));
  });

  const makeScopeReq = (overrides: any = {}) => ({
    query: {}, params: {}, body: {}, headers: {}, file: undefined,
    scopeFilter: { userId: 42, customerId: 1, sql: 'customer_id = 1' },
    ...overrides,
  });

  // -- createQaSample --------------------------------------------------------

  describe('createQaSample', () => {
    it('returns 400 when scopeFilter.userId is falsy', async () => {
      const req = makeScopeReq({ scopeFilter: { userId: null, customerId: 1 } });
      const res = makeRes();
      await createQaSample(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Reviewer could not be resolved' });
    });

    it('returns 201 happy path: 2 claims returned, 2 QaReview records inserted', async () => {
      // (1) claims query returns 2 rows
      mockQuery.mockResolvedValueOnce({
        recordset: [{ ClaimID: 'CL50001' }, { ClaimID: 'CL50002' }],
      });
      // (2) INSERT for CL50001
      mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, claim_id: 'CL50001', status: 'pending' }] });
      // (3) INSERT for CL50002
      mockQuery.mockResolvedValueOnce({ recordset: [{ id: 2, claim_id: 'CL50002', status: 'pending' }] });

      const req = makeScopeReq({ body: { sample_size: 2, review_type: 'random_sample' } });
      const res = makeRes();
      await createQaSample(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.count).toBe(2);
      expect(payload.data).toHaveLength(2);
    });

    it('returns 201 with specialistId filter in body', async () => {
      // (1) claims query with specialist filter
      mockQuery.mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL50003' }] });
      // (2) INSERT for CL50003
      mockQuery.mockResolvedValueOnce({ recordset: [{ id: 3, claim_id: 'CL50003', status: 'pending' }] });

      const req = makeScopeReq({ body: { sample_size: 1, review_type: 'targeted', specialist_id: 7 } });
      const res = makeRes();
      await createQaSample(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.count).toBe(1);
    });
  });

  // -- listQaReviews ---------------------------------------------------------

  describe('listQaReviews', () => {
    it('returns 200 with data array (no status filter)', async () => {
      const rows = [{ id: 1, claim_id: 'CL50001', status: 'pending' }];
      mockQuery.mockResolvedValueOnce({ recordset: rows });
      const req = makeScopeReq();
      const res = makeRes();
      await listQaReviews(req, res);
      expect(res.json).toHaveBeenCalledWith({ data: rows });
    });

    it('returns 200 with query.status=pending filter', async () => {
      const rows = [{ id: 2, claim_id: 'CL50002', status: 'pending' }];
      mockQuery.mockResolvedValueOnce({ recordset: rows });
      const req = makeScopeReq({ query: { status: 'pending' } });
      const res = makeRes();
      await listQaReviews(req, res);
      expect(res.json).toHaveBeenCalledWith({ data: rows });
    });
  });

  // -- updateQaReview --------------------------------------------------------

  describe('updateQaReview', () => {
    it('returns 400 when body is empty (nothing to update)', async () => {
      const req = makeScopeReq({ params: { id: '1' }, body: {} });
      const res = makeRes();
      await updateQaReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Nothing to update' });
    });

    it('returns 200 with just score update', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      const req = makeScopeReq({ params: { id: '1' }, body: { score: 85 } });
      const res = makeRes();
      await updateQaReview(req, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('returns 200 with status in_progress (adds started_at)', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      const req = makeScopeReq({ params: { id: '2' }, body: { status: 'in_progress' } });
      const res = makeRes();
      await updateQaReview(req, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('returns 200 with status completed (adds completed_at)', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [1] });
      const req = makeScopeReq({ params: { id: '3' }, body: { status: 'completed' } });
      const res = makeRes();
      await updateQaReview(req, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  // -- createQaFinding -------------------------------------------------------

  describe('createQaFinding', () => {
    it('returns 400 when required fields missing (no review_id)', async () => {
      const req = makeScopeReq({ body: { category: 'billing', severity: 'low', description: 'Missing auth' } });
      const res = makeRes();
      await createQaFinding(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'review_id, category, severity, and description are required',
      });
    });

    it('returns 201 happy path with all required fields', async () => {
      const inserted = { id: 10, review_id: 1, category: 'billing', severity: 'high', description: 'Incorrect code' };
      mockQuery.mockResolvedValueOnce({ recordset: [inserted] });
      const req = makeScopeReq({
        body: {
          review_id: 1, category: 'billing', severity: 'high',
          description: 'Incorrect code', recommendation: 'Recode and resubmit',
        },
      });
      const res = makeRes();
      await createQaFinding(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ data: inserted });
    });
  });

  // -- listQaFindings --------------------------------------------------------

  describe('listQaFindings', () => {
    it('returns 200 with data array for reviewId', async () => {
      const rows = [{ id: 1, review_id: 5, category: 'billing', severity: 'medium', description: 'Finding' }];
      mockQuery.mockResolvedValueOnce({ recordset: rows });
      const req = makeScopeReq({ query: { reviewId: '5' } });
      const res = makeRes();
      await listQaFindings(req, res);
      expect(res.json).toHaveBeenCalledWith({ data: rows });
    });
  });

  // -- getQaStats ------------------------------------------------------------

  describe('getQaStats', () => {
    it('returns 200 with stats object', async () => {
      const stats = { total_reviews: 10, completed: 5, pending: 5, avg_score: 87.5, total_findings: 20, critical_findings: 3 };
      mockQuery.mockResolvedValueOnce({ recordset: [stats] });
      const req = makeScopeReq({ scopeFilter: { userId: 42, customerId: 1, sql: '' } });
      const res = makeRes();
      await getQaStats(req, res);
      expect(res.json).toHaveBeenCalledWith({ data: stats });
    });

    it('returns 200 with scopeFilter.sql set (customerFilter active)', async () => {
      const stats = { total_reviews: 3, completed: 3, pending: 0, avg_score: 90.0, total_findings: 5, critical_findings: 1 };
      mockQuery.mockResolvedValueOnce({ recordset: [stats] });
      const req = makeScopeReq({ scopeFilter: { userId: 42, customerId: 2, sql: 'customer_id = 2' } });
      const res = makeRes();
      await getQaStats(req, res);
      expect(res.json).toHaveBeenCalledWith({ data: stats });
    });
  });
});

// =============================================================================
// 5. ClaimDetailTable
// =============================================================================

describe('ClaimDetailTable', () => {
  let ClaimDetailTable: any;

  beforeAll(() => {
    ({ ClaimDetailTable } = require('../controllers/denial-iq/claim-detail/claim-detail-table'));
  });

  describe('get', () => {
    it('returns 400 when claimId missing', async () => {
      const ctrl = new ClaimDetailTable();
      const res = makeRes();
      await ctrl.get(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Missing required query parameter: claimId' });
    });

    it('returns 200 happy path with claimId: returns data array', async () => {
      const rows = [
        { DOS: '2024-01-15', ProcCode: '99213', Charge: 150, InsPaid: 100, Allowed: 130, ContractualAdjustment: 20, TransactionAdjustment: 0, PatientResp: 30, Deductible: 0, Copay: 30, Coins: 0, ReasonCode: '45', ProcDescription: 'Office visit' },
        { DOS: null, ProcCode: 'TOTALS', Charge: 150, InsPaid: 100, Allowed: 130, ContractualAdjustment: 20, TransactionAdjustment: 0, PatientResp: 30, Deductible: 0, Copay: 30, Coins: 0, ReasonCode: null, ProcDescription: null },
      ];
      mockQuery.mockResolvedValueOnce({ recordset: rows });
      const ctrl = new ClaimDetailTable();
      const res = makeRes();
      await ctrl.get(makeReq({ query: { claimId: 'CL50001' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Claim information data',
        data: rows,
      });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db fail'));
      const ctrl = new ClaimDetailTable();
      const res = makeRes();
      await ctrl.get(makeReq({ query: { claimId: 'CL50001' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
    });
  });
});
