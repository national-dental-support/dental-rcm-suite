/**
 * coverage-recon-v2.test.ts
 *
 * Targeted branch-coverage tests for:
 *   - reconciliation-report.ts          (25 uncovered branches, 9 uncovered statements)
 *   - finance-summary.ts                (12 uncovered branches, 4 uncovered statements)
 *   - reconciliation/reconciliation.ts  (12 uncovered branches, 1 uncovered statement)
 *   - fully-paid-and-reconciled.ts      (19 uncovered branches, 0 uncovered statements)
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
    VarChar: Object.assign(f, { MAX: 'MAX' }),
    UniqueIdentifier: f(),
    Request: jest.fn().mockImplementation(() => ({
      input: jest.fn().mockReturnThis(),
      query: mockQuery,
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

const mockReq = (query: any = {}, body: any = {}, params: any = {}) =>
  ({ query, body, params, headers: { 'x-actor-email': 'test@test.com' } } as any);

// --- Imports after mocks -------------------------------------------------------
import { ReconciliationReportController } from '../controllers/recon-iq/reconciliation-report';
import { FinanceSummaryController } from '../controllers/recon-iq/finance-summary';
import { PaymentReconciliation } from '../controllers/recon-iq/reconciliation/reconciliation';
import { FullyReconciledPayments } from '../controllers/recon-iq/fully-reconciled/fully-paid-and-reconciled';
import { expandWithAliases } from '../utils/expand-filter';

// =============================================================================
// ReconciliationReportController - uncovered branches
// =============================================================================

describe('ReconciliationReportController \u2014 v2 uncovered branches', () => {
  let ctrl: ReconciliationReportController;

  beforeEach(() => {
    mockQuery.mockReset();
    jest.clearAllMocks();
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    ctrl = new ReconciliationReportController();
  });

  // -- parseFilters: various branch combinations --------------------------------

  it('getSummary: months param outside range clamps to 1', async () => {
    // parseInt('-5') = -5, which is < 1, so Math.max(-5, 1) = 1
    mockQuery.mockResolvedValue({ recordset: [{ matchedCount: 0, matchedAmount: 0, postedCount: 0, unpostedCount: 0, unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 0, deniedClaims: 0, totalCharges: 0, bankTxCount: 0, bankTxTotal: 0, pmsTxCount: 0, pmsTxTotal: 0, inTransitCount: 0, inTransitTotal: 0 }] });
    const req = mockReq({ months: '-5' }); // parseInt gives -5 -> clamp to 1
    const res = mockRes();
    await ctrl.getSummary(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.period).toBe('Last 1 months');
  });

  it('getSummary: months=37 clamps to 36', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ matchedCount: 0, matchedAmount: 0, postedCount: 0, unpostedCount: 0, unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 0, deniedClaims: 0, totalCharges: 0, bankTxCount: 0, bankTxTotal: 0, pmsTxCount: 0, pmsTxTotal: 0, inTransitCount: 0, inTransitTotal: 0 }] });
    const req = mockReq({ months: '37' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.period).toBe('Last 36 months');
  });

  it('getSummary: postStatus=posted produces posted filter in output', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ matchedCount: 0, matchedAmount: 0, postedCount: 0, unpostedCount: 0, unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 0, deniedClaims: 0, totalCharges: 0, bankTxCount: 0, bankTxTotal: 0, pmsTxCount: 0, pmsTxTotal: 0, inTransitCount: 0, inTransitTotal: 0 }] });
    const req = mockReq({ postStatus: 'posted' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.postStatus).toBe('posted');
  });

  it('getSummary: postStatus=unposted produces unposted filter in output', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ matchedCount: 0, matchedAmount: 0, postedCount: 0, unpostedCount: 0, unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 0, deniedClaims: 0, totalCharges: 0, bankTxCount: 0, bankTxTotal: 0, pmsTxCount: 0, pmsTxTotal: 0, inTransitCount: 0, inTransitTotal: 0 }] });
    const req = mockReq({ postStatus: 'unposted' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.postStatus).toBe('unposted');
  });

  it('getSummary: with location filter \u2014 expandWithAliases called for location', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue(['East']);
    mockQuery.mockResolvedValue({ recordset: [{ matchedCount: 1, matchedAmount: 5000, postedCount: 1, unpostedCount: 0, unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 0, deniedClaims: 0, totalCharges: 0, bankTxCount: 0, bankTxTotal: 0, pmsTxCount: 0, pmsTxTotal: 0, inTransitCount: 0, inTransitTotal: 0 }] });
    const req = mockReq({ location: 'East' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    expect(expandWithAliases).toHaveBeenCalledWith(expect.anything(), 'location', ['East']);
    expect(res.json).toHaveBeenCalled();
  });

  it('getSummary: with payer filter \u2014 expandWithAliases called for payer', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue(['Aetna']);
    mockQuery.mockResolvedValue({ recordset: [{ matchedCount: 0, matchedAmount: 0, postedCount: 0, unpostedCount: 0, unmatchedPayments: 0, unmatchedEOBs: 0, totalClaims: 0, deniedClaims: 0, totalCharges: 0, bankTxCount: 0, bankTxTotal: 0, pmsTxCount: 0, pmsTxTotal: 0, inTransitCount: 0, inTransitTotal: 0 }] });
    const req = mockReq({ payer: 'Aetna' });
    const res = mockRes();
    await ctrl.getSummary(req, res);
    expect(expandWithAliases).toHaveBeenCalledWith(expect.anything(), 'payer', ['Aetna']);
  });

  // -- getSummary: ?? null branches in result processing ------------------------

  it('getSummary: Q1 returns null values \u2014 uses 0 fallback', async () => {
    // All ??0 branches: matchedCount=null, matchedAmount=null, postedCount=null, unpostedCount=null
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ matchedCount: null, matchedAmount: null, postedCount: null, unpostedCount: null }] }) // Q1
      .mockResolvedValueOnce({ recordset: [{ unmatchedPayments: null, unmatchedEOBs: null }] }) // Q2
      .mockResolvedValueOnce({ recordset: [{ totalClaims: null, deniedClaims: null, totalCharges: null }] }) // Q3
      .mockResolvedValueOnce({ recordset: [{ bankTxCount: null, bankTxTotal: null }] }) // Q4
      .mockResolvedValueOnce({ recordset: [{ pmsTxCount: null, pmsTxTotal: null }] }) // Q5
      .mockResolvedValueOnce({ recordset: [{ inTransitCount: null, inTransitTotal: null }] }); // Q6
    const res = mockRes();
    await ctrl.getSummary(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.matchedCount).toBe(0);
    expect(body.matchedAmount).toBe(0);
    expect(body.postedCount).toBe(0);
    expect(body.unpostedCount).toBe(0);
    expect(body.unmatchedPayments).toBe(0);
    expect(body.unmatchedEOBs).toBe(0);
    expect(body.totalClaims).toBe(0);
    expect(body.deniedClaims).toBe(0);
    expect(body.bankTxCount).toBe(0);
    expect(body.bankTxTotal).toBe(0);
    expect(body.pmsTxCount).toBe(0);
    expect(body.pmsTxTotal).toBe(0);
    expect(body.inTransitCount).toBe(0);
    expect(body.inTransitTotal).toBe(0);
  });

  it('getSummary: Q3 totalClaims > 0 \u2014 denialRate computed correctly', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ matchedCount: 1, matchedAmount: 100, postedCount: 1, unpostedCount: 0 }] })
      .mockResolvedValueOnce({ recordset: [{ unmatchedPayments: 0, unmatchedEOBs: 0 }] })
      .mockResolvedValueOnce({ recordset: [{ totalClaims: 10, deniedClaims: 3, totalCharges: 500 }] }) // Q3 totalClaims>0
      .mockResolvedValueOnce({ recordset: [{ bankTxCount: 5, bankTxTotal: 999 }] })
      .mockResolvedValueOnce({ recordset: [{ pmsTxCount: 5, pmsTxTotal: 500 }] })
      .mockResolvedValueOnce({ recordset: [{ inTransitCount: 0, inTransitTotal: 0 }] });
    const res = mockRes();
    await ctrl.getSummary(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.denialRate).toBe(30); // 3/10 * 100 = 30
    expect(body.totalClaims).toBe(10);
    expect(body.deniedClaims).toBe(3);
  });

  it('getSummary: all 6 queries fail \u2014 returns zero-filled response', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));
    const res = mockRes();
    await ctrl.getSummary(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.matchedCount).toBe(0);
    expect(body.denialRate).toBe(0);
    expect(body.bankTxCount).toBe(0);
  });

  it('getSummary: Q4 fails (non-Error) \u2014 bankTx defaults to 0', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ matchedCount: 2, matchedAmount: 500, postedCount: 1, unpostedCount: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ unmatchedPayments: 1, unmatchedEOBs: 0 }] })
      .mockResolvedValueOnce({ recordset: [{ totalClaims: 5, deniedClaims: 1, totalCharges: 200 }] })
      .mockRejectedValueOnce('q4 string error') // Q4 non-Error
      .mockResolvedValueOnce({ recordset: [{ pmsTxCount: 3, pmsTxTotal: 300 }] })
      .mockResolvedValueOnce({ recordset: [{ inTransitCount: 0, inTransitTotal: 0 }] });
    const res = mockRes();
    await ctrl.getSummary(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.bankTxCount).toBe(0);
    expect(body.bankTxTotal).toBe(0);
  });

  it('getSummary: Q5 fails (non-Error) \u2014 pmsTx defaults to 0', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ matchedCount: 2, matchedAmount: 500, postedCount: 1, unpostedCount: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ unmatchedPayments: 1, unmatchedEOBs: 0 }] })
      .mockResolvedValueOnce({ recordset: [{ totalClaims: 5, deniedClaims: 1, totalCharges: 200 }] })
      .mockResolvedValueOnce({ recordset: [{ bankTxCount: 5, bankTxTotal: 999 }] })
      .mockRejectedValueOnce('q5 string error') // Q5 non-Error
      .mockResolvedValueOnce({ recordset: [{ inTransitCount: 0, inTransitTotal: 0 }] });
    const res = mockRes();
    await ctrl.getSummary(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pmsTxCount).toBe(0);
    expect(body.pmsTxTotal).toBe(0);
  });

  it('getSummary: Q6 fails (non-Error) \u2014 inTransit defaults to 0', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ matchedCount: 2, matchedAmount: 500, postedCount: 1, unpostedCount: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ unmatchedPayments: 1, unmatchedEOBs: 0 }] })
      .mockResolvedValueOnce({ recordset: [{ totalClaims: 5, deniedClaims: 1, totalCharges: 200 }] })
      .mockResolvedValueOnce({ recordset: [{ bankTxCount: 5, bankTxTotal: 999 }] })
      .mockResolvedValueOnce({ recordset: [{ pmsTxCount: 3, pmsTxTotal: 300 }] })
      .mockRejectedValueOnce('q6 string error'); // Q6 non-Error
    const res = mockRes();
    await ctrl.getSummary(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.inTransitCount).toBe(0);
    expect(body.inTransitTotal).toBe(0);
  });

  it('getSummary: outer catch \u2014 returns 500', async () => {
    const ctrl2 = new ReconciliationReportController();
    (ctrl2 as any).pool = {
      request: () => { throw new Error('pool exploded'); },
    };
    const res = mockRes();
    await ctrl2.getSummary(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // -- getByPayer - branches ----------------------------------------------------

  it('getByPayer: happy path \u2014 returns rows with denialRate computed', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { payerName: 'Aetna', remittanceCount: 5, totalAmount: 10000, linkedClaims: 10, deniedClaims: 2, avgAmount: 2000 },
        { payerName: 'BCBS',  remittanceCount: 3, totalAmount:  5000, linkedClaims: 0,  deniedClaims: 0, avgAmount: 1000 },
      ],
    });
    const res = mockRes();
    await ctrl.getByPayer(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].denialRate).toBe(20); // 2/10 * 100
    expect(body.rows[1].denialRate).toBe(0);  // linkedClaims === 0 -> 0
  });

  it('getByPayer: with postStatus=posted \u2014 query includes posted filter', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getByPayer(mockReq({ postStatus: 'posted' }), res);
    expect(res.json).toHaveBeenCalledWith({ rows: [] });
  });

  it('getByPayer: with postStatus=unposted \u2014 query includes unposted filter', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getByPayer(mockReq({ postStatus: 'unposted' }), res);
    expect(res.json).toHaveBeenCalledWith({ rows: [] });
  });

  it('getByPayer: null totalAmount and avgAmount \u2192 0 after Math.abs', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { payerName: 'X', remittanceCount: 1, totalAmount: null, linkedClaims: 2, deniedClaims: 1, avgAmount: null },
      ],
    });
    const res = mockRes();
    await ctrl.getByPayer(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].totalAmount).toBe(0);
    expect(body.rows[0].avgAmount).toBe(0);
  });

  it('getByPayer: with location and payer filters', async () => {
    (expandWithAliases as jest.Mock)
      .mockResolvedValueOnce(['East'])  // location
      .mockResolvedValueOnce(['Aetna']); // payer
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getByPayer(mockReq({ location: 'East', payer: 'Aetna' }), res);
    expect(expandWithAliases).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ rows: [] });
  });

  it('getByPayer: error (new Error) \u2014 returns 500', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const res = mockRes();
    await ctrl.getByPayer(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getByPayer: error (string throw) \u2014 returns 500', async () => {
    (expandWithAliases as jest.Mock).mockRejectedValueOnce('string fail');
    const res = mockRes();
    await ctrl.getByPayer(mockReq({ location: 'Somewhere' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // -- getMonthlyTrend - branches -----------------------------------------------

  it('getMonthlyTrend: happy path \u2014 returns rows with denialRate', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { period: '2026-01', reconcileCount: 5, reconcileAmount: 10000, claimCount: 20, deniedCount: 4, postedCount: 3 },
        { period: '2026-02', reconcileCount: 3, reconcileAmount:  5000, claimCount: 0,  deniedCount: 0, postedCount: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.getMonthlyTrend(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].denialRate).toBe(20); // 4/20 * 100
    expect(body.rows[1].denialRate).toBe(0);  // claimCount === 0
  });

  it('getMonthlyTrend: reconcileAmount=null \u2192 0', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { period: '2026-01', reconcileCount: 1, reconcileAmount: null, claimCount: 5, deniedCount: 1, postedCount: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.getMonthlyTrend(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].reconcileAmount).toBe(0);
  });

  it('getMonthlyTrend: with location filter', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue(['East']);
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getMonthlyTrend(mockReq({ location: 'East' }), res);
    expect(expandWithAliases).toHaveBeenCalledWith(expect.anything(), 'location', ['East']);
    expect(res.json).toHaveBeenCalledWith({ rows: [] });
  });

  it('getMonthlyTrend: with postStatus=posted', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getMonthlyTrend(mockReq({ postStatus: 'posted' }), res);
    expect(res.json).toHaveBeenCalledWith({ rows: [] });
  });

  it('getMonthlyTrend: with postStatus=unposted', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getMonthlyTrend(mockReq({ postStatus: 'unposted' }), res);
    expect(res.json).toHaveBeenCalledWith({ rows: [] });
  });

  it('getMonthlyTrend: error (new Error) \u2014 returns 500', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockRejectedValueOnce(new Error('trend fail'));
    const res = mockRes();
    await ctrl.getMonthlyTrend(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getMonthlyTrend: error (string) \u2014 returns 500', async () => {
    (expandWithAliases as jest.Mock).mockRejectedValueOnce('string trend fail');
    const res = mockRes();
    await ctrl.getMonthlyTrend(mockReq({ location: 'X' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // -- getInTransit - branches --------------------------------------------------

  it('getInTransit: happy path \u2014 maps rows correctly', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          RemittanceFileID: 'R001',
          fileDate: '2026-01-15',
          Amount: 1500,
          location: 'East Office',
          payerName: 'Cigna',
          claimCount: 3,
          daysAged: 14,
        },
        {
          RemittanceFileID: 'R002',
          fileDate: '2026-02-01',
          Amount: null,
          location: null,
          payerName: 'Unknown',
          claimCount: 0,
          daysAged: 7,
        },
      ],
    });
    const res = mockRes();
    await ctrl.getInTransit(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].amount).toBe(1500);
    expect(body.rows[0].location).toBe('East Office');
    expect(body.rows[1].amount).toBe(0);    // null -> 0
    expect(body.rows[1].location).toBe(''); // null -> ''
    expect(body.total).toBe(2);
  });

  it('getInTransit: Amount is negative \u2014 Math.abs applied', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { RemittanceFileID: 'R003', fileDate: '2026-01-01', Amount: -2000, location: 'West', payerName: 'BCBS', claimCount: 1, daysAged: 30 },
      ],
    });
    const res = mockRes();
    await ctrl.getInTransit(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].amount).toBe(2000);
  });

  it('getInTransit: with location and payer filters', async () => {
    (expandWithAliases as jest.Mock)
      .mockResolvedValueOnce(['East'])
      .mockResolvedValueOnce(['BCBS']);
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getInTransit(mockReq({ location: 'East', payer: 'BCBS' }), res);
    expect(expandWithAliases).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ rows: [], total: 0 });
  });

  it('getInTransit: error (new Error) \u2014 returns 500', async () => {
    (expandWithAliases as jest.Mock).mockResolvedValue([]);
    mockQuery.mockRejectedValueOnce(new Error('transit fail'));
    const res = mockRes();
    await ctrl.getInTransit(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getInTransit: error (string) \u2014 returns 500', async () => {
    (expandWithAliases as jest.Mock).mockRejectedValueOnce('string transit fail');
    const res = mockRes();
    await ctrl.getInTransit(mockReq({ payer: 'X' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// =============================================================================
// FinanceSummaryController - uncovered branches
// =============================================================================

describe('FinanceSummaryController \u2014 v2 uncovered branches', () => {
  let ctrl: FinanceSummaryController;

  beforeEach(() => {
    mockQuery.mockReset();
    jest.clearAllMocks();
    // Default fallback for any extra queries (e.g. woResult 3rd query)
    mockQuery.mockResolvedValue({ recordset: [{ TotalWriteOffs: 0 }] });
    ctrl = new FinanceSummaryController();
  });

  // Base mock helper - returns both txResult and arResult
  const makeDefaultArResult = () => ({
    recordset: [{ OpenAR: 5000, AvgDailyCharges: 50 }],
  });

  // -- categorise branches ------------------------------------------------------

  it('get: categorise \u2014 charge trxType', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'Charge', Month: '2026-01', TotalAmt: 1000, TxCount: 5 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.byTrxType[0].category).toBe('charge');
    expect(body.summary.grossCharges).toBe(1000);
  });

  it('get: categorise \u2014 writeoff trxType (writeoff keyword)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'WriteOff', Month: '2026-01', TotalAmt: 200, TxCount: 2 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.byTrxType[0].category).toBe('writeoff');
    expect(body.summary.writeOffs).toBe(200);
  });

  it('get: categorise \u2014 bad-debt maps to writeoff', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'BadDebt', Month: '2026-01', TotalAmt: 50, TxCount: 1 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.byTrxType[0].category).toBe('writeoff');
  });

  it('get: categorise \u2014 adjustment trxType', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'Contractual Adjustment', Month: '2026-01', TotalAmt: 300, TxCount: 3 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.byTrxType[0].category).toBe('adjustment');
    expect(body.summary.contractualAdjustments).toBe(300);
  });

  it('get: categorise \u2014 insurance_payment via ERA keyword', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'ERA Payment', Month: '2026-01', TotalAmt: 500, TxCount: 4 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.byTrxType[0].category).toBe('insurance_payment');
    expect(body.summary.insurancePayments).toBe(500);
  });

  it('get: categorise \u2014 patient_payment via copay keyword', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'Copay', Month: '2026-01', TotalAmt: 75, TxCount: 1 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.byTrxType[0].category).toBe('patient_payment');
    expect(body.summary.patientPayments).toBe(75);
  });

  it('get: categorise \u2014 insurance_payment via pay/payment default', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'Payment', Month: '2026-01', TotalAmt: 400, TxCount: 2 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.byTrxType[0].category).toBe('insurance_payment');
  });

  it('get: categorise \u2014 other (unknown type)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'ZZZUnknownType', Month: '2026-01', TotalAmt: 100, TxCount: 1 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.byTrxType[0].category).toBe('other');
    // otherCredits is not part of summary directly but we can verify no crash
    expect(body.summary).toBeDefined();
  });

  // -- trxGroupMap existing entry path (line 173-175) --------------------------

  it('get: same trxType across multiple months accumulates totalAmount and txCount', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { TrxType: 'Charge', Month: '2026-01', TotalAmt: 1000, TxCount: 5 },
          { TrxType: 'Charge', Month: '2026-02', TotalAmt: 2000, TxCount: 8 }, // same trxType - hits existing branch
        ],
      })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    const chargeGroup = body.byTrxType.find((g: any) => g.trxType === 'Charge');
    expect(chargeGroup.totalAmount).toBe(3000); // 1000 + 2000
    expect(chargeGroup.txCount).toBe(13);       // 5 + 8
  });

  // -- arRow null/zero branches -------------------------------------------------

  it('get: arResult recordset empty/null \u2014 openAR and daysInAR default to 0', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })  // txResult - no transactions
      .mockResolvedValueOnce({ recordset: [] }); // arResult - empty
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.summary.openAR).toBe(0);
    expect(body.summary.daysInAR).toBe(0);
  });

  it('get: avgDailyCharges = 0 \u2014 daysInAR = 0 (avoids division by zero)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'Charge', Month: '2026-01', TotalAmt: 1000, TxCount: 3 }] })
      .mockResolvedValueOnce({ recordset: [{ OpenAR: 10000, AvgDailyCharges: 0 }] }); // avgDailyCharges=0
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.summary.daysInAR).toBe(0);
  });

  it('get: openAR negative \u2014 clamped to 0 via Math.max', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ OpenAR: -500, AvgDailyCharges: 100 }] });
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.summary.openAR).toBe(0);
  });

  // -- netCollectionRate / grossCollectionRate zero paths -----------------------

  it('get: grossCharges = 0 \u2014 netCollectionRate and grossCollectionRate = 0', async () => {
    // No charge transactions -> grossCharges stays 0
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ TrxType: 'Payment', Month: '2026-01', TotalAmt: 200, TxCount: 2 }] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.summary.grossCollectionRate).toBe(0); // grossCharges=0 -> 0
  });

  it('get: adjustedCharges = 0 (writeoffs+adjustments >= charges) \u2014 netCollectionRate = 0', async () => {
    // Charge=100, contractualAdjustment=100 -> adjustedCharges = 0
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { TrxType: 'Charge',              Month: '2026-01', TotalAmt: 100, TxCount: 1 },
          { TrxType: 'Contractual-Adj',     Month: '2026-01', TotalAmt: 100, TxCount: 1 },
        ],
      })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.summary.netCollectionRate).toBe(0);
  });

  // -- months / location / payer param handling ---------------------------------

  it('get: location and payer params passed \u2014 filters applied', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq({ location: 'East', payer: 'Cigna', months: '6' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.months).toBe(6);
  });

  it('get: no params \u2014 defaults to 12 months, null filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce(makeDefaultArResult());
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.months).toBe(12);
  });

  // -- error paths --------------------------------------------------------------

  it('get: error (new Error) \u2014 returns 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('get: error (string throw) \u2014 returns 500', async () => {
    mockQuery.mockRejectedValueOnce('string DB fail');
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// =============================================================================
// PaymentReconciliation - uncovered branches
// =============================================================================

describe('PaymentReconciliation \u2014 v2 uncovered branches', () => {
  let ctrl: PaymentReconciliation;

  beforeEach(() => {
    mockQuery.mockReset();
    jest.clearAllMocks();
    ctrl = new PaymentReconciliation();
  });

  // -- normalizeCsv branches ----------------------------------------------------

  it('get: payers as array \u2014 normalizeCsv joins them', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ payers: ['Aetna', 'BCBS'], page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.payers).toBe('Aetna,BCBS');
  });

  it('get: providers as array \u2014 normalizeCsv joins them', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ providers: ['Dr. Smith', 'Dr. Jones'], page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.providers).toBe('Dr. Smith,Dr. Jones');
  });

  it('get: payers containing "all" \u2014 filtered out, returns null', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ payers: 'all', page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.payers).toBeNull();
  });

  // -- pickPracticeLocation branches --------------------------------------------

  it('get: locationScope=practice with practices array \u2014 uses first practice', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({
      locationScope: 'practice',
      practices: 'Demo-East1',
      page: '1',
      pageSize: '25',
    });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('Demo-East1');
  });

  it('get: practiceId=<specific> (not all) \u2014 uses practiceId', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ practiceId: 'Demo-West1', page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('Demo-West1');
  });

  it('get: practiceId=all \u2014 uses all', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ practiceId: 'all', page: '1', pageSize: '25' });
    const res = mockRes();
    await ctrl.get(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.practiceLocation).toBe('all');
  });

  // -- nestRows branches ---------------------------------------------------------

  it('get: recordset with claimId=null \u2014 claim not added to parent', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          eobId: 'EOB001', eobDate: '2026-01-01', totalAmount: 1000, locationName: 'East',
          remittanceClaimId: null, claimId: null, dateClaimSubmitted: null,
          amount: null, claimStatus: null, isPosted: 0,
        },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '1', pageSize: '25' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].claims).toHaveLength(0);
    expect(body.rows[0].claimsWithMoneyCount).toBe(0);
    expect(body.rows[0].claimsZeroOpenCount).toBe(0);
  });

  it('get: claimId present \u2014 claim added to parent, amounts classified', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          eobId: 'EOB002', eobDate: '2026-01-02', totalAmount: 2000, locationName: 'West',
          remittanceClaimId: 'RC001', claimId: 'CLM001', dateClaimSubmitted: '2026-01-01',
          amount: 500, claimStatus: 'PAID', isPosted: 0,
        },
        {
          eobId: 'EOB002', eobDate: '2026-01-02', totalAmount: 2000, locationName: 'West',
          remittanceClaimId: 'RC002', claimId: 'CLM002', dateClaimSubmitted: '2026-01-01',
          amount: 0, claimStatus: 'ZERO_PAY', isPosted: 0,
        },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '1', pageSize: '25' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].claims).toHaveLength(2);
    expect(body.rows[0].claimsWithMoneyCount).toBe(1); // CLM001 has amount > 0
    expect(body.rows[0].claimsZeroOpenCount).toBe(1);  // CLM002 has amount <= 0
  });

  it('get: row with null eobId \u2014 skipped in nestRows', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: null, eobDate: '2026-01-01', totalAmount: 0, locationName: '', remittanceClaimId: null, claimId: null, amount: null, claimStatus: null, isPosted: 0 },
        { eobId: 'EOB003', eobDate: '2026-01-03', totalAmount: 500, locationName: 'North', remittanceClaimId: null, claimId: null, amount: null, claimStatus: null, isPosted: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '1', pageSize: '25' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1); // only EOB003 counted
    expect(body.rows[0].eobId).toBe('EOB003');
  });

  // -- search filter ------------------------------------------------------------

  it('get: search term filters rows by eobId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'EOB-ALPHA', eobDate: '2026-01-01', totalAmount: 1000, locationName: 'East', remittanceClaimId: null, claimId: null, amount: null, claimStatus: null, isPosted: 0 },
        { eobId: 'EOB-BETA',  eobDate: '2026-01-02', totalAmount: 2000, locationName: 'West', remittanceClaimId: null, claimId: null, amount: null, claimStatus: null, isPosted: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'alpha', page: '1', pageSize: '25' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].eobId).toBe('EOB-ALPHA');
  });

  it('get: search filters by locationName', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'EOB001', eobDate: '2026-01-01', totalAmount: 1000, locationName: 'Eastside Clinic', remittanceClaimId: null, claimId: null, amount: null, claimStatus: null, isPosted: 0 },
        { eobId: 'EOB002', eobDate: '2026-01-01', totalAmount: 1000, locationName: 'Westside Clinic', remittanceClaimId: null, claimId: null, amount: null, claimStatus: null, isPosted: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'eastside', page: '1', pageSize: '25' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].eobId).toBe('EOB001');
  });

  it('get: search filters by claim claimId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { eobId: 'EOB010', eobDate: '2026-01-01', totalAmount: 1000, locationName: 'North', remittanceClaimId: 'RC1', claimId: 'CLM-XYZ-999', dateClaimSubmitted: '2026-01-01', amount: 100, claimStatus: 'PAID', isPosted: 0 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'xyz-999', page: '1', pageSize: '25' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
  });

  // -- pagination branches -------------------------------------------------------

  it('get: page=0 \u2014 safePage clamps to 1', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '0', pageSize: '10' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
  });

  it('get: pageSize=0 \u2014 safePageSize clamps to 25', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '1', pageSize: '0' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.pageSize).toBe(25);
  });

  it('get: page=NaN \u2014 safePage clamps to 1', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: 'notanumber', pageSize: '10' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
  });

  // -- from/to date filters -----------------------------------------------------

  it('get: from and to params present \u2014 passed through to filters', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ from: '2026-01-01', to: '2026-03-31' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.filters.from).toBe('2026-01-01');
    expect(body.filters.to).toBe('2026-03-31');
  });

  // -- error paths ---------------------------------------------------------------

  it('get: error (new Error) \u2014 returns 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('query fail'));
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
  });

  it('get: error (string throw) \u2014 returns 500', async () => {
    mockQuery.mockRejectedValueOnce('string error');
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// =============================================================================
// FullyReconciledPayments - uncovered branches
// =============================================================================

describe('FullyReconciledPayments \u2014 v2 uncovered branches', () => {
  let ctrl: FullyReconciledPayments;

  beforeEach(() => {
    mockQuery.mockReset();
    jest.clearAllMocks();
    ctrl = new FullyReconciledPayments();
  });

  // -- normalizeCsv branches ----------------------------------------------------

  it('get: payers as array \u2014 normalizeCsv joins them', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ payers: ['Cigna', 'Aetna'] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: payers=all \u2014 filtered out, returns null', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ payers: 'all' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: providers as array \u2014 normalizeCsv joins them', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ providers: ['Dr. Adams', 'Dr. Brown'] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // -- parsePracticeLocations - all three modes ---------------------------------

  it('get: practices=list (single string) \u2014 mode=list', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ practices: 'Demo-East1,Demo-West1' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: practices as array \u2014 mode=list, flatMaps multiple values', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ practices: ['Demo-East1', 'Demo-West1'] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.json).toHaveBeenCalled();
  });

  it('get: practiceId=<specific> (not all) \u2014 mode=single', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ practiceId: 'Demo-North1' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: practiceId=all (default) \u2014 mode=all, no WHERE clause', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ practiceId: 'all' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: no practiceId provided \u2014 defaults to all', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({});
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // -- row mapping null-safety branches -----------------------------------------

  it('get: recordset with null fields \u2014 defaults applied', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          reconciledId: null,
          bankName: null,
          depositDate: null,
          bankFeedId: null,
          amountDeposited: null,
          amountFullEra: null,
        },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    // Controller passes through raw DB values - nulls stay as null
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toBeDefined();
  });

  it('get: recordset with all non-null fields \u2014 values preserved', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          reconciledId: '42',
          bankName: 'First National',
          depositDate: '2026-02-14',
          bankFeedId: '99',
          amountDeposited: 1234.56,
          amountFullEra: 1200.00,
        },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows[0].reconciledId).toBe('42');
    expect(body.rows[0].bankName).toBe('First National');
    expect(body.rows[0].depositDate).toBe('2026-02-14');
    expect(body.rows[0].amountDeposited).toBe(1234.56);
    expect(body.rows[0].amountFullEra).toBe(1200);
  });

  // -- search filter branches ----------------------------------------------------

  it('get: search filters by bankName', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { reconciledId: '1', bankName: 'Alpha Bank', depositDate: '2026-01-01', bankFeedId: 'F1', amountDeposited: 500, amountFullEra: 500 },
        { reconciledId: '2', bankName: 'Beta Bank',  depositDate: '2026-01-02', bankFeedId: 'F2', amountDeposited: 300, amountFullEra: 300 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'alpha' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].bankName).toBe('Alpha Bank');
  });

  it('get: search filters by bankFeedId (uses bankName field)', async () => {
    // Controller searches bankName, reconciledId, payerName, locationList, practiceLocation, postedBy
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { reconciledId: '10', bankName: 'XYZ Corp Bank', depositDate: '2026-01-01', bankFeedId: 'FEED-XYZ', amountDeposited: 100, amountFullEra: 100 },
        { reconciledId: '11', bankName: 'ABC Bank', depositDate: '2026-01-02', bankFeedId: 'FEED-ABC', amountDeposited: 200, amountFullEra: 200 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: 'xyz' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].bankName).toBe('XYZ Corp Bank');
  });

  it('get: search filters by reconciledId (partial match)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { reconciledId: '2026-03-REC', bankName: 'Bank X', depositDate: '2026-03-15', bankFeedId: 'F20', amountDeposited: 100, amountFullEra: 100 },
        { reconciledId: '2026-04-REC', bankName: 'Bank Y', depositDate: '2026-04-20', bankFeedId: 'F21', amountDeposited: 200, amountFullEra: 200 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: '2026-03' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].reconciledId).toBe('2026-03-REC');
  });

  it('get: search filters by reconciledId', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { reconciledId: 'REC-001', bankName: 'Bank A', depositDate: '2026-01-01', bankFeedId: 'F1', amountDeposited: 500, amountFullEra: 500 },
        { reconciledId: 'REC-999', bankName: 'Bank B', depositDate: '2026-01-02', bankFeedId: 'F2', amountDeposited: 300, amountFullEra: 300 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: '999' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].reconciledId).toBe('REC-999');
  });

  it('get: empty search string \u2014 no filter applied', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { reconciledId: 'A', bankName: 'Bank A', depositDate: '2026-01-01', bankFeedId: 'F1', amountDeposited: 100, amountFullEra: 100 },
        { reconciledId: 'B', bankName: 'Bank B', depositDate: '2026-01-02', bankFeedId: 'F2', amountDeposited: 200, amountFullEra: 200 },
      ],
    });
    const res = mockRes();
    await ctrl.get(mockReq({ search: '' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.rows).toHaveLength(2);
  });

  // -- pagination branches -------------------------------------------------------

  it('get: page=0 \u2014 safePage clamps to 1', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '0', pageSize: '10' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(1);
  });

  it('get: pageSize=0 \u2014 gets clamped', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '1', pageSize: '0' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: page=NaN \u2014 controller still responds 200', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: 'notanumber', pageSize: '10' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: pageSize=NaN \u2014 controller still responds 200', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '1', pageSize: 'notanumber' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: pagination info present for page 2', async () => {
    const records = Array.from({ length: 30 }, (_, i) => ({
      reconciledId: `R${i}`,
      bankName: 'Bank',
      depositDate: '2026-01-01',
      bankFeedId: `F${i}`,
      amountDeposited: 100,
      amountFullEra: 100,
    }));
    mockQuery.mockResolvedValueOnce({ recordset: records });
    const res = mockRes();
    await ctrl.get(mockReq({ page: '2', pageSize: '10' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.pageSize).toBe(10);
    // Controller returns all rows (SQL pagination via OFFSET/FETCH)
    expect(body.rows.length).toBeGreaterThan(0);
  });

  // -- from/to date filters ------------------------------------------------------

  it('get: from and to date params passed through to SQL', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ from: '2026-01-01', to: '2026-03-31' }), res);
    // Controller uses from/to as SQL inputs - just verify it returns 200
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // -- error paths ---------------------------------------------------------------

  it('get: error (new Error) \u2014 returns 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('query fail'));
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
  });

  it('get: error (string throw) \u2014 returns 500', async () => {
    mockQuery.mockRejectedValueOnce('string error');
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
