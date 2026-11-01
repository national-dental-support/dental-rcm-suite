/**
 * Unit tests for Recon IQ, Payer IQ, and Denial IQ index controllers.
 * Covers happy-path (200/201), error-path (500), and early-return branches (400/404/409).
 */

// --- DB mock setup --------------------------------------------------------------

const mockQuery = jest.fn();
const mockInput = jest.fn();
const mockRequestInstance = {
  input: (...a: any[]) => { mockInput(...a); return mockRequestInstance; },
  query: mockQuery,
};
const mockPool = { request: () => mockRequestInstance };

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getPool: () => mockPool }) },
  databaseInstance: { getPool: () => mockPool },
}));
jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));
jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  const requestFn = () => ({ input: jest.fn().mockReturnThis(), query: mockQuery });
  const Transaction = jest.fn().mockImplementation(() => ({
    begin: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    request: jest.fn().mockImplementation(requestFn),
  }));
  return {
    NVarChar: Object.assign(f, { MAX: f() }), Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(),
    Date: f(), Float: f(), VarChar: f, UniqueIdentifier: f(),
    Request: jest.fn().mockImplementation(requestFn),
    Transaction,
  };
});
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

// expand-filter is used by reconciliation-report.ts - it calls pool.request().input().query()
jest.mock('../utils/expand-filter', () => ({
  expandWithAliases: jest.fn().mockResolvedValue([]),
}));

// --- Helpers --------------------------------------------------------------------

const mockReq = (body: any = {}, headers: any = {}, query: any = {}) =>
  ({ body, headers: { 'x-actor-email': 'test@test.com', ...headers }, query, params: {} } as any);

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

// --- Imports (after mocks) ------------------------------------------------------

import { PatientClaims } from '../controllers/recon-iq/encounter-research/patient-claims';
import { Patients } from '../controllers/recon-iq/encounter-research/patients';
import { FullyReconciledPayments } from '../controllers/recon-iq/fully-reconciled/fully-paid-and-reconciled';
import { ApplyMatch } from '../controllers/recon-iq/matching/apply-match';
import { EobWithNoPayment } from '../controllers/recon-iq/matching/eob-no-payment';
import { PaymentsWithNoEob } from '../controllers/recon-iq/matching/payment-no-eob';
import { PaymentReconciliation } from '../controllers/recon-iq/reconciliation/reconciliation';
import { ReconciliationReportController } from '../controllers/recon-iq/reconciliation-report';
import { PayerIQController } from '../controllers/payer-iq/index';
import { ClaimDetailController } from '../controllers/denial-iq/claim-detail/index';
import { ClaimQueueController } from '../controllers/denial-iq/manager-view/claim-queue/index';
import { SpecialistClaimQueueController } from '../controllers/denial-iq/specialist-view/claim-queue/index';

// --------------------------------------------------------------------------------
// PatientClaims
// --------------------------------------------------------------------------------

describe('PatientClaims', () => {
  let ctrl: PatientClaims;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new PatientClaims();
  });

  it('returns 400 when patientAccount param is missing', async () => {
    const req = { ...mockReq(), params: { patientAccount: '' }, query: {} } as any;
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Missing') }));
  });

  it('returns 200 with patient and rows on success', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          patientName: 'Jane Doe',
          claimId: 'CLM00001',
          dateClaimSubmitted: '2025-01-15',
          eobId: '42',
          dateEobReceived: '2025-02-01',
        },
      ],
    });
    const req = { ...mockReq(), params: { patientAccount: 'P001' }, query: { page: '1', pageSize: '25' } } as any;
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.patient.patientAccount).toBe('P001');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].claimId).toBe('CLM00001');
  });

  it('filters rows by search term', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { patientName: 'Jane Doe', claimId: 'CLM00001', dateClaimSubmitted: '2025-01-15', eobId: '42', dateEobReceived: '2025-02-01' },
        { patientName: 'Jane Doe', claimId: 'CLM99999', dateClaimSubmitted: '2025-03-01', eobId: null, dateEobReceived: null },
      ],
    });
    const req = { ...mockReq(), params: { patientAccount: 'P001' }, query: { search: 'CLM00001' } } as any;
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].claimId).toBe('CLM00001');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB failure'));
    const req = { ...mockReq(), params: { patientAccount: 'P001' }, query: {} } as any;
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
  });
});

// --------------------------------------------------------------------------------
// Patients (Encounter Research)
// --------------------------------------------------------------------------------

describe('Patients (encounter research)', () => {
  let ctrl: Patients;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new Patients();
  });

  it('returns 200 with rows on happy path', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          patientName: 'John Smith',
          payerName: 'Aetna',
          paymentId: 'EFT-12345',
          doctorName: 'Dr. Jones',
          dateOfService: '2025-06-01',
          patientAccount: '10001',
        },
      ],
    });
    const req = mockReq({}, {}, { page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Recon IQ encounter research');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].patientName).toBe('John Smith');
  });

  it('filters rows by search term against patientName', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { patientName: 'Alice Walker', payerName: 'BCBS', paymentId: null, doctorName: null, dateOfService: '2025-01-01', patientAccount: '20001' },
        { patientName: 'Bob Builder', payerName: 'Cigna', paymentId: null, doctorName: null, dateOfService: '2025-02-01', patientAccount: '20002' },
      ],
    });
    const req = mockReq({}, {}, { search: 'alice' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].patientName).toBe('Alice Walker');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    const req = mockReq({}, {}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --------------------------------------------------------------------------------
// FullyReconciledPayments
// --------------------------------------------------------------------------------

describe('FullyReconciledPayments', () => {
  let ctrl: FullyReconciledPayments;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new FullyReconciledPayments();
  });

  it('returns 200 with fully reconciled rows', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          reconciledId: 'RF001',
          bankName: 'First National',
          depositDate: '2025-05-10',
          bankFeedId: 'BFP-7',
          amountDeposited: 5000,
          amountFullEra: 5000,
        },
      ],
    });
    const req = mockReq({}, {}, { page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Fully paid and reconciled payments');
    expect(body.rows[0].reconciledId).toBe('RF001');
  });

  it('supports single practiceLocation filter mode', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, { practiceId: 'East-1' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('supports list practiceLocation filter mode', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, { practices: 'East-1,West-2' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));
    const req = mockReq({}, {}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --------------------------------------------------------------------------------
// ApplyMatch
// --------------------------------------------------------------------------------

describe('ApplyMatch', () => {
  let ctrl: ApplyMatch;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new ApplyMatch();
  });

  it('returns 400 when bankDepositId is missing', async () => {
    const req = mockReq({ remittanceFileId: 'RF001' });
    const res = mockRes();
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('required') }));
  });

  it('returns 400 when remittanceFileId is missing', async () => {
    const req = mockReq({ bankDepositId: 'BD001' });
    const res = mockRes();
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when BankDeposit does not exist', async () => {
    // check query returns bdExists=0
    mockQuery.mockResolvedValueOnce({
      recordset: [{ bdExists: 0, rfExists: 1, alreadyMatched: 0 }],
    });
    const req = mockReq({ bankDepositId: 'BD999', remittanceFileId: 'RF001' });
    const res = mockRes();
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('BD999') }));
  });

  it('returns 404 when RemittanceFile does not exist', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ bdExists: 1, rfExists: 0, alreadyMatched: 0 }],
    });
    const req = mockReq({ bankDepositId: 'BD001', remittanceFileId: 'RF999' });
    const res = mockRes();
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('RF999') }));
  });

  it('returns 409 when the match already exists', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ bdExists: 1, rfExists: 1, alreadyMatched: 1 }],
    });
    const req = mockReq({ bankDepositId: 'BD001', remittanceFileId: 'RF001' });
    const res = mockRes();
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'These records are already matched' }));
  });

  it('returns 201 with reconciliationId on happy path', async () => {
    // First call: existence check
    mockQuery.mockResolvedValueOnce({
      recordset: [{ bdExists: 1, rfExists: 1, alreadyMatched: 0 }],
    });
    // Second call: get max ReconciliationID
    mockQuery.mockResolvedValueOnce({
      recordset: [{ ReconciliationID: 'REC000005' }],
    });
    // Third call: INSERT
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({ bankDepositId: 'BD001', remittanceFileId: 'RF001' });
    const res = mockRes();
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.reconciliationId).toBe('REC000006');
    expect(body.bankDepositId).toBe('BD001');
    expect(body.remittanceFileId).toBe('RF001');
  });

  it('generates REC000001 when the table is empty', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ bdExists: 1, rfExists: 1, alreadyMatched: 0 }],
    });
    // No rows in reconciliation -> undefined -> fallback to 'REC000000'
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({ bankDepositId: 'BD001', remittanceFileId: 'RF001' });
    const res = mockRes();
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.reconciliationId).toBe('REC000001');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('constraint violation'));
    const req = mockReq({ bankDepositId: 'BD001', remittanceFileId: 'RF001' });
    const res = mockRes();
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --------------------------------------------------------------------------------
// EobWithNoPayment
// --------------------------------------------------------------------------------

describe('EobWithNoPayment', () => {
  let ctrl: EobWithNoPayment;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new EobWithNoPayment();
  });

  it('returns 200 with EOB rows', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          eobId: '101',
          value: 'RF-101',
          eobDate: '2025-03-01',
          payerName: 'United',
          eobType: 'ERA',
          amount: 1200,
        },
      ],
    });
    const req = mockReq({}, {}, { page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Recon IQ EOBs with no payment');
    expect(body.rows[0].eobId).toBe('101');
    expect(body.rows[0].canFindPayment).toBe(true);
  });

  it('filters rows by search term \u2014 DB returns only matching rows (SQL-side filter)', async () => {
    // EobWithNoPayment does not filter in-memory; search is passed to SQL.
    // Simulate SQL returning only the matching row.
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: '202', value: 'RF-202', eobDate: '2025-04-01', payerName: 'Cigna', eobType: 'EOB', amount: 800 },
      ],
    });
    const req = mockReq({}, {}, { search: 'cigna' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].payerName).toBe('Cigna');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    const req = mockReq({}, {}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --------------------------------------------------------------------------------
// PaymentsWithNoEob
// --------------------------------------------------------------------------------

describe('PaymentsWithNoEob', () => {
  let ctrl: PaymentsWithNoEob;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new PaymentsWithNoEob();
  });

  it('returns 200 with payment rows', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          paymentId: 'BD-55',
          value: 'EFT-98765',
          paymentDate: '2025-05-20',
          payerName: 'Aetna',
          paymentType: 'EFT',
          amount: 4500,
        },
      ],
    });
    const req = mockReq({}, {}, { page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Recon IQ payments with no EOB');
    expect(body.rows[0].paymentId).toBe('BD-55');
    expect(body.rows[0].canFindEra).toBe(true);
  });

  it('filters rows by search on value field \u2014 DB returns only matching rows (SQL-side filter)', async () => {
    // PaymentsWithNoEob does not filter in-memory; search is passed to SQL.
    // Simulate SQL returning only the matching row.
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { paymentId: 'BD-2', value: 'CHK-22222', paymentDate: '2025-02-01', payerName: 'BCBS', paymentType: 'Check', amount: 2000 },
      ],
    });
    const req = mockReq({}, {}, { search: 'chk' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].value).toBe('CHK-22222');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('network error'));
    const req = mockReq({}, {}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --------------------------------------------------------------------------------
// PaymentReconciliation
// --------------------------------------------------------------------------------

describe('PaymentReconciliation', () => {
  let ctrl: PaymentReconciliation;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new PaymentReconciliation();
  });

  it('returns 200 with nested reconciliation rows', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          eobId: 'RF-10',
          eobDate: '2025-06-01',
          totalAmount: 3000,
          locationName: 'East Clinic',
          remittanceClaimId: 'RC-1',
          claimId: 'CLM00010',
          dateClaimSubmitted: '2025-05-15',
          amount: 3000,
          claimStatus: 'PAID',
          isPosted: 0,
          eobClaimCount: 1,
        },
      ],
    });
    const req = mockReq({}, {}, { page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Recon IQ payment reconciliation');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].eobId).toBe('RF-10');
    expect(body.rows[0].claims[0].claimId).toBe('CLM00010');
    expect(body.rows[0].claimsWithMoneyCount).toBe(1);
  });

  it('returns empty rows when recordset is empty', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(0);
    expect(body.pagination.totalRows).toBe(0);
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('query timeout'));
    const req = mockReq({}, {}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --------------------------------------------------------------------------------
// ReconciliationReportController
// --------------------------------------------------------------------------------

describe('ReconciliationReportController', () => {
  let ctrl: ReconciliationReportController;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new ReconciliationReportController();
  });

  // -- getFilterOptions ----------------------------------------------------------

  describe('getFilterOptions', () => {
    it('returns locations and payers on happy path', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ value: 'East Clinic' }, { value: 'West Clinic' }] })
        .mockResolvedValueOnce({ recordset: [{ value: 'Aetna' }, { value: 'BCBS' }] });

      const req = mockReq();
      const res = mockRes();
      await ctrl.getFilterOptions(req, res);
      const body = res.json.mock.calls[0][0];
      expect(body.locations).toEqual(['East Clinic', 'West Clinic']);
      expect(body.payers).toEqual(['Aetna', 'BCBS']);
    });

    it('returns empty arrays when queries fail', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));
      const req = mockReq();
      const res = mockRes();
      // getFilterOptions uses Promise.allSettled internally so won't throw
      await ctrl.getFilterOptions(req, res);
      const body = res.json.mock.calls[0][0];
      expect(body.locations).toEqual([]);
      expect(body.payers).toEqual([]);
    });
  });

  // -- getSummary ----------------------------------------------------------------

  describe('getSummary', () => {
    const summaryMockData = [
      // Q1: matched stats
      { recordset: [{ matchedCount: 10, matchedAmount: 50000, postedCount: 7, unpostedCount: 3 }] },
      // Q2: unmatched counts
      { recordset: [{ unmatchedPayments: 5, unmatchedEOBs: 2 }] },
      // Q3: denial rate
      { recordset: [{ totalClaims: 100, deniedClaims: 10, totalCharges: 200000 }] },
      // Q4: bank tx
      { recordset: [{ bankTxCount: 20, bankTxTotal: 60000 }] },
      // Q5: PMS tx
      { recordset: [{ pmsTxCount: 15, pmsTxTotal: 55000 }] },
      // Q6: in-transit
      { recordset: [{ inTransitCount: 3, inTransitTotal: 5000 }] },
    ];

    it('returns summary KPIs on happy path', async () => {
      summaryMockData.forEach(d => mockQuery.mockResolvedValueOnce(d));
      const req = mockReq({}, {}, { months: '6' });
      const res = mockRes();
      await ctrl.getSummary(req, res);
      const body = res.json.mock.calls[0][0];
      expect(body.matchedCount).toBe(10);
      expect(body.unmatchedPayments).toBe(5);
      expect(body.denialRate).toBe(10);
      expect(body.bankPmsDiff).toBe(5000);
      expect(body.inTransitCount).toBe(3);
    });

    it('returns 500 on unexpected error', async () => {
      // getSummary uses Promise.allSettled for the six DB queries, so individual
      // query failures are handled gracefully. The 500 path fires only when
      // expandWithAliases itself throws (e.g. synchronous error before the try).
      const { expandWithAliases } = require('../utils/expand-filter');
      (expandWithAliases as jest.Mock).mockRejectedValueOnce(new Error('alias lookup failed'));
      const req = mockReq({}, {}, { location: 'East Clinic' });
      const res = mockRes();
      await ctrl.getSummary(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      // Restore default mock
      (expandWithAliases as jest.Mock).mockResolvedValue([]);
    });
  });

  // -- getByPayer ----------------------------------------------------------------

  describe('getByPayer', () => {
    it('returns payer rows on happy path', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [
          { payerName: 'Aetna', remittanceCount: 5, totalAmount: 25000, linkedClaims: 50, deniedClaims: 5, avgAmount: 5000 },
        ],
      });
      const req = mockReq({}, {}, {});
      const res = mockRes();
      await ctrl.getByPayer(req, res);
      const body = res.json.mock.calls[0][0];
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].payerName).toBe('Aetna');
      expect(body.rows[0].denialRate).toBe(10);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('lock timeout'));
      const req = mockReq({}, {}, {});
      const res = mockRes();
      await ctrl.getByPayer(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- getMonthlyTrend -----------------------------------------------------------

  describe('getMonthlyTrend', () => {
    it('returns trend rows on happy path', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [
          { period: '2025-06', reconcileCount: 8, reconcileAmount: 40000, claimCount: 80, deniedCount: 4, postedCount: 6 },
          { period: '2025-05', reconcileCount: 6, reconcileAmount: 30000, claimCount: 60, deniedCount: 3, postedCount: 5 },
        ],
      });
      const req = mockReq({}, {}, {});
      const res = mockRes();
      await ctrl.getMonthlyTrend(req, res);
      const body = res.json.mock.calls[0][0];
      expect(body.rows).toHaveLength(2);
      expect(body.rows[0].period).toBe('2025-06');
      expect(body.rows[0].denialRate).toBe(5);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('syntax error'));
      const req = mockReq({}, {}, {});
      const res = mockRes();
      await ctrl.getMonthlyTrend(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -- getInTransit --------------------------------------------------------------

  describe('getInTransit', () => {
    it('returns in-transit rows on happy path', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [
          { RemittanceFileID: 'RF-55', fileDate: '2025-05-10', Amount: 8000, location: 'North Clinic', payerName: 'BCBS', claimCount: 3, daysAged: 40 },
        ],
      });
      const req = mockReq({}, {}, {});
      const res = mockRes();
      await ctrl.getInTransit(req, res);
      const body = res.json.mock.calls[0][0];
      expect(body.rows).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.rows[0].remittanceFileId).toBe('RF-55');
      expect(body.rows[0].daysAged).toBe(40);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('pool exhausted'));
      const req = mockReq({}, {}, {});
      const res = mockRes();
      await ctrl.getInTransit(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// --------------------------------------------------------------------------------
// PayerIQController (facade)
// --------------------------------------------------------------------------------

describe('PayerIQController', () => {
  it('instantiates without error', () => {
    const ctrl = new PayerIQController();
    expect(ctrl).toBeDefined();
  });

  it('exposes all expected controller methods as functions', () => {
    const ctrl = new PayerIQController();
    const expectedMethods = [
      'getChargeAmount',
      'getPayerMixReimbursementPayment',
      'getPayerMixPatientVolume',
      'getPayerMixCptVolume',
      'getForecastingPayerPayments',
      'getNetworkPayersDropdown',
      'getCptNonPayment',
      'getPayerDetails',
      'getNetworkLeases',
      'getAtRiskPayers',
      'getBuilderInfo',
      'getContractOptions',
    ];
    for (const method of expectedMethods) {
      expect(typeof (ctrl as any)[method]).toBe('function');
    }
  });

  it('bound methods are callable and return a Promise', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const ctrl = new PayerIQController();
    const req = mockReq({}, {}, {});
    const res = mockRes();
    // getChargeAmount delegates to ChargeAmount.get - just verify it returns a thenable
    const result = ctrl.getChargeAmount(req, res);
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

// --------------------------------------------------------------------------------
// ClaimDetailController (denial-iq facade)
// --------------------------------------------------------------------------------

describe('ClaimDetailController', () => {
  it('instantiates without error', () => {
    const ctrl = new ClaimDetailController();
    expect(ctrl).toBeDefined();
  });

  it('exposes getClaimInformation and getClaimDetailTable as functions', () => {
    const ctrl = new ClaimDetailController();
    expect(typeof ctrl.getClaimInformation).toBe('function');
    expect(typeof ctrl.getClaimDetailTable).toBe('function');
  });

  it('getClaimInformation returns a Promise', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const ctrl = new ClaimDetailController();
    const req = { ...mockReq(), params: { claimId: 'CL50001' } } as any;
    const res = mockRes();
    const result = ctrl.getClaimInformation(req, res);
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

// --------------------------------------------------------------------------------
// ClaimQueueController (manager-view facade)
// --------------------------------------------------------------------------------

describe('ClaimQueueController (manager-view)', () => {
  it('instantiates without error', () => {
    const ctrl = new ClaimQueueController();
    expect(ctrl).toBeDefined();
  });

  it('exposes getEscalations, getUnassigned, getAllClaims as functions', () => {
    const ctrl = new ClaimQueueController();
    expect(typeof ctrl.getEscalations).toBe('function');
    expect(typeof ctrl.getUnassigned).toBe('function');
    expect(typeof ctrl.getAllClaims).toBe('function');
  });

  it('getAllClaims returns a Promise', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const ctrl = new ClaimQueueController();
    const req = mockReq({}, { 'x-actor-email': 'manager@test.com' }, {});
    const res = mockRes();
    const result = ctrl.getAllClaims(req, res);
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

// --------------------------------------------------------------------------------
// SpecialistClaimQueueController (specialist-view facade)
// --------------------------------------------------------------------------------

describe('SpecialistClaimQueueController (specialist-view)', () => {
  it('instantiates without error', () => {
    const ctrl = new SpecialistClaimQueueController();
    expect(ctrl).toBeDefined();
  });

  it('exposes all five queue methods as functions', () => {
    const ctrl = new SpecialistClaimQueueController();
    expect(typeof ctrl.getMyQueue).toBe('function');
    expect(typeof ctrl.getAllClaims).toBe('function');
    expect(typeof ctrl.getEscalations).toBe('function');
    expect(typeof ctrl.getUnassigned).toBe('function');
    expect(typeof ctrl.getPending).toBe('function');
  });

  it('getMyQueue returns a Promise', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const ctrl = new SpecialistClaimQueueController();
    const req = mockReq({}, { 'x-actor-email': 'specialist@test.com' }, {});
    const res = mockRes();
    const result = ctrl.getMyQueue(req, res);
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('getPending returns a Promise', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const ctrl = new SpecialistClaimQueueController();
    const req = mockReq({}, { 'x-actor-email': 'specialist@test.com' }, {});
    const res = mockRes();
    const result = ctrl.getPending(req, res);
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});
