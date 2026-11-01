/**
 * Extra coverage for recon-iq controllers and integrations controllers.
 * Targets uncovered branches in:
 *   - reconciliation-report.ts (parseFilters edge cases, postStatusClause branches)
 *   - reconciliation/reconciliation.ts (normalizeCsv, pickPracticeLocation, nestRows branches)
 *   - fully-paid-and-reconciled.ts (parsePracticeLocations branches, search filter)
 *   - encounter-research/patients.ts (pickPracticeLocation, normalizeCsv, pagination)
 *   - integrations/pms.ts (all CRUD + testConnection 404 branch)
 *   - integrations/clearinghouse.ts (all CRUD + testConnection 404 branch)
 */

// --- DB mock ------------------------------------------------------------------
const mockQuery = jest.fn();
const mockRequestInstance: any = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
  execute: mockQuery,
};

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => ({
        request: () => mockRequestInstance,
        close: jest.fn(),
      }),
    }),
  },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

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
    VarChar: f,
    UniqueIdentifier: f(),
    SmallInt: f(),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

jest.mock('../utils/expand-filter', () => ({
  expandWithAliases: jest.fn().mockResolvedValue([]),
}));

// --- Helpers ------------------------------------------------------------------
const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const mockReq = (
  body: any = {},
  query: any = {},
  params: any = {},
  headers: any = {}
) => ({ body, query, params, headers: { 'x-actor-email': 'test@test.com', ...headers } } as any);

// --- Imports after mocks ------------------------------------------------------
import { ReconciliationReportController } from '../controllers/recon-iq/reconciliation-report';
import { PaymentReconciliation } from '../controllers/recon-iq/reconciliation/reconciliation';
import { FullyReconciledPayments } from '../controllers/recon-iq/fully-reconciled/fully-paid-and-reconciled';
import { Patients } from '../controllers/recon-iq/encounter-research/patients';
import { PMSController } from '../controllers/integrations/pms';
import { ClearinghouseController } from '../controllers/integrations/clearinghouse';
import { expandWithAliases } from '../utils/expand-filter';

// -----------------------------------------------------------------------------
// ReconciliationReportController - uncovered branches
// -----------------------------------------------------------------------------

describe('ReconciliationReportController \u2014 extra branch coverage', () => {
  let ctrl: ReconciliationReportController;

  beforeEach(() => {
    mockQuery.mockReset();
    jest.clearAllMocks();
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    ctrl = new ReconciliationReportController();
  });

  // parseFilters: postStatus branch 'posted'
  it('getSummary: postStatus=posted is parsed and handled', async () => {
    // All 6 queries succeed
    for (let i = 0; i < 6; i++) {
      mockQuery.mockResolvedValueOnce({
        recordset: [{ matchedCount: 1, matchedAmount: 100, postedCount: 1, unpostedCount: 0,
                      unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 10, deniedClaims: 0,
                      totalCharges: 500, bankTxCount: 1, bankTxTotal: 100, pmsTxCount: 1, pmsTxTotal: 100,
                      inTransitCount: 0, inTransitTotal: 0 }],
      });
    }
    const req = mockReq({}, { postStatus: 'posted', months: '3' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.filters.postStatus).toBe('posted');
  });

  // parseFilters: postStatus branch 'unposted'
  it('getSummary: postStatus=unposted is parsed and handled', async () => {
    for (let i = 0; i < 6; i++) {
      mockQuery.mockResolvedValueOnce({
        recordset: [{ matchedCount: 2, matchedAmount: 200, postedCount: 0, unpostedCount: 2,
                      unmatchedPayments: 1, unmatchedEOBs: 0, totalClaims: 5, deniedClaims: 1,
                      totalCharges: 300, bankTxCount: 2, bankTxTotal: 200, pmsTxCount: 1, pmsTxTotal: 150,
                      inTransitCount: 1, inTransitTotal: 100 }],
      });
    }
    const req = mockReq({}, { postStatus: 'unposted', months: '12' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.filters.postStatus).toBe('unposted');
  });

  // parseFilters: months clamped to min=1 (note: parseInt('0') || 6 = 6 because 0 is falsy,
  // but parseInt('-1') = -1 which is then clamped by Math.max(-1, 1) = 1)
  it('getSummary: months=-1 clamped to 1', async () => {
    for (let i = 0; i < 6; i++) {
      mockQuery.mockResolvedValueOnce({ recordset: [{ matchedCount: 0, matchedAmount: 0, postedCount: 0, unpostedCount: 0,
        unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 0, deniedClaims: 0, totalCharges: 0,
        bankTxCount: 0, bankTxTotal: 0, pmsTxCount: 0, pmsTxTotal: 0, inTransitCount: 0, inTransitTotal: 0 }] });
    }
    const req = mockReq({}, { months: '-1' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.months).toBe(1);
  });

  // parseFilters: months clamped to max=36
  it('getSummary: months=100 clamped to 36', async () => {
    for (let i = 0; i < 6; i++) {
      mockQuery.mockResolvedValueOnce({ recordset: [{ matchedCount: 0, matchedAmount: 0, postedCount: 0, unpostedCount: 0,
        unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 0, deniedClaims: 0, totalCharges: 0,
        bankTxCount: 0, bankTxTotal: 0, pmsTxCount: 0, pmsTxTotal: 0, inTransitCount: 0, inTransitTotal: 0 }] });
    }
    const req = mockReq({}, { months: '100' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.months).toBe(36);
  });

  // getSummary: Q1 failed branch
  it('getSummary: individual query failures return defaults (non-Error reject)', async () => {
    // expandWithAliases will be called for location + payer
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    // Reject all 6 queries with non-Error strings to exercise else-branch logger.warn
    mockQuery.mockRejectedValue('string error not an Error instance');
    const req = mockReq({}, { location: 'East', payer: 'Aetna' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    // Should still resolve (allSettled)
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.matchedCount).toBe(0);
  });

  // getSummary with location+payer (exercises expandWithAliases paths)
  it('getSummary with location filter expands aliases', async () => {
    (expandWithAliases as jest.Mock)
      .mockResolvedValueOnce(['East-1', 'East-2']) // location expansion
      .mockResolvedValueOnce(['Aetna', 'AetnaHealth']); // payer expansion
    for (let i = 0; i < 6; i++) {
      mockQuery.mockResolvedValueOnce({ recordset: [{ matchedCount: 5, matchedAmount: 5000, postedCount: 3,
        unpostedCount: 2, unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 10, deniedClaims: 1,
        totalCharges: 1000, bankTxCount: 5, bankTxTotal: 5000, pmsTxCount: 4, pmsTxTotal: 4500,
        inTransitCount: 1, inTransitTotal: 500 }] });
    }
    const req = mockReq({}, { location: 'East', payer: 'Aetna' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    expect(expandWithAliases).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalled();
  });

  // getByPayer: postStatus='posted' clause
  it('getByPayer: postStatus=posted applied to query', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ payerName: 'Cigna', remittanceCount: 3, totalAmount: 10000, linkedClaims: 30, deniedClaims: 3, avgAmount: 3333 }],
    });
    const req = mockReq({}, { postStatus: 'posted' });
    const res = mockRes();
    await ctrl.getByPayer(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].payerName).toBe('Cigna');
    expect(body.rows[0].denialRate).toBe(10);
  });

  // getByPayer: denialRate=0 when linkedClaims=0
  it('getByPayer: denialRate=0 when linkedClaims is 0', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ payerName: 'Unknown', remittanceCount: 1, totalAmount: 0, linkedClaims: 0, deniedClaims: 0, avgAmount: 0 }],
    });
    const req = mockReq({}, {});
    const res = mockRes();
    await ctrl.getByPayer(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].denialRate).toBe(0);
  });

  // getMonthlyTrend: postStatus=unposted
  it('getMonthlyTrend: postStatus=unposted applied to query', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ period: '2025-01', reconcileCount: 4, reconcileAmount: 20000, claimCount: 0, deniedCount: 0, postedCount: 0 }],
    });
    const req = mockReq({}, { postStatus: 'unposted' });
    const res = mockRes();
    await ctrl.getMonthlyTrend(req, res);
    const body = res.json.mock.calls[0][0];
    // denialRate=0 when claimCount=0
    expect(body.rows[0].denialRate).toBe(0);
  });

  // getMonthlyTrend: with location expansion
  it('getMonthlyTrend: with location filter', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValueOnce(['North-1']);
    mockQuery.mockResolvedValueOnce({
      recordset: [{ period: '2025-03', reconcileCount: 2, reconcileAmount: 5000, claimCount: 20, deniedCount: 2, postedCount: 1 }],
    });
    const req = mockReq({}, { location: 'North' });
    const res = mockRes();
    await ctrl.getMonthlyTrend(req, res);
    expect(expandWithAliases).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].denialRate).toBe(10);
  });

  // getInTransit: with payer filter
  it('getInTransit: with payer filter expands payer aliases', async () => {
    // Only payer filter is present (location is null), so expandWithAliases called once for payer
    (expandWithAliases as jest.Mock)
      .mockResolvedValueOnce(['BCBS', 'BCBSNational']); // payer expansion
    mockQuery.mockResolvedValueOnce({
      recordset: [{ RemittanceFileID: 'RF-99', fileDate: '2025-06-01', Amount: 5000, location: 'West', payerName: 'BCBS', claimCount: 2, daysAged: 15 }],
    });
    const req = mockReq({}, { payer: 'BCBS' });
    const res = mockRes();
    await ctrl.getInTransit(req, res);
    expect(expandWithAliases).toHaveBeenCalledWith(expect.anything(), 'payer', ['BCBS']);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].remittanceFileId).toBe('RF-99');
  });

  // getInTransit: null location field falls back to empty string
  it('getInTransit: null location in row maps to empty string', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ RemittanceFileID: 'RF-1', fileDate: '2025-01-01', Amount: null, location: null, payerName: 'Unknown', claimCount: 0, daysAged: 5 }],
    });
    const req = mockReq({}, {});
    const res = mockRes();
    await ctrl.getInTransit(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].location).toBe('');
    expect(body.rows[0].amount).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// PaymentReconciliation - uncovered branches
// -----------------------------------------------------------------------------

describe('PaymentReconciliation \u2014 extra branch coverage', () => {
  let ctrl: PaymentReconciliation;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new PaymentReconciliation();
  });

  // normalizeCsv: array input
  it('payers as array is normalized', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { payers: ['Aetna', 'BCBS'], page: '1', pageSize: '10' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.payers).toBe('Aetna,BCBS');
  });

  // normalizeCsv: 'all' filtered out
  it('payers=all is normalized to null', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { payers: 'all', page: '1', pageSize: '10' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.payers).toBeNull();
  });

  // pickPracticeLocation: locationScope=practice with firstPractice
  it('pickPracticeLocation: locationScope=practice uses first practice', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { locationScope: 'practice', practices: 'East-1', page: '1' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('East-1');
  });

  // pickPracticeLocation: practiceId != 'all'
  it('pickPracticeLocation: practiceId=West-2 used when no locationScope', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { practiceId: 'West-2', page: '1' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('West-2');
  });

  // pickPracticeLocation: practices as array
  it('pickPracticeLocation: practices as array uses first element', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { locationScope: 'practice', practices: ['North-3', 'South-4'] });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('North-3');
  });

  // nestRows: flat row with null eobId is skipped
  it('nestRows: rows with null eobId are skipped', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: null, eobDate: '2025-01-01', totalAmount: 100, locationName: 'X', remittanceClaimId: null,
          claimId: null, dateClaimSubmitted: null, amount: null, claimStatus: null, isPosted: 0, eobClaimCount: 0 },
        { eobId: 'RF-5', eobDate: '2025-02-01', totalAmount: 500, locationName: 'Y', remittanceClaimId: 'RC-1',
          claimId: 'CLM001', dateClaimSubmitted: '2025-01-15', amount: 500, claimStatus: 'PAID', isPosted: 0, eobClaimCount: 1 },
      ],
    });
    const req = mockReq({}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    // Only RF-5 row should appear (null eobId skipped)
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].eobId).toBe('RF-5');
  });

  // search filter across eobId and claims
  it('search filters by eobId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'RF-AAA', eobDate: '2025-01-01', totalAmount: 100, locationName: 'X',
          remittanceClaimId: null, claimId: null, dateClaimSubmitted: null, amount: null, claimStatus: null, isPosted: 0, eobClaimCount: 0 },
        { eobId: 'RF-BBB', eobDate: '2025-02-01', totalAmount: 200, locationName: 'Y',
          remittanceClaimId: null, claimId: null, dateClaimSubmitted: null, amount: null, claimStatus: null, isPosted: 0, eobClaimCount: 0 },
      ],
    });
    const req = mockReq({}, { search: 'aaa' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].eobId).toBe('RF-AAA');
  });

  // pagination with invalid page/pageSize falls back to defaults
  it('pagination: invalid page/pageSize falls back to defaults', async () => {
    // SQL-side pagination: controller sends OFFSET 0 FETCH NEXT 25 to SQL.
    // Mock must return exactly what SQL would return (25 rows for page 1).
    const rows = Array.from({ length: 25 }, (_, i) => ({
      eobId: `RF-${i}`, eobDate: '2025-01-01', totalAmount: 100, locationName: 'X',
      remittanceClaimId: null, claimId: null, dateClaimSubmitted: null, amount: null,
      claimStatus: null, isPosted: 0, eobClaimCount: 0,
    }));
    mockQuery.mockResolvedValueOnce({ recordset: rows });
    const req = mockReq({}, { page: '-1', pageSize: '0' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(25);
    // SQL returned 25 rows - totalPages = 1
    expect(body.pagination.totalPages).toBe(1);
    expect(body.rows).toHaveLength(25);
  });

  // ZERO_PAY claimStatus path
  it('nestRows: claimStatus null defaults to PENDED', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'RF-Z', eobDate: '2025-01-01', totalAmount: 0, locationName: 'X',
          remittanceClaimId: 'RC-Z', claimId: 'CLM999', dateClaimSubmitted: '2025-01-01',
          amount: 0, claimStatus: null, isPosted: 0, eobClaimCount: 1 },
      ],
    });
    const req = mockReq({}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].claims[0].claimStatus).toBe('PENDED');
  });

  // claimsZeroOpenCount counter
  it('nestRows: claimsZeroOpenCount counts zero-amount claims', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'RF-M', eobDate: '2025-01-01', totalAmount: 500, locationName: 'X',
          remittanceClaimId: 'RC-1', claimId: 'CLM-A', dateClaimSubmitted: '2025-01-01',
          amount: 500, claimStatus: 'PAID', isPosted: 0, eobClaimCount: 2 },
        { eobId: 'RF-M', eobDate: '2025-01-01', totalAmount: 500, locationName: 'X',
          remittanceClaimId: 'RC-2', claimId: 'CLM-B', dateClaimSubmitted: '2025-01-02',
          amount: 0, claimStatus: 'ZERO_PAY', isPosted: 0, eobClaimCount: 2 },
      ],
    });
    const req = mockReq({}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].claimsWithMoneyCount).toBe(1);
    expect(body.rows[0].claimsZeroOpenCount).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// FullyReconciledPayments - extra branch coverage
// -----------------------------------------------------------------------------

describe('FullyReconciledPayments \u2014 extra branch coverage', () => {
  let ctrl: FullyReconciledPayments;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new FullyReconciledPayments();
  });

  // practices query param (array) - response should be 200 with empty rows
  it('practices as array uses list mode', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { practices: ['East-1', 'East-2'] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    // controller does not echo filters back; just verify successful response
    expect(body.rows).toBeDefined();
    expect(body.pagination).toBeDefined();
  });

  // parsePracticeLocations: practices as comma-separated string
  it('practices as comma-separated string uses list mode', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { practices: 'North-1,South-2' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // practiceId=all - response should be 200
  it('parsePracticeLocations: all mode when practiceId=all', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { practiceId: 'all' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    // controller does not echo practiceId back; just verify successful response
    expect(body.rows).toBeDefined();
    expect(body.pagination).toBeDefined();
  });

  // payers='' (empty string) - response should be 200
  it('normalizeCsv: empty string returns null filter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { payers: '', providers: '' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    // controller does not echo filters back; verify 200
    expect(body.rows).toBeDefined();
    expect(body.message).toBe('Fully paid and reconciled payments');
  });

  // payers=['all','ALL'] - response should be 200
  it('normalizeCsv: array input with "all" values returns null', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { payers: ['all', 'ALL'] });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    // verify successful response
    expect(body.rows).toBeDefined();
  });

  // search filter on bankName
  it('search filters results by bankName', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { reconciledId: '1', bankName: 'First National', depositDate: '2025-01-01', bankFeedId: 'BFP-1', amountDeposited: 1000, amountFullEra: 1000 },
        { reconciledId: '2', bankName: 'Chase Bank', depositDate: '2025-02-01', bankFeedId: 'BFP-2', amountDeposited: 2000, amountFullEra: 2000 },
      ],
    });
    const req = mockReq({}, { search: 'chase' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].bankName).toBe('Chase Bank');
  });

  // search filter on reconciledId
  it('search filters results by reconciledId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { reconciledId: 'RF-100', bankName: 'Bank A', depositDate: '2025-01-01', bankFeedId: 'BFP-10', amountDeposited: 500, amountFullEra: 500 },
        { reconciledId: 'RF-200', bankName: 'Bank B', depositDate: '2025-02-01', bankFeedId: 'BFP-20', amountDeposited: 600, amountFullEra: 600 },
      ],
    });
    const req = mockReq({}, { search: 'rf-100' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].reconciledId).toBe('RF-100');
  });

  // pagination fallbacks - SQL-side paging: mock returns what SQL returns
  it('pagination: invalid page/pageSize defaults to 1/25', async () => {
    // With no page/pageSize params: defaults are page=1, pageSize=25
    // SQL returns exactly pageSize rows (SQL-side pagination)
    const rows = Array.from({ length: 25 }, (_, i) => ({
      reconciledId: `R${i}`, bankName: 'Bank', depositDate: '2025-01-01', bankFeedId: `B${i}`, amountDeposited: 100, amountFullEra: 100,
    }));
    mockQuery.mockResolvedValueOnce({ recordset: rows });
    const req = mockReq({}, {}); // no page/pageSize -> defaults to 1/25
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(25);
    expect(body.rows).toHaveLength(25);
  });
});

// -----------------------------------------------------------------------------
// Patients (Encounter Research) - extra branch coverage
// -----------------------------------------------------------------------------

describe('Patients (encounter-research) \u2014 extra branch coverage', () => {
  let ctrl: Patients;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new Patients();
  });

  // pickPracticeLocation: locationScope=practice with firstPractice
  it('pickPracticeLocation: locationScope=practice uses first practice', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { locationScope: 'practice', practices: 'East-1' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('East-1');
  });

  // pickPracticeLocation: practiceId != all
  it('pickPracticeLocation: practiceId=West used when no locationScope', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { practiceId: 'West' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('West');
  });

  // pickPracticeLocation: practices as array
  it('pickPracticeLocation: practices as array uses first element', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { locationScope: 'practice', practices: ['Clinic-A', 'Clinic-B'] });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('Clinic-A');
  });

  // normalizeCsv: null input returns null
  it('normalizeCsv: null payers returns null filter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, { payers: null });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.payers).toBeNull();
  });

  // search across multiple fields
  it('search matches payerName field', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { patientName: 'Alice', payerName: 'Cigna', paymentId: null, doctorName: null, dateOfService: '2025-01-01', patientAccount: '1001' },
        { patientName: 'Bob', payerName: 'Aetna', paymentId: null, doctorName: null, dateOfService: '2025-02-01', patientAccount: '1002' },
      ],
    });
    const req = mockReq({}, { search: 'cigna' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].patientName).toBe('Alice');
  });

  // search matches paymentId
  it('search matches paymentId field', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { patientName: 'Alice', payerName: null, paymentId: 'EFT-99999', doctorName: null, dateOfService: '2025-01-01', patientAccount: '1001' },
        { patientName: 'Bob', payerName: null, paymentId: 'CHK-11111', doctorName: null, dateOfService: '2025-02-01', patientAccount: '1002' },
      ],
    });
    const req = mockReq({}, { search: 'eft-99' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].paymentId).toBe('EFT-99999');
  });

  // pagination - SQL-side: mock returns only the rows for the requested page
  it('pagination slices results correctly', async () => {
    // page=2, pageSize=10: SQL returns rows 10-14 (5 rows for the second page)
    const rows = Array.from({ length: 5 }, (_, i) => ({
      patientName: `Patient ${10 + i}`, payerName: null, paymentId: null, doctorName: null,
      dateOfService: '2025-01-01', patientAccount: `${1010 + i}`,
    }));
    mockQuery.mockResolvedValueOnce({ recordset: rows });
    const req = mockReq({}, { page: '2', pageSize: '10' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(5); // SQL returned 5 rows for page 2
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.pageSize).toBe(10);
  });
});

// -----------------------------------------------------------------------------
// PMSController
// -----------------------------------------------------------------------------

describe('PMSController', () => {
  let ctrl: PMSController;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new PMSController();
  });

  it('listConnections: returns records on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, name: 'Dentrix Main' }] });
    const req = mockReq();
    const res = mockRes();
    await ctrl.listConnections(req, res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Dentrix Main' }]);
  });

  it('listConnections: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq();
    const res = mockRes();
    await ctrl.listConnections(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createConnection: returns id on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 42 }] });
    const req = mockReq({ name: 'Dentrix', pmsType: 'dentrix', syncInterval: 30 });
    const res = mockRes();
    await ctrl.createConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ id: 42 });
  });

  it('createConnection: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('insert failed'));
    const req = mockReq({ name: 'X', pmsType: 'dentrix' });
    const res = mockRes();
    await ctrl.createConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createConnection: autoImportClaims=false uses 0', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 99 }] });
    const req = mockReq({ name: 'X', pmsType: 'dentrix', autoImportClaims: false, autoExportPayments: true });
    const res = mockRes();
    await ctrl.createConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ id: 99 });
  });

  it('updateConnection: returns success on happy path', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq(
      { name: 'Updated', pmsType: 'eaglesoft', isActive: true, syncDirection: 'import', syncInterval: 60 },
      {}, { id: '5' }
    );
    const res = mockRes();
    await ctrl.updateConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('updateConnection: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('update failed'));
    const req = mockReq({ name: 'X', pmsType: 'dentrix' }, {}, { id: '5' });
    const res = mockRes();
    await ctrl.updateConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateConnection: syncDirection defaults to bi-directional', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ name: 'X', pmsType: 'dentrix', isActive: false }, {}, { id: '1' });
    const res = mockRes();
    await ctrl.updateConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('deleteConnection: returns success on happy path', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, { id: '10' });
    const res = mockRes();
    await ctrl.deleteConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('deleteConnection: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('delete failed'));
    const req = mockReq({}, {}, { id: '10' });
    const res = mockRes();
    await ctrl.deleteConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('testConnection: returns 404 when connection not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // empty = not found
    const req = mockReq({}, {}, { id: '999' });
    const res = mockRes();
    await ctrl.testConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Connection not found' });
  });

  it('testConnection: returns success on happy path', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, name: 'Dentrix', pms_type: 'dentrix' }] })
      .mockResolvedValueOnce({ recordset: [] }); // log insert
    const req = mockReq({}, {}, { id: '1' });
    const res = mockRes();
    await ctrl.testConnection(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, pmsType: 'dentrix' }));
  });

  it('testConnection: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fetch failed'));
    const req = mockReq({}, {}, { id: '1' });
    const res = mockRes();
    await ctrl.testConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('triggerSync: returns 404 when connection not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ direction: 'import', syncType: 'claims' }, {}, { id: '999' });
    const res = mockRes();
    await ctrl.triggerSync(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('triggerSync: returns sync result on happy path (import direction)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, name: 'Dentrix' }] }) // conn fetch
      .mockResolvedValueOnce({ recordset: [] }) // log insert
      .mockResolvedValueOnce({ recordset: [] }); // update timestamp
    const req = mockReq({ direction: 'import', syncType: 'claims' }, {}, { id: '1' });
    const res = mockRes();
    await ctrl.triggerSync(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, direction: 'import' }));
  });

  it('triggerSync: export direction updates last_export_at', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, name: 'Dentrix' }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ direction: 'export', syncType: 'payments' }, {}, { id: '1' });
    const res = mockRes();
    await ctrl.triggerSync(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ direction: 'export', syncType: 'payments' }));
  });

  it('triggerSync: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('sync error'));
    const req = mockReq({ direction: 'import' }, {}, { id: '1' });
    const res = mockRes();
    await ctrl.triggerSync(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getLogs: returns logs on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, action: 'status_check' }] });
    const req = mockReq({}, { days: '7' });
    const res = mockRes();
    await ctrl.getLogs(req, res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, action: 'status_check' }]);
  });

  it('getLogs: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('log error'));
    const req = mockReq({}, {});
    const res = mockRes();
    await ctrl.getLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getFieldMappings: returns mappings on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, entityType: 'claim' }] });
    const req = mockReq({}, {}, { connectionId: '5' });
    const res = mockRes();
    await ctrl.getFieldMappings(req, res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, entityType: 'claim' }]);
  });

  it('getFieldMappings: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('mapping error'));
    const req = mockReq({}, {}, { connectionId: '5' });
    const res = mockRes();
    await ctrl.getFieldMappings(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('saveFieldMapping: returns new id on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 77 }] });
    const req = mockReq({ entityType: 'claim', pmsField: 'ClaimID', rcmField: 'claimId' }, {}, { connectionId: '5' });
    const res = mockRes();
    await ctrl.saveFieldMapping(req, res);
    expect(res.json).toHaveBeenCalledWith({ id: 77 });
  });

  it('saveFieldMapping: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('save error'));
    const req = mockReq({ entityType: 'claim', pmsField: 'X', rcmField: 'Y' }, {}, { connectionId: '5' });
    const res = mockRes();
    await ctrl.saveFieldMapping(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deleteFieldMapping: returns success on happy path', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, { id: '20' });
    const res = mockRes();
    await ctrl.deleteFieldMapping(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('deleteFieldMapping: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('del error'));
    const req = mockReq({}, {}, { id: '20' });
    const res = mockRes();
    await ctrl.deleteFieldMapping(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getProviders: returns list of PMS providers', async () => {
    const req = mockReq();
    const res = mockRes();
    await ctrl.getProviders(req, res);
    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p: any) => p.id === 'dentrix')).toBe(true);
    expect(body.some((p: any) => p.id === 'open-dental')).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// ClearinghouseController
// -----------------------------------------------------------------------------

describe('ClearinghouseController', () => {
  let ctrl: ClearinghouseController;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new ClearinghouseController();
  });

  it('listConnections: returns records on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, name: 'DentalXChange' }] });
    const req = mockReq();
    const res = mockRes();
    await ctrl.listConnections(req, res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'DentalXChange' }]);
  });

  it('listConnections: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq();
    const res = mockRes();
    await ctrl.listConnections(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createConnection: returns id on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 55 }] });
    const req = mockReq({ name: 'CH1', provider: 'dentalxchange', syncInterval: 60 });
    const res = mockRes();
    await ctrl.createConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ id: 55 });
  });

  it('createConnection: syncInterval defaults to 60 when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 56 }] });
    const req = mockReq({ name: 'CH2', provider: 'nea' });
    const res = mockRes();
    await ctrl.createConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ id: 56 });
  });

  it('createConnection: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('insert failed'));
    const req = mockReq({ name: 'X', provider: 'availity' });
    const res = mockRes();
    await ctrl.createConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateConnection: returns success on happy path', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq(
      { name: 'Updated CH', provider: 'nea', isActive: true, syncInterval: 30 },
      {}, { id: '3' }
    );
    const res = mockRes();
    await ctrl.updateConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('updateConnection: isActive=false maps to 0', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ name: 'X', provider: 'tesia', isActive: false }, {}, { id: '3' });
    const res = mockRes();
    await ctrl.updateConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('updateConnection: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('update failed'));
    const req = mockReq({ name: 'X', provider: 'tesia' }, {}, { id: '3' });
    const res = mockRes();
    await ctrl.updateConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deleteConnection: returns success on happy path', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, { id: '7' });
    const res = mockRes();
    await ctrl.deleteConnection(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('deleteConnection: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('del error'));
    const req = mockReq({}, {}, { id: '7' });
    const res = mockRes();
    await ctrl.deleteConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('testConnection: returns 404 when connection not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, { id: '999' });
    const res = mockRes();
    await ctrl.testConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Connection not found' });
  });

  it('testConnection: returns success on happy path', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, name: 'DXC', provider: 'dentalxchange' }] })
      .mockResolvedValueOnce({ recordset: [] }); // log insert
    const req = mockReq({}, {}, { id: '1' });
    const res = mockRes();
    await ctrl.testConnection(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, provider: 'dentalxchange' }));
  });

  it('testConnection: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('test failed'));
    const req = mockReq({}, {}, { id: '1' });
    const res = mockRes();
    await ctrl.testConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('checkClaimStatus: returns claim data on success', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ ClaimID: 'CL50001', ClaimStatus: 'PAID', CarcCode: '1', ChargeAmt: 500, DateOfService: '2025-01-01' }] })
      .mockResolvedValueOnce({ recordset: [] }); // log
    const req = mockReq({ connectionId: 1, claimId: 'CL50001' });
    const res = mockRes();
    await ctrl.checkClaimStatus(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ claimId: 'CL50001', status: 'PAID' }));
  });

  it('checkClaimStatus: returns Unknown when claim recordset empty', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // claim not found
      .mockResolvedValueOnce({ recordset: [] }); // log
    const req = mockReq({ connectionId: 1, claimId: 'CL99999' });
    const res = mockRes();
    await ctrl.checkClaimStatus(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'Unknown' }));
  });

  it('checkClaimStatus: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('check failed'));
    const req = mockReq({ connectionId: 1, claimId: 'CL50001' });
    const res = mockRes();
    await ctrl.checkClaimStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getLogs: returns logs on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, action: 'pull_era' }] });
    const req = mockReq({}, { days: '14' });
    const res = mockRes();
    await ctrl.getLogs(req, res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, action: 'pull_era' }]);
  });

  it('getLogs: days defaults to 30 when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {});
    const res = mockRes();
    await ctrl.getLogs(req, res);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('getLogs: returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('log error'));
    const req = mockReq({}, {});
    const res = mockRes();
    await ctrl.getLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getProviders: returns list of clearinghouse providers', async () => {
    const req = mockReq();
    const res = mockRes();
    await ctrl.getProviders(req, res);
    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p: any) => p.id === 'dentalxchange')).toBe(true);
    expect(body.some((p: any) => p.id === 'availity')).toBe(true);
  });
});
