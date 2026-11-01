/**
 * coverage-recon-iq-new-controllers.test.ts
 *
 * Unit tests for all new ReconIQ controllers added in the 2026-05-01
 * feature expansion:
 *   - BankEscalationsController   (bank-escalations.ts)
 *   - AutoMatcherController        (auto-matcher.ts)
 *   - EraIngestionController       (era-ingestion.ts)
 *   - ReconAlertsController        (alerts.ts)
 *   - AdminConfigController        (admin-config.ts)
 *   - BulkPostController           (reconciliation/bulk-post.ts)
 *
 * Security coverage:
 *   - All DB inputs use parameterized queries (mockInput assertions)
 *   - 500 on DB failure (no internal details leaked)
 *   - 400 on missing required fields
 *   - 404 on missing records
 */

// --- DB mock ------------------------------------------------------------------
const mockQuery = jest.fn<any, any[]>();
const mockInput = jest.fn<any>();

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

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(),
    Decimal: f,
    Bit: f(),
    DateTime: f(),
    Date: f(),
    VarChar: Object.assign(f, { MAX: 'MAX' }),
    Request: jest.fn(() => {
      const r: any = {
        input: (...a: any[]) => { mockInput(...a); return r; },
        query: mockQuery,
      };
      return r;
    }),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/resolve-user-scope', () => ({
  extractCustomerId: jest.fn().mockReturnValue(42),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue(''),
}));

// --- Helpers ------------------------------------------------------------------
const makeReq = (overrides: any = {}) => ({
  query:   {},
  body:    {},
  params:  {},
  headers: { 'x-actor-email': 'manager@test.com' },
  user:    { username: 'manager@test.com', role: 'Manager', customerId: 42 },
  ...overrides,
} as any);

const makeRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json   = jest.fn().mockReturnValue(r);
  r.send   = jest.fn().mockReturnValue(r);
  return r;
};

const DB_ERROR = new Error('DB connection failure');
const EMPTY_RECORDSET = { recordset: [] };

// --- Imports (after mocks) ----------------------------------------------------
import { BankEscalationsController }   from '../controllers/recon-iq/bank-escalations';
import { AutoMatcherController }        from '../controllers/recon-iq/auto-matcher';
import { EraIngestionController }       from '../controllers/recon-iq/era-ingestion';
import { ReconAlertsController }        from '../controllers/recon-iq/alerts';
import { AdminConfigController }        from '../controllers/recon-iq/admin-config';
import { BulkPostController }           from '../controllers/recon-iq/reconciliation/bulk-post';

// ===============================================================================
// 1. BankEscalationsController
// ===============================================================================
describe('BankEscalationsController', () => {
  let ctrl: BankEscalationsController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    ctrl = new BankEscalationsController();
  });

  // -- list --
  describe('list()', () => {
    it('returns rows on happy path', async () => {
      mockQuery.mockResolvedValue({
        recordset: [{
          id: 1, bank_deposit_id: 'BD1', issue_type: 'amount_mismatch',
          description: 'test', status: 'open', priority: 'high',
          assigned_to: null, resolution_notes: null, resolved_by: null,
          resolved_at: null, created_by: 'user@x.com',
          created_at: new Date(), updated_at: new Date(), days_open: 3,
        }],
      });
      const res = makeRes();
      await ctrl.list(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].issueType).toBe('amount_mismatch');
    });

    it('uses parameterized query \u2014 customer_id bound as Int', async () => {
      mockQuery.mockResolvedValue({ recordset: [] });
      await ctrl.list(makeReq(), makeRes());
      expect(mockInput).toHaveBeenCalledWith('CustId', expect.anything(), 42);
    });

    it('applies status filter via parameterized input', async () => {
      mockQuery.mockResolvedValue({ recordset: [] });
      await ctrl.list(makeReq({ query: { status: 'resolved' } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('Status', expect.anything(), 'resolved');
    });

    it('applies priority filter via parameterized input', async () => {
      mockQuery.mockResolvedValue({ recordset: [] });
      await ctrl.list(makeReq({ query: { priority: 'critical' } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('Priority', expect.anything(), 'critical');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.list(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
      const body = res.json.mock.calls[0][0];
      expect(body.message).toBe('Internal server error');
      expect(body.stack).toBeUndefined();
    });
  });

  // -- stats --
  describe('stats()', () => {
    it('aggregates status counts correctly', async () => {
      mockQuery.mockResolvedValue({
        recordset: [{ status: 'open', cnt: 5 }, { status: 'resolved', cnt: 2 }],
      });
      const res = makeRes();
      await ctrl.stats(makeReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.open).toBe(5);
      expect(body.resolved).toBe(2);
      expect(body.investigating).toBe(0);
      expect(body.total).toBe(7);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.stats(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- create --
  describe('create()', () => {
    it('inserts and returns new id', async () => {
      mockQuery.mockResolvedValue({ recordset: [{ id: 99 }] });
      const res = makeRes();
      await ctrl.create(makeReq({ body: { issueType: 'duplicate', priority: 'low' } }), res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0]).toEqual({ id: 99 });
    });

    it('binds issueType as parameterized NVarChar input', async () => {
      mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
      await ctrl.create(makeReq({ body: { issueType: 'unauthorized' } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('IssueType', expect.anything(), 'unauthorized');
    });

    it('returns 400 when issueType is missing', async () => {
      const res = makeRes();
      await ctrl.create(makeReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.create(makeReq({ body: { issueType: 'other' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- update --
  describe('update()', () => {
    it('updates status and returns message', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      const res = makeRes();
      await ctrl.update(makeReq({ params: { id: '1' }, body: { status: 'investigating' } }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Updated' });
    });

    it('binds status as parameterized NVarChar input', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      await ctrl.update(makeReq({ params: { id: '5' }, body: { status: 'resolved' } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('Status', expect.anything(), 'resolved');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.update(makeReq({ params: { id: '1' }, body: { status: 'open' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// ===============================================================================
// 2. AutoMatcherController
// ===============================================================================
describe('AutoMatcherController', () => {
  let ctrl: AutoMatcherController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    ctrl = new AutoMatcherController();
  });

  // -- getSuggestions --
  describe('getSuggestions()', () => {
    it('returns mapped suggestions on happy path', async () => {
      mockQuery.mockResolvedValue({
        recordset: [{
          id: 1, bank_deposit_id: 'BD1', remittance_file_id: 'RF1',
          confidence_score: 85.0, match_reasons: '["amount_exact","same_payer"]',
          status: 'pending', generated_at: new Date(),
          DepositAmount: -500, deposit_date: '2025-01-10',
          PayerName: 'Aetna', deposit_location: 'East',
          eob_amount: -500, file_date: '2025-01-11',
          InsuranceName: 'Aetna', eob_location: 'East',
        }],
      });
      const res = makeRes();
      await ctrl.getSuggestions(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].confidenceScore).toBe(85.0);
      expect(body.rows[0].matchReasons).toEqual(['amount_exact', 'same_payer']);
    });

    it('handles invalid JSON in match_reasons gracefully', async () => {
      mockQuery.mockResolvedValue({
        recordset: [{
          id: 2, bank_deposit_id: 'BD2', remittance_file_id: 'RF2',
          confidence_score: 60.0, match_reasons: 'NOT_JSON',
          status: 'pending', generated_at: new Date(),
          DepositAmount: 100, deposit_date: null, PayerName: null,
          deposit_location: null, eob_amount: 100, file_date: null,
          InsuranceName: null, eob_location: null,
        }],
      });
      const res = makeRes();
      await ctrl.getSuggestions(makeReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.rows[0].matchReasons).toEqual([]);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.getSuggestions(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].message).toBe('Internal server error');
    });
  });

  // -- acceptSuggestion --
  describe('acceptSuggestion()', () => {
    it('returns 404 when suggestion not found', async () => {
      mockQuery.mockResolvedValue(EMPTY_RECORDSET);
      const res = makeRes();
      await ctrl.acceptSuggestion(makeReq({ params: { id: '999' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('inserts reconciliation record and marks suggestion accepted', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [{ bank_deposit_id: 'BD1', remittance_file_id: 'RF1', customer_id: 42 }],
      });
      mockQuery.mockResolvedValueOnce(EMPTY_RECORDSET);       // no existing recon
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] }); // insert recon
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] }); // update suggestion

      const res = makeRes();
      await ctrl.acceptSuggestion(makeReq({ params: { id: '1' } }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Accepted' });
    });

    it('skips insert when reconciliation already exists', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [{ bank_deposit_id: 'BD1', remittance_file_id: 'RF1', customer_id: 42 }],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [{ ReconciliationID: 'REC1' }] });
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

      const res = makeRes();
      await ctrl.acceptSuggestion(makeReq({ params: { id: '2' } }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Accepted' });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.acceptSuggestion(makeReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- rejectSuggestion --
  describe('rejectSuggestion()', () => {
    it('marks suggestion rejected and returns message', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      const res = makeRes();
      await ctrl.rejectSuggestion(makeReq({ params: { id: '5' } }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Rejected' });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.rejectSuggestion(makeReq({ params: { id: '5' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- autoAccept --
  describe('autoAccept()', () => {
    it('accepts all pending suggestions at or above threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [
          { id: 1, bank_deposit_id: 'BD1', remittance_file_id: 'RF1' },
          { id: 2, bank_deposit_id: 'BD2', remittance_file_id: 'RF2' },
        ],
      });
      for (let i = 0; i < 2; i++) {
        mockQuery.mockResolvedValueOnce(EMPTY_RECORDSET);
        mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
        mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });
      }

      const res = makeRes();
      await ctrl.autoAccept(makeReq({ body: { threshold: 80 } }), res);
      expect(res.json).toHaveBeenCalledWith({ accepted: 2 });
    });

    it('returns 0 when no suggestions above threshold', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      const res = makeRes();
      await ctrl.autoAccept(makeReq({ body: { threshold: 95 } }), res);
      expect(res.json).toHaveBeenCalledWith({ accepted: 0 });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.autoAccept(makeReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- generateSuggestions --
  describe('generateSuggestions()', () => {
    it('generates and persists suggestions with score >= 20', async () => {
      // EOBs without match
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          RemittanceFileID: 'RF1', Amount: -1000, FileDate: '2025-01-10',
          InsuranceName: 'BlueCross', PracticeLocation: 'North',
        }],
      });
      // Payments without match
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          BankDepositID: 'BD1', DepositAmount: 1000, DepositDate: '2025-01-11',
          PayerName: 'BlueCross', PracticeLocation: 'North',
        }],
      });
      // DELETE old pending
      mockQuery.mockResolvedValueOnce({ rowsAffected: [0] });
      // INSERT suggestion
      mockQuery.mockResolvedValue({ rowsAffected: [1] });

      const res = makeRes();
      await ctrl.generateSuggestions(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];
      expect(body.generated).toBeGreaterThanOrEqual(1);
    });

    it('does not insert suggestion when score < 20', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          RemittanceFileID: 'RF2', Amount: -999, FileDate: '2025-01-01',
          InsuranceName: 'Aetna', PracticeLocation: 'East',
        }],
      });
      mockQuery.mockResolvedValueOnce({
        recordset: [{
          BankDepositID: 'BD2', DepositAmount: 1, DepositDate: '2025-12-31',
          PayerName: 'United', PracticeLocation: 'West',
        }],
      });
      mockQuery.mockResolvedValue({ rowsAffected: [0] });

      const res = makeRes();
      await ctrl.generateSuggestions(makeReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.generated).toBe(0);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.generateSuggestions(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// ===============================================================================
// 3. EraIngestionController
// ===============================================================================
describe('EraIngestionController', () => {
  let ctrl: EraIngestionController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    ctrl = new EraIngestionController();
  });

  // -- upload --
  describe('upload()', () => {
    const makeFileReq = (fileName: string, size = 1024) =>
      makeReq({ file: { originalname: fileName, size, buffer: Buffer.from('test'), mimetype: 'application/octet-stream' } });

    it('returns 400 when no file is attached', async () => {
      const res = makeRes();
      await ctrl.upload(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('accepts .835 file and records logId', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ id: 10 }] })
        .mockResolvedValueOnce({ rowsAffected: [1] });

      const res = makeRes();
      await ctrl.upload(makeFileReq('remittance.835'), res);
      expect(res.json).toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];
      expect(body.logId).toBe(10);
      expect(body.status).toBe('completed');
    });

    it('binds FileName as parameterized NVarChar input', async () => {
      mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
      await ctrl.upload(makeFileReq('test.pdf'), makeRes());
      expect(mockInput).toHaveBeenCalledWith('FileName', expect.anything(), 'test.pdf');
    });

    it('detects ERA type for .835 extension', async () => {
      mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
      await ctrl.upload(makeFileReq('payment.835'), makeRes());
      expect(mockInput).toHaveBeenCalledWith('FileType', expect.anything(), 'ERA');
    });

    it('detects EOB type for .pdf extension', async () => {
      mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
      await ctrl.upload(makeFileReq('eob.pdf'), makeRes());
      expect(mockInput).toHaveBeenCalledWith('FileType', expect.anything(), 'EOB');
    });

    it('detects manual type for .csv extension', async () => {
      mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
      await ctrl.upload(makeFileReq('data.csv'), makeRes());
      expect(mockInput).toHaveBeenCalledWith('FileType', expect.anything(), 'manual');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.upload(makeFileReq('test.835'), res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].message).toBe('Internal server error');
    });
  });

  // -- history --
  describe('history()', () => {
    it('returns paginated history rows', async () => {
      mockQuery.mockResolvedValue({
        recordset: [{
          id: 1, file_name: 'test.835', file_size_bytes: 2048,
          file_type: 'ERA', status: 'completed',
          remittance_file_id: null, claims_found: 10, claims_matched: 8,
          error_message: null, uploaded_by: 'user@x.com',
          uploaded_at: new Date(), completed_at: new Date(),
        }],
      });
      const res = makeRes();
      await ctrl.history(makeReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].fileName).toBe('test.835');
      expect(body.rows[0].claimsFound).toBe(10);
    });

    it('uses parameterized pagination inputs', async () => {
      mockQuery.mockResolvedValue({ recordset: [] });
      await ctrl.history(makeReq({ query: { page: '2', pageSize: '10' } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('Offset', expect.anything(), 10);
      expect(mockInput).toHaveBeenCalledWith('PageSize', expect.anything(), 10);
    });

    it('clamps pageSize to 100 maximum', async () => {
      mockQuery.mockResolvedValue({ recordset: [] });
      await ctrl.history(makeReq({ query: { pageSize: '9999' } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('PageSize', expect.anything(), 100);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.history(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// ===============================================================================
// 4. ReconAlertsController
// ===============================================================================
describe('ReconAlertsController', () => {
  let ctrl: ReconAlertsController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    ctrl = new ReconAlertsController();
  });

  // -- listAlerts --
  describe('listAlerts()', () => {
    it('returns mapped alert rows on happy path', async () => {
      mockQuery.mockResolvedValue({
        recordset: [{
          id: 1, alert_type: 'unmatched_eob', item_id: 'RF-001',
          item_date: '2025-01-01', days_aged: 35, status: 'open',
          acknowledged_by: null, created_at: new Date(),
          severity: 'critical', threshold_days: 30,
        }],
      });
      const res = makeRes();
      await ctrl.listAlerts(makeReq({ query: { status: 'open' } }), res);
      const body = res.json.mock.calls[0][0];
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].alertType).toBe('unmatched_eob');
      expect(body.rows[0].severity).toBe('critical');
    });

    it('binds Status as parameterized input', async () => {
      mockQuery.mockResolvedValue({ recordset: [] });
      await ctrl.listAlerts(makeReq({ query: { status: 'acknowledged' } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('Status', expect.anything(), 'acknowledged');
    });

    it('defaults to open status', async () => {
      mockQuery.mockResolvedValue({ recordset: [] });
      await ctrl.listAlerts(makeReq(), makeRes());
      expect(mockInput).toHaveBeenCalledWith('Status', expect.anything(), 'open');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.listAlerts(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- acknowledge --
  describe('acknowledge()', () => {
    it('updates record and returns message', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      const res = makeRes();
      await ctrl.acknowledge(makeReq({ params: { id: '7' } }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Acknowledged' });
    });

    it('binds Id and Actor as parameterized inputs', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      await ctrl.acknowledge(makeReq({ params: { id: '3' } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('Id', expect.anything(), 3);
      expect(mockInput).toHaveBeenCalledWith('Actor', expect.anything(), 'manager@test.com');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.acknowledge(makeReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- getConfig --
  describe('getConfig()', () => {
    it('returns config rows', async () => {
      mockQuery.mockResolvedValue({
        recordset: [{
          id: 1, alert_type: 'unmatched_eob', threshold_days: 30,
          severity: 'warning', is_enabled: true, notify_emails: null,
        }],
      });
      const res = makeRes();
      await ctrl.getConfig(makeReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.configs).toHaveLength(1);
      expect(body.configs[0].alertType).toBe('unmatched_eob');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.getConfig(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- upsertConfig --
  describe('upsertConfig()', () => {
    it('upserts config and returns success message', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      const res = makeRes();
      await ctrl.upsertConfig(makeReq({ body: { alertType: 'unmatched_eob', thresholdDays: 14 } }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Config saved' });
    });

    it('returns 400 when alertType missing', async () => {
      const res = makeRes();
      await ctrl.upsertConfig(makeReq({ body: { thresholdDays: 14 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when thresholdDays missing', async () => {
      const res = makeRes();
      await ctrl.upsertConfig(makeReq({ body: { alertType: 'unmatched_eob' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('binds Days as parameterized Int input', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      await ctrl.upsertConfig(makeReq({ body: { alertType: 'unposted_remittance', thresholdDays: 7 } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('Days', expect.anything(), 7);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.upsertConfig(makeReq({ body: { alertType: 'x', thresholdDays: 7 } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// ===============================================================================
// 5. AdminConfigController
// ===============================================================================
describe('AdminConfigController', () => {
  let ctrl: AdminConfigController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    ctrl = new AdminConfigController();
  });

  // -- getConfig --
  describe('getConfig()', () => {
    it('returns DB values when config row exists', async () => {
      mockQuery.mockResolvedValue({
        recordset: [{
          auto_match_enabled: 1, auto_match_threshold: '90.00',
          auto_post_enabled: 0, statement_min_balance: '10.00',
          statement_default_aging_days: 60,
        }],
      });
      const res = makeRes();
      await ctrl.getConfig(makeReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.autoMatchEnabled).toBe(true);
      expect(body.autoMatchThreshold).toBe(90.0);
      expect(body.autoPostEnabled).toBe(false);
      expect(body.statementMinBalance).toBe(10.0);
      expect(body.statementDefaultAgingDays).toBe(60);
    });

    it('returns defaults when no config row exists', async () => {
      mockQuery.mockResolvedValue(EMPTY_RECORDSET);
      const res = makeRes();
      await ctrl.getConfig(makeReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.autoMatchEnabled).toBe(false);
      expect(body.autoMatchThreshold).toBe(85.0);
      expect(body.statementDefaultAgingDays).toBe(90);
    });

    it('returns defaults when extractCustomerId returns null', async () => {
      const { extractCustomerId } = require('../utils/resolve-user-scope');
      (extractCustomerId as jest.Mock).mockReturnValueOnce(null);
      const res = makeRes();
      await ctrl.getConfig(makeReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.autoMatchEnabled).toBe(false);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.getConfig(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- updateConfig --
  describe('updateConfig()', () => {
    it('upserts config and returns success', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      const res = makeRes();
      await ctrl.updateConfig(makeReq({
        body: { autoMatchEnabled: true, autoMatchThreshold: 80, autoPostEnabled: false,
                statementMinBalance: 10, statementDefaultAgingDays: 60 },
      }), res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Config updated' });
    });

    it('binds autoMatchEnabled as Bit input', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      await ctrl.updateConfig(makeReq({ body: { autoMatchEnabled: true } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('AMe', expect.anything(), 1);
    });

    it('binds autoMatchThreshold as Decimal input', async () => {
      mockQuery.mockResolvedValue({ rowsAffected: [1] });
      await ctrl.updateConfig(makeReq({ body: { autoMatchThreshold: 75 } }), makeRes());
      expect(mockInput).toHaveBeenCalledWith('AMT', expect.anything(), 75);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.updateConfig(makeReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// ===============================================================================
// 6. BulkPostController
// ===============================================================================
describe('BulkPostController', () => {
  let ctrl: BulkPostController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    ctrl = new BulkPostController();
  });

  describe('bulkPost()', () => {
    it('returns posted count for each ID', async () => {
      // extractCustomerId returns 42, so ownership check runs first for each RF
      // Per RF: ownerCheck, existCheck, INSERT claimPostHistory, INSERT SecondaryBillingQueue
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ '1': 1 }] }) // RF1: owner check -> authorized
        .mockResolvedValueOnce(EMPTY_RECORDSET)              // RF1: existing check -> no row -> insert path
        .mockResolvedValueOnce({ rowsAffected: [1] })        // RF1: INSERT claimPostHistory
        .mockResolvedValueOnce({ rowsAffected: [1] })        // RF1: INSERT SecondaryBillingQueue
        .mockResolvedValueOnce({ recordset: [{ '1': 1 }] }) // RF2: owner check -> authorized
        .mockResolvedValueOnce(EMPTY_RECORDSET)              // RF2: existing check -> no row -> insert path
        .mockResolvedValueOnce({ rowsAffected: [1] })        // RF2: INSERT claimPostHistory
        .mockResolvedValueOnce({ rowsAffected: [1] });       // RF2: INSERT SecondaryBillingQueue

      const res = makeRes();
      await ctrl.bulkPost(makeReq({ body: { remittanceFileIds: ['RF1', 'RF2'] } }), res);
      const body = res.json.mock.calls[0][0];
      expect(body.posted).toBe(2);
      expect(body.failed).toHaveLength(0);
    });

    it('returns 400 for empty remittanceFileIds array', async () => {
      const res = makeRes();
      await ctrl.bulkPost(makeReq({ body: { remittanceFileIds: [] } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('tracks failed IDs when individual post throws', async () => {
      mockQuery.mockRejectedValue(DB_ERROR);
      const res = makeRes();
      await ctrl.bulkPost(makeReq({ body: { remittanceFileIds: ['RF_BAD'] } }), res);
      const body = res.json.mock.calls[0][0];
      expect(body.failed).toContain('RF_BAD');
      expect(body.posted).toBe(0);
    });

    it('handles missing remittanceFileIds gracefully', async () => {
      const res = makeRes();
      await ctrl.bulkPost(makeReq({ body: {} }), res);
      expect(res.json).toHaveBeenCalled();
    });
  });
});

// ===============================================================================
// Security: SQL Injection prevention - verify no string concatenation
// All parameterized fields must go through mockInput, never interpolated
// ===============================================================================
describe('OWASP A03 \u2014 SQL Injection prevention', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
  });

  it('BankEscalations.list: hostile status value is parameterized, not interpolated', async () => {
    const ctrl = new BankEscalationsController();
    mockQuery.mockResolvedValue({ recordset: [] });

    const hostile = "'; DROP TABLE BankIssueEscalation; --";
    await ctrl.list(makeReq({ query: { status: hostile } }), makeRes());

    expect(mockInput).toHaveBeenCalledWith('Status', expect.anything(), hostile);
    const queryCall = mockQuery.mock.calls[0][0] as string;
    expect(queryCall).not.toContain(hostile);
  });

  it('ReconAlerts.upsertConfig: alertType value is parameterized, not interpolated', async () => {
    const ctrl = new ReconAlertsController();
    mockQuery.mockResolvedValue({ rowsAffected: [1] });

    const hostile = "'; DROP TABLE ReconAlertConfig; --";
    await ctrl.upsertConfig(makeReq({ body: { alertType: hostile, thresholdDays: 7 } }), makeRes());
    expect(mockInput).toHaveBeenCalledWith('Type', expect.anything(), hostile);
    const queryCall = mockQuery.mock.calls[0][0] as string;
    expect(queryCall).not.toContain(hostile);
  });

  it('BankEscalations.create: description value is parameterized, not interpolated', async () => {
    const ctrl = new BankEscalationsController();
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });

    const hostile = '<script>alert(1)</script>';
    await ctrl.create(makeReq({ body: { issueType: 'other', description: hostile } }), makeRes());
    expect(mockInput).toHaveBeenCalledWith('Description', expect.anything(), hostile);
    const queryCall = mockQuery.mock.calls[0][0] as string;
    expect(queryCall).not.toContain(hostile);
  });

  it('EraIngestion.upload: fileName is parameterized, not interpolated', async () => {
    const ctrl = new EraIngestionController();
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });

    const hostile = "'; EXEC xp_cmdshell('rm -rf /'); --";
    const req = makeReq({ file: { originalname: hostile, size: 100, buffer: Buffer.from('x'), mimetype: 'application/octet-stream' } });
    await ctrl.upload(req, makeRes());
    expect(mockInput).toHaveBeenCalledWith('FileName', expect.anything(), hostile);
    const queryCall = mockQuery.mock.calls[0][0] as string;
    expect(queryCall).not.toContain(hostile);
  });
});
