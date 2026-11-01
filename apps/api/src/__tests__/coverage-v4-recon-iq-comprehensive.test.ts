/**
 * coverage-v4-recon-iq-comprehensive.test.ts
 *
 * Comprehensive branch-coverage tests for the following recon-iq controllers:
 *   - encounter-research/patient-claims.ts     (8br)
 *   - encounter-research/patients.ts           (8br)
 *   - matching/eob-no-payment.ts               (8br)
 *   - reconciliation/reconciliation.ts         (8br)
 *   - finance-summary.ts                       (7br)
 *   - dashboard/era-eob-payment.ts             (7br)
 *   - dashboard/match-stats.ts                 (6br)
 *   - fully-reconciled/fully-paid-and-reconciled.ts (5br)
 *   - matching/payment-no-eob.ts               (5br)
 *   - matching/apply-match.ts                  (1br)
 */

// --- DB mock ------------------------------------------------------------------
const mockQuery = jest.fn();
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

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  const mockTxnReq: any = {
    input: (..._a: any[]) => mockTxnReq,
    query: (...args: any[]) => mockQuery(...args),
  };
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(),
    BigInt: f(),
    Decimal: f,
    Bit: f(),
    DateTime: f(),
    Date: f(),
    Float: f(),
    VarChar: Object.assign(f, { MAX: 'MAX' }),
    UniqueIdentifier: f(),
    SmallInt: f(),
    Request: jest.fn().mockImplementation(() => mockRequestInstance),
    Transaction: jest.fn().mockImplementation(() => ({
      begin: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      request: jest.fn().mockReturnValue(mockTxnReq),
    })),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/expand-filter', () => ({
  expandWithAliases: jest.fn().mockResolvedValue([]),
}));

// --- Helpers ------------------------------------------------------------------
const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn().mockReturnValue(r);
  return r;
};

const mockReq = (query: any = {}, body: any = {}, params: any = {}, headers: any = {}) =>
  ({
    query,
    body,
    params,
    headers: { 'x-actor-email': 'test@example.com', ...headers },
  } as any);

// --- Imports after mocks -------------------------------------------------------
import { PatientClaims } from '../controllers/recon-iq/encounter-research/patient-claims';
import { Patients } from '../controllers/recon-iq/encounter-research/patients';
import { EobWithNoPayment } from '../controllers/recon-iq/matching/eob-no-payment';
import { PaymentReconciliation } from '../controllers/recon-iq/reconciliation/reconciliation';
import { FinanceSummaryController } from '../controllers/recon-iq/finance-summary';
import { EraEobPayment } from '../controllers/recon-iq/dashboard/era-eob-payment';
import { MatchStats } from '../controllers/recon-iq/dashboard/match-stats';
import { FullyReconciledPayments } from '../controllers/recon-iq/fully-reconciled/fully-paid-and-reconciled';
import { PaymentsWithNoEob } from '../controllers/recon-iq/matching/payment-no-eob';
import { ApplyMatch } from '../controllers/recon-iq/matching/apply-match';
import { expandWithAliases } from '../utils/expand-filter';

// --- PatientClaims ------------------------------------------------------------
describe('PatientClaims', () => {
  let ctrl: PatientClaims;

  beforeEach(() => {
    ctrl = new PatientClaims();
    mockQuery.mockReset();
  });

  it('returns 400 when patientAccount param is missing', async () => {
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { patientAccount: '' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('patientAccount') }),
    );
  });

  it('returns 400 when patientAccount param is whitespace only', async () => {
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { patientAccount: '   ' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with empty recordset', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { patientAccount: 'P001' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.patient.patientAccount).toBe('P001');
    expect(body.patient.patientName).toBeNull();
    expect(body.rows).toHaveLength(0);
  });

  it('returns 200 with rows and maps nullable eobId to null', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { patientName: 'John Doe', claimId: 'CLM001', dateClaimSubmitted: '2024-01-01', eobId: null, dateEobReceived: null },
        { patientName: 'John Doe', claimId: 'CLM002', dateClaimSubmitted: '2024-02-01', eobId: 'EOB-5', dateEobReceived: '2024-02-10' },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { patientAccount: 'P002' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].eobId).toBeNull();
    expect(body.rows[1].eobId).toBe('EOB-5');
  });

  it('filters rows by search term matching claimId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { patientName: 'Jane', claimId: 'CLM999', dateClaimSubmitted: '2024-03-01', eobId: null, dateEobReceived: null },
        { patientName: 'Jane', claimId: 'CLM111', dateClaimSubmitted: '2024-03-02', eobId: 'EOB-1', dateEobReceived: '2024-03-10' },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: '999' }, {}, { patientAccount: 'P003' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].claimId).toBe('CLM999');
  });

  it('filters rows by search term matching eobId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { patientName: 'Jane', claimId: 'CLM001', dateClaimSubmitted: '2024-03-01', eobId: 'EOB-ALPHA', dateEobReceived: '2024-03-05' },
        { patientName: 'Jane', claimId: 'CLM002', dateClaimSubmitted: '2024-03-02', eobId: 'EOB-BETA', dateEobReceived: '2024-03-10' },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'alpha' }, {}, { patientAccount: 'P004' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].eobId).toBe('EOB-ALPHA');
  });

  it('applies custom pagination page/pageSize', async () => {
    // SQL-side pagination: for page=2,pageSize=10 the DB returns rows 10-19 only.
    // The mock returns exactly 10 records (simulating OFFSET 10 FETCH NEXT 10).
    const records = Array.from({ length: 10 }, (_, i) => ({
      patientName: 'Pat',
      claimId: `CLM${i + 10}`,
      dateClaimSubmitted: '2024-01-01',
      eobId: null,
      dateEobReceived: null,
    }));
    mockQuery.mockResolvedValueOnce({ recordset: records });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '2', pageSize: '10' }, {}, { patientAccount: 'P005' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(2);
    expect(body.rows).toHaveLength(10);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB failure'));
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { patientAccount: 'P999' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('handles null result recordset gracefully', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: null });
    const res = mockRes();
    await ctrl.get(mockReq({}, {}, { patientAccount: 'P006' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(0);
  });
});

// --- Patients (encounter research) -------------------------------------------
describe('Patients (encounter-research)', () => {
  let ctrl: Patients;

  beforeEach(() => {
    ctrl = new Patients();
    mockQuery.mockReset();
  });

  it('returns 200 with defaults (no filters)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('all');
    expect(body.filters.payers).toBeNull();
  });

  it('picks practiceId from query when locationScope is not "practice"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ practiceId: 'demo-east' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('demo-east');
  });

  it('picks firstPractice when locationScope=practice and practices array provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ locationScope: 'practice', practices: ['Site-A', 'Site-B'] }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('Site-A');
  });

  it('normalizes CSV payers from array input', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ payers: ['Aetna', 'BCBS'] }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.payers).toBe('Aetna,BCBS');
  });

  it('filters "all" value out of payers CSV', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ payers: 'all' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.payers).toBeNull();
  });

  it('applies search filter across patient fields', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { patientName: 'Alice Smith', payerName: 'Aetna', paymentId: 'EFT-001', doctorName: 'Dr. Jones', dateOfService: '2024-01-01', patientAccount: 'P001' },
        { patientName: 'Bob Brown', payerName: 'BCBS', paymentId: null, doctorName: null, dateOfService: '2024-02-01', patientAccount: 'P002' },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'alice' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].patientName).toBe('Alice Smith');
  });

  it('applies date range filters (from/to)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ from: '2024-01-01', to: '2024-12-31' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.from).toBe('2024-01-01');
    expect(body.filters.to).toBe('2024-12-31');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB exploded'));
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- EobWithNoPayment ---------------------------------------------------------
describe('EobWithNoPayment', () => {
  let ctrl: EobWithNoPayment;

  beforeEach(() => {
    ctrl = new EobWithNoPayment();
    mockQuery.mockReset();
  });

  it('returns 200 with mode=all (no practices filter)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceId).toBe('all');
  });

  it('uses mode=single when practiceId is provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ practiceId: 'site-west' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses mode=list when practices param is provided as comma-separated string', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ practices: 'Site-A,Site-B' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses mode=list when practices is an array', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ practices: ['Site-A', 'Site-B'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('maps rows correctly including canFindPayment=true', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 101, value: 'RF-101', eobDate: '2024-03-01', payerName: 'Aetna', eobType: 'ERA', amount: 1500.00 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].canFindPayment).toBe(true);
    expect(body.rows[0].amount).toBe(1500);
  });

  it('applies search filter across eobId, value, payerName, eobType', async () => {
    // The controller passes search to SQL; mock returns only the filtered row (as SQL would).
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: '101', value: 'RF-101', eobDate: '2024-03-01', payerName: 'Aetna', eobType: 'ERA', amount: 500 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'aetna' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].payerName).toBe('Aetna');
  });

  it('handles invalid page/pageSize with safe defaults', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: 'abc', pageSize: '-5' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(25);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- PaymentReconciliation ----------------------------------------------------
describe('PaymentReconciliation', () => {
  let ctrl: PaymentReconciliation;

  beforeEach(() => {
    ctrl = new PaymentReconciliation();
    mockQuery.mockReset();
  });

  it('returns 200 with empty recordset', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].rows).toHaveLength(0);
  });

  it('nests flat rows into reconciliation groups', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'RF-1', eobDate: '2024-01-10', totalAmount: 1000, locationName: 'Site-A', remittanceClaimId: 'RC-1', claimId: 'CLM001', dateClaimSubmitted: '2024-01-05', amount: 500, claimStatus: 'PAID', isPosted: 0 },
        { eobId: 'RF-1', eobDate: '2024-01-10', totalAmount: 1000, locationName: 'Site-A', remittanceClaimId: 'RC-2', claimId: 'CLM002', dateClaimSubmitted: '2024-01-06', amount: 0, claimStatus: 'ZERO_PAY', isPosted: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].claims).toHaveLength(2);
    expect(body.rows[0].claimsWithMoneyCount).toBe(1);
    expect(body.rows[0].claimsZeroOpenCount).toBe(1);
  });

  it('skips rows with null eobId in nestRows', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: null, eobDate: '2024-01-10', totalAmount: 500, locationName: 'Site-A', remittanceClaimId: null, claimId: null, dateClaimSubmitted: null, amount: null, claimStatus: null, isPosted: 0 },
        { eobId: 'RF-2', eobDate: '2024-02-01', totalAmount: 200, locationName: 'Site-B', remittanceClaimId: 'RC-3', claimId: 'CLM003', dateClaimSubmitted: '2024-02-01', amount: 200, claimStatus: 'PAID', isPosted: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].eobId).toBe('RF-2');
  });

  it('applies search filter on eobId, locationName, and claim claimId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'RF-10', eobDate: '2024-01-10', totalAmount: 100, locationName: 'West-Clinic', remittanceClaimId: null, claimId: 'CLM-WEST', dateClaimSubmitted: '2024-01-01', amount: 100, claimStatus: 'PAID', isPosted: 0 },
        { eobId: 'RF-20', eobDate: '2024-02-10', totalAmount: 200, locationName: 'East-Clinic', remittanceClaimId: null, claimId: 'CLM-EAST', dateClaimSubmitted: '2024-02-01', amount: 200, claimStatus: 'PAID', isPosted: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'west' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].locationName).toBe('West-Clinic');
  });

  it('uses pickPracticeLocation with locationScope=practice', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ locationScope: 'practice', practices: ['Site-X'] }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('Site-X');
  });

  it('handles invalid page with safe default', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '0', pageSize: '0' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(25);
  });

  it('handles eobId row without claimId (no claim push)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'RF-5', eobDate: '2024-05-01', totalAmount: 750, locationName: 'Clinic-C', remittanceClaimId: null, claimId: null, dateClaimSubmitted: null, amount: null, claimStatus: null, isPosted: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].claims).toHaveLength(0);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('SQL error'));
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- FinanceSummaryController -------------------------------------------------
describe('FinanceSummaryController', () => {
  let ctrl: FinanceSummaryController;

  beforeEach(() => {
    ctrl = new FinanceSummaryController();
    mockQuery.mockReset();
  });

  it('returns 200 with empty recordsets', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })   // txResult
      .mockResolvedValueOnce({ recordset: [] })   // arResult
      .mockResolvedValueOnce({ recordset: [{ TotalWriteOffs: 0 }] }); // woResult
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.summary.grossCharges).toBe(0);
    expect(body.summary.netCollectionRate).toBe(0);
    expect(body.summary.grossCollectionRate).toBe(0);
    expect(body.summary.daysInAR).toBe(0);
  });

  it('clamps months param to min=1, max=36', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })   // txResult
      .mockResolvedValueOnce({ recordset: [] })   // arResult
      .mockResolvedValueOnce({ recordset: [{ TotalWriteOffs: 0 }] }); // woResult
    const res = mockRes();
    await ctrl.get(mockReq({ months: '100' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.months).toBe(36);
  });

  it('clamps months param to minimum of 1', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })   // txResult
      .mockResolvedValueOnce({ recordset: [] })   // arResult
      .mockResolvedValueOnce({ recordset: [{ TotalWriteOffs: 0 }] }); // woResult
    const res = mockRes();
    await ctrl.get(mockReq({ months: '-5' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.months).toBe(1);
  });

  it('aggregates trx groups with all categories', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { TrxType: 'Charge', Month: '2024-01', TotalAmt: 10000, TxCount: 20 },
          { TrxType: 'InsurancePayment', Month: '2024-01', TotalAmt: 7000, TxCount: 18 },
          { TrxType: 'PatientCash', Month: '2024-01', TotalAmt: 500, TxCount: 5 },
          { TrxType: 'Contractual Adjustment', Month: '2024-01', TotalAmt: 2000, TxCount: 10 },
          { TrxType: 'WriteOff', Month: '2024-01', TotalAmt: 300, TxCount: 3 },
          { TrxType: 'SomethingElse', Month: '2024-01', TotalAmt: 100, TxCount: 1 },
          // Same TrxType repeated (to test trxGroupMap existing branch)
          { TrxType: 'Charge', Month: '2024-02', TotalAmt: 5000, TxCount: 10 },
        ],
      })
      .mockResolvedValueOnce({
        recordset: [{ GrossChargesAllTime: 15000, OpenAR: 3000, AvgDailyCharges: 50 }],
      })
      .mockResolvedValueOnce({ recordset: [{ TotalWriteOffs: 0 }] }); // woResult
    const res = mockRes();
    await ctrl.get(mockReq({ months: '12' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    // Charge appears twice -> merged in trxGroupMap
    const chargeGroup = body.byTrxType.find((g: any) => g.trxType === 'Charge');
    expect(chargeGroup.totalAmount).toBe(15000);
    // Summary should be non-zero
    expect(body.summary.grossCharges).toBe(15000);
    expect(body.summary.daysInAR).toBeGreaterThan(0);
  });

  it('sets netCollectionRate and grossCollectionRate to 0 when grossCharges=0', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { TrxType: 'InsurancePayment', Month: '2024-03', TotalAmt: 500, TxCount: 2 },
        ],
      })
      .mockResolvedValueOnce({
        recordset: [{ GrossChargesAllTime: 0, OpenAR: 0, AvgDailyCharges: 0 }],
      })
      .mockResolvedValueOnce({ recordset: [{ TotalWriteOffs: 0 }] }); // woResult
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    const body = res.json.mock.calls[0][0];
    expect(body.summary.netCollectionRate).toBe(0);
    expect(body.summary.grossCollectionRate).toBe(0);
  });

  it('accepts location and payer filter params', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })   // txResult
      .mockResolvedValueOnce({ recordset: [] })   // arResult
      .mockResolvedValueOnce({ recordset: [{ TotalWriteOffs: 0 }] }); // woResult
    const res = mockRes();
    await ctrl.get(mockReq({ location: 'Site-A', payer: 'Aetna' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- EraEobPayment ------------------------------------------------------------
describe('EraEobPayment', () => {
  let ctrl: EraEobPayment;

  beforeEach(() => {
    ctrl = new EraEobPayment();
    mockQuery.mockReset();
  });

  it('returns 200 with empty series', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].series).toHaveLength(0);
  });

  it('maps series rows with numeric coercion', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          period: '2024-01',
          eraEobPaymentAmount: '5000.00',
          patientResponsibilityAmount: '200.00',
          adjustmentsAmount: '300.00',
          unmatchedPaymentsNoEobCount: 2,
          unmatchedNoPaymentToEobCount: 3,
        },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    const body = res.json.mock.calls[0][0];
    expect(body.series[0].eraEobPaymentAmount).toBe(5000);
    expect(body.series[0].unmatchedPaymentsNoEobCount).toBe(2);
  });

  it('uses pickPracticeLocation with locationScope=practice and practices array', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ locationScope: 'practice', practices: ['Clinic-A'] }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('Clinic-A');
  });

  it('uses practiceId when practices is not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ practiceId: 'demo-west' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('demo-west');
  });

  it('normalizes payers and providers CSV', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ payers: ['Aetna', 'all'], providers: 'Dr.Smith' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.payers).toBe('Aetna');
    expect(body.filters.providers).toBe('Dr.Smith');
  });

  it('passes from/to date filters and interval param', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ from: '2024-01-01', to: '2024-06-30', interval: 'week' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.from).toBe('2024-01-01');
    expect(body.filters.interval).toBe('week');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('query failed'));
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- MatchStats ---------------------------------------------------------------
describe('MatchStats', () => {
  let ctrl: MatchStats;
  const mockExpandWithAliases = expandWithAliases as jest.Mock;

  beforeEach(() => {
    ctrl = new MatchStats();
    mockQuery.mockReset();
    mockExpandWithAliases.mockReset();
    mockExpandWithAliases.mockResolvedValue([]);
  });

  it('returns 200 with default stats when no filters provided', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ payment_eob_matched: 10, fully_reconciled_posted: 5, payments_without_eob: 2, eob_without_payments: 3 }],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.stats).toHaveLength(5);
    expect(body.stats.find((s: any) => s.key === 'payment_eob_matched').value).toBe(10);
    expect(body.stats.find((s: any) => s.key === 'escalated_bank_issues').value).toBe(0);
  });

  it('handles null row values gracefully', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ payment_eob_matched: null, fully_reconciled_posted: null, payments_without_eob: null, eob_without_payments: null }],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    const body = res.json.mock.calls[0][0];
    expect(body.stats.find((s: any) => s.key === 'payment_eob_matched').value).toBe(0);
  });

  it('expands practice aliases when locationScope=practice and practices provided', async () => {
    mockExpandWithAliases.mockResolvedValueOnce(['Site-A', 'Site-A-Alias']);
    mockQuery.mockResolvedValueOnce({
      recordset: [{ payment_eob_matched: 3, fully_reconciled_posted: 1, payments_without_eob: 0, eob_without_payments: 1 }],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ locationScope: 'practice', practices: ['Site-A'] }), res);
    expect(mockExpandWithAliases).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practices).toBe('Site-A,Site-A-Alias');
  });

  it('does not call expandWithAliases when practices is empty', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{}] });
    const res = mockRes();
    await ctrl.get(mockReq({ locationScope: 'practice' }), res);
    expect(mockExpandWithAliases).not.toHaveBeenCalled();
  });

  it('passes from/to filters', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{}] });
    const res = mockRes();
    await ctrl.get(mockReq({ from: '2024-01-01', to: '2024-12-31' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.from).toBe('2024-01-01');
    expect(body.filters.to).toBe('2024-12-31');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- FullyReconciledPayments --------------------------------------------------
describe('FullyReconciledPayments', () => {
  let ctrl: FullyReconciledPayments;

  beforeEach(() => {
    ctrl = new FullyReconciledPayments();
    mockQuery.mockReset();
  });

  it('returns 200 with empty rows', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].rows).toHaveLength(0);
  });

  it('uses mode=single when practiceId provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ practiceId: 'site-north' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses mode=list when practices array provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ practices: ['Site-A', 'Site-B'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies search filter across bankName, bankFeedId, depositDate, reconciledId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { reconciledId: 'RF-100', bankName: 'Chase', depositDate: '2024-03-01', bankFeedId: 'BF-001', amountDeposited: 1000, amountFullEra: 950 },
        { reconciledId: 'RF-200', bankName: 'Wells Fargo', depositDate: '2024-04-01', bankFeedId: 'BF-002', amountDeposited: 500, amountFullEra: 490 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'chase' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].bankName).toBe('Chase');
  });

  it('handles invalid page/pageSize with safe defaults', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    // page=-1 clamped to 1; pageSize=0 clamped to 1 (Math.max(1, Number('0')))
    await ctrl.get(mockReq({ page: '-1', pageSize: '0' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(1); // Math.min(100, Math.max(1, 0)) = Math.min(100, 1) = 1
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('pool exhausted'));
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- PaymentsWithNoEob --------------------------------------------------------
describe('PaymentsWithNoEob', () => {
  let ctrl: PaymentsWithNoEob;

  beforeEach(() => {
    ctrl = new PaymentsWithNoEob();
    mockQuery.mockReset();
  });

  it('returns 200 with empty rows', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].rows).toHaveLength(0);
  });

  it('maps rows with canFindEra=true', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { paymentId: 'BD-1', value: 'EFT-123', paymentDate: '2024-01-15', payerName: 'Aetna', paymentType: 'EFT', amount: 2500.00 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].canFindEra).toBe(true);
    expect(body.rows[0].amount).toBe(2500);
  });

  it('applies search filter on value, payerName, paymentType', async () => {
    // The controller passes search to SQL; mock returns only the row that matches.
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { paymentId: 'BD-1', value: 'EFT-001', paymentDate: '2024-01-15', payerName: 'Aetna', paymentType: 'EFT', amount: 1000 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'eft' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].paymentType).toBe('EFT');
  });

  it('passes from/to date params and practiceId', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ from: '2024-01-01', to: '2024-12-31', practiceId: 'site-a' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.from).toBe('2024-01-01');
    expect(body.filters.practiceId).toBe('site-a');
  });

  it('handles invalid page/pageSize with safe defaults', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '0', pageSize: '-10' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(25);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('network error'));
    const res = mockRes();
    await ctrl.get(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- ApplyMatch ---------------------------------------------------------------
describe('ApplyMatch', () => {
  let ctrl: ApplyMatch;

  beforeEach(() => {
    ctrl = new ApplyMatch();
    mockQuery.mockReset();
  });

  it('returns 400 when bankDepositId is missing', async () => {
    const res = mockRes();
    await ctrl.post(mockReq({}, { remittanceFileId: 'RF-001' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/bankDepositId/);
  });

  it('returns 400 when remittanceFileId is missing', async () => {
    const res = mockRes();
    await ctrl.post(mockReq({}, { bankDepositId: 'BD-001' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when both fields are missing', async () => {
    const res = mockRes();
    await ctrl.post(mockReq({}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when bankDeposit does not exist', async () => {
    // checkResult: bdExists=0, rfExists=1, alreadyMatched=0
    mockQuery.mockResolvedValueOnce({
      recordset: [{ bdExists: 0, rfExists: 1, alreadyMatched: 0 }],
    });
    const res = mockRes();
    await ctrl.post(mockReq({}, { bankDepositId: 'BD-999', remittanceFileId: 'RF-001' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].message).toMatch(/BankDeposit BD-999/);
  });

  it('returns 404 when remittanceFile does not exist', async () => {
    // checkResult: bdExists=1, rfExists=0, alreadyMatched=0
    mockQuery.mockResolvedValueOnce({
      recordset: [{ bdExists: 1, rfExists: 0, alreadyMatched: 0 }],
    });
    const res = mockRes();
    await ctrl.post(mockReq({}, { bankDepositId: 'BD-001', remittanceFileId: 'RF-999' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].message).toMatch(/RemittanceFile RF-999/);
  });

  it('returns 409 when already matched', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ bdExists: 1, rfExists: 1, alreadyMatched: 1 }],
    });
    const res = mockRes();
    await ctrl.post(mockReq({}, { bankDepositId: 'BD-001', remittanceFileId: 'RF-001' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('inserts successfully and returns 201 with new ReconciliationID', async () => {
    // 1) check query
    mockQuery.mockResolvedValueOnce({ recordset: [{ bdExists: 1, rfExists: 1, alreadyMatched: 0 }] });
    // 2) maxId query
    mockQuery.mockResolvedValueOnce({ recordset: [{ ReconciliationID: 'REC000042' }] });
    // 3) insert query
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.post(mockReq({}, { bankDepositId: 'BD-001', remittanceFileId: 'RF-001' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.reconciliationId).toBe('REC000043');
    expect(body.bankDepositId).toBe('BD-001');
  });

  it('uses fallback ReconciliationID when no existing records', async () => {
    // 1) check query
    mockQuery.mockResolvedValueOnce({ recordset: [{ bdExists: 1, rfExists: 1, alreadyMatched: 0 }] });
    // 2) maxId query returns empty -> defaults to REC000000
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // 3) insert query
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.post(mockReq({}, { bankDepositId: 'BD-002', remittanceFileId: 'RF-002' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.reconciliationId).toBe('REC000001');
  });

  it('uses actor email from x-actor-email header when present', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ bdExists: 1, rfExists: 1, alreadyMatched: 0 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ ReconciliationID: 'REC000010' }] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.post(mockReq({}, { bankDepositId: 'BD-003', remittanceFileId: 'RF-003' }, {}, { 'x-actor-email': 'admin@rcm.com' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('defaults actorEmail to "system" when header is absent', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ bdExists: 1, rfExists: 1, alreadyMatched: 0 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ ReconciliationID: 'REC000005' }] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    // No x-actor-email in headers
    const req = { query: {}, body: { bankDepositId: 'BD-004', remittanceFileId: 'RF-004' }, params: {}, headers: {} } as any;
    await ctrl.post(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB timeout'));
    const res = mockRes();
    await ctrl.post(mockReq({}, { bankDepositId: 'BD-001', remittanceFileId: 'RF-001' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
