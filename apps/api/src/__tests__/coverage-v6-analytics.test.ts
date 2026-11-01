/**
 * coverage-v6-analytics.test.ts
 *
 * Covers remaining uncovered branches in:
 *   analytics/ar/ar-summary.ts              (BRDA:162,180,197)
 *   analytics/kpi/kpi.ts                    (BRDA:349,357,385)
 *   analytics/medicare-dashboard/payments-vs-medicare.ts (BRDA:28,131,146)
 *   analytics/ar/ar-days-by-practice.ts     (BRDA:16)
 *   analytics/ar/ar-collections-breakdown.ts (BRDA:150)
 *   analytics/ar/ar-distribution.ts         (BRDA:108)
 *   analytics/medicare-dashboard/index.ts   (BRDA:111,235)
 *   analytics/source-data/index.ts          (BRDA:142)
 */

// --- Mock setup ---------------------------------------------------------------

const mockQuery = jest.fn();

const makeRequest = () => {
  const r: any = {
    input: (..._a: any[]) => r,
    query: mockQuery,
  };
  return r;
};

const mockPool: any = { request: makeRequest };
let mockGetPool = jest.fn(() => mockPool);

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ getPool: () => mockGetPool() }),
  },
  databaseInstance: { getPool: () => mockGetPool() },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  const MockRequest = jest.fn().mockImplementation(() => ({
    input: jest.fn().mockReturnThis(),
    query: mockQuery,
  }));
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(),
    DateTime2: f(), Date: f(), Float: f(), VarChar: f, UniqueIdentifier: f(),
    SmallInt: f(), MAX: f(),
    Request: MockRequest,
    ConnectionPool: jest.fn(),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

jest.mock('../websockets/index', () => ({ getIO: jest.fn(() => null) }));

jest.mock('../utils/date-filters', () => ({
  DateFilterUtils: jest.fn().mockImplementation(() => ({
    filterByDateObject: jest.fn().mockReturnValue({
      dateConditionForInvoiceLineItem: `AND c.sdos BETWEEN '2026-01-01' AND '2026-03-20'`,
      dateConditionForInvoice: `AND i.ServiceDt BETWEEN '2026-01-01' AND '2026-03-20'`,
      params: { start_date: '2026-01-01', end_date: '2026-03-20' },
    }),
  })),
}));

jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    bgRed: { white: (s: string) => s },
    greenBright: (s: string) => s,
  },
}));

// --- Helpers ------------------------------------------------------------------

const makeReq = (overrides: any = {}): any => ({
  params: {},
  query: {},
  body: {},
  headers: {},
  ...overrides,
});

const makeRes = (): any => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  mockQuery.mockReset();
  mockGetPool.mockReturnValue(mockPool);
});

// --- Imports ------------------------------------------------------------------

import { ARSummary } from '../controllers/analytics/ar/ar-summary';
import { ARDaysByPractice } from '../controllers/analytics/ar/ar-days-by-practice';
import { ARCollectionsBreakdown } from '../controllers/analytics/ar/ar-collections-breakdown';
import { ARDistributionAcrossOpenBalances } from '../controllers/analytics/ar/ar-distribution';
import { kpiController } from '../controllers/analytics/kpi/kpi';
import { PaymentsVsMedicareByDOS } from '../controllers/analytics/medicare-dashboard/payments-vs-medicare';
import { MedicareDashboardController } from '../controllers/analytics/medicare-dashboard/index';
import { SourceDataController } from '../controllers/analytics/source-data/index';

// --- ARSummary - BRDA:162,180,197 (recordset undefined -> || [] fallback) ------

describe('ARSummary \u2013 recordset fallback branches', () => {
  let ctrl: ARSummary;

  beforeEach(() => {
    ctrl = new ARSummary();
    jest.clearAllMocks();
  });

  it('BRDA:162,180,197 \u2013 recordset undefined on all three queries hits || [] on each', async () => {
    // Simulate DB returning result objects with NO recordset property (undefined)
    // This triggers agingResult.recordset || [], specialtyResult.recordset || [],
    // and trendsResult.recordset || [] - the false side of each || branch.
    mockQuery
      .mockResolvedValueOnce({})   // agingResult - no recordset -> || []
      .mockResolvedValueOnce({})   // specialtyResult - no recordset -> || []
      .mockResolvedValueOnce({});  // trendsResult - no recordset -> || []

    const res = makeRes();
    await ctrl.get(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.ar_aging.details).toEqual([]);
    expect(body.ar_specialty.details).toEqual([]);
    expect(body.ar_trends.details).toEqual([]);
  });

  it('BRDA:162 only \u2013 first recordset undefined, others present', async () => {
    mockQuery
      .mockResolvedValueOnce({})  // agingResult - no recordset
      .mockResolvedValueOnce({ recordset: [{ category: 'Ortho', category_total: 5000 }] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].ar_aging.details).toEqual([]);
  });

  it('BRDA:180 only \u2013 second recordset undefined', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ AgeBucket: '<30', ARBalance: 100 }] })
      .mockResolvedValueOnce({})   // specialtyResult - no recordset
      .mockResolvedValueOnce({ recordset: [] });

    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].ar_specialty.details).toEqual([]);
  });

  it('BRDA:197 only \u2013 third recordset undefined', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ AgeBucket: '>90', ARBalance: 200 }] })
      .mockResolvedValueOnce({ recordset: [{ category: 'Cardiology', category_total: 200 }] })
      .mockResolvedValueOnce({});  // trendsResult - no recordset

    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].ar_trends.details).toEqual([]);
  });
});

// --- ARDaysByPractice - BRDA:16 (!pool falsy branch) -------------------------

describe('ARDaysByPractice \u2013 null pool branch (BRDA:16)', () => {
  it('returns 500 when pool is not initialized', async () => {
    // The module-level pool comes from Database.getInstance().getPool()
    // Simulate getPool() returning null so `!pool` is true
    mockGetPool.mockReturnValue(null as any);

    // Re-require the module so the constructor sees null pool
    jest.resetModules();
    jest.doMock('../modules/db', () => ({
      __esModule: true,
      default: { getInstance: () => ({ getPool: () => null }) },
      databaseInstance: { getPool: () => null },
    }));
    jest.doMock('mssql', () => {
      const f = (n?: any) => ({ type: 'mock', n });
      const MockRequest = jest.fn().mockImplementation(() => ({
        input: jest.fn().mockReturnThis(),
        query: mockQuery,
      }));
      return {
        NVarChar: Object.assign(f, { MAX: f() }), Int: f(), BigInt: f(),
        Decimal: f, Bit: f(), DateTime: f(), DateTime2: f(), Date: f(),
        Float: f(), VarChar: f, UniqueIdentifier: f(), SmallInt: f(), MAX: f(),
        Request: MockRequest, ConnectionPool: jest.fn(),
      };
    });
    jest.doMock('../utils/logger', () => ({
      __esModule: true,
      default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));

    const { ARDaysByPractice: ARDaysByPracticeReloaded } = require('../controllers/analytics/ar/ar-days-by-practice');
    const ctrl = new ARDaysByPracticeReloaded();

    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) })
    );

    jest.resetModules();
  });
});

// --- ARCollectionsBreakdown - BRDA:150 (recordset undefined -> || []) ----------

describe('ARCollectionsBreakdown \u2013 recordset fallback (BRDA:150)', () => {
  let ctrl: ARCollectionsBreakdown;

  beforeEach(() => {
    ctrl = new ARCollectionsBreakdown();
    jest.clearAllMocks();
  });

  it('returns empty data when recordset is undefined', async () => {
    // result.recordset is undefined -> hits || [] branch
    mockQuery.mockResolvedValueOnce({});  // no recordset key

    const res = makeRes();
    await ctrl.get(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toEqual([]);
    expect(body.pagination.totalRecords).toBe(0);
  });
});

// --- ARDistributionAcrossOpenBalances - BRDA:108 (recordset undefined -> || []) -

describe('ARDistributionAcrossOpenBalances \u2013 recordset fallback (BRDA:108)', () => {
  let ctrl: ARDistributionAcrossOpenBalances;

  beforeEach(() => {
    ctrl = new ARDistributionAcrossOpenBalances();
    jest.clearAllMocks();
  });

  it('returns empty rows when recordset is undefined', async () => {
    mockQuery.mockResolvedValueOnce({});  // no recordset key -> || []

    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].rows).toEqual([]);
  });
});

// --- kpiController - BRDA:349,357,385 ----------------------------------------

describe('kpiController \u2013 uncovered branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('BRDA:349 \u2013 Number(r.value) || 0 when value is null/zero', async () => {
    // queryQuarterlyTrend maps: value: Number(r.value) || 0
    // Need a row where r.value is 0 or null so || 0 is taken
    mockQuery.mockReset();
    mockQuery
      // queryAllKpis -> 1 query
      .mockResolvedValueOnce({ recordset: [{ KPI: 'net-collection', ValuePct: 0 }] })
      // queryQuarterlyTrend: row with value: null -> Number(null) = 0 -> || 0
      .mockResolvedValueOnce({ recordset: [{ label: "Q1 '26", value: null }] });

    const res = makeRes();
    // actor.customer_id must be set to pass the 403 guard
    // actor.email = '' so resolveUserScope short-circuits (no extra query)
    await kpiController.getKpiDetail(
      makeReq({
        params: { slug: 'net-collection' },
        body: { timeframe: 'Past month' },
        actor: { customer_id: 1, email: '' },
        headers: {},
      }),
      res
    );
    expect(res.json).toHaveBeenCalled();
    const detail = res.json.mock.calls[0][0];
    // trendQuarterly value should be 0 (from || 0 fallback)
    expect(detail.trendQuarterly[0].value).toBe(0);
  });

  it('BRDA:357 \u2013 req.body is null \u2192 (req.body || {}) in getKpiList', async () => {
    // queryAllKpis -> 1 query; actor.customer_id must be set to pass 403 guard
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    // Pass null body - triggers `(req.body || {})` to use `{}`
    await kpiController.getKpiList(
      makeReq({ body: null, actor: { customer_id: 1, email: '' }, headers: {} }),
      res
    );
    expect(res.json).toHaveBeenCalled();
  });

  it('BRDA:385 \u2013 req.body is null \u2192 (req.body || {}) in getKpiDetail', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ KPI: 'gross-expected-collection', ValuePct: 95 }] })
      .mockResolvedValueOnce({ recordset: [{ label: "Q2 '26", value: 95 }] });
    const res = makeRes();
    // Null body in getKpiDetail triggers `(req.body || {})` false branch
    // actor.customer_id must be set to pass 403 guard
    await kpiController.getKpiDetail(
      makeReq({
        params: { slug: 'gross-expected-collection' },
        body: null,
        actor: { customer_id: 1, email: '' },
        headers: {},
      }),
      res
    );
    expect(res.json).toHaveBeenCalled();
  });
});

// --- PaymentsVsMedicareByDOS - BRDA:28,131,146 -------------------------------

describe('PaymentsVsMedicareByDOS \u2013 uncovered branches', () => {
  let ctrl: PaymentsVsMedicareByDOS;

  beforeEach(() => {
    ctrl = new PaymentsVsMedicareByDOS();
    jest.clearAllMocks();
  });

  it('BRDA:28 \u2013 no date_of_service in filters \u2192 empty start/end_date', async () => {
    // filters has no date_of_service key -> `filters?.date_of_service || {}` uses {}
    // Then start_date and end_date are both undefined -> the date params are not bound
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ date_of_service: '2026-01-01', medicare_allowable: 1000 }] })
      .mockResolvedValueOnce({ recordset: [{ date_of_service: '2026-01-01', payments: 800 }] });

    const res = makeRes();
    await ctrl.get(
      makeReq({ body: { filters: { practice_groups: [], location: [], provider: [] } } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('BRDA:131 \u2013 medicare_allowable is null \u2192 ?? 0 fallback', async () => {
    // record.medicare_allowable is null -> `record.medicare_allowable ?? 0` returns 0
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ date_of_service: '2026-02-01', medicare_allowable: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = makeRes();
    await ctrl.get(makeReq({ body: { filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body[0].medicare_allowable).toBe(0);
  });

  it('BRDA:146 \u2013 non-Error thrown \u2192 error.message || fallback string', async () => {
    // Throw a plain object (not an Error instance)
    mockQuery.mockRejectedValueOnce({ message: undefined });

    const res = makeRes();
    await ctrl.get(makeReq({ body: { filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- MedicareDashboardController - BRDA:111,235 ------------------------------

describe('MedicareDashboardController \u2013 non-Error thrown branches', () => {
  let ctrl: MedicareDashboardController;

  beforeEach(() => {
    ctrl = new MedicareDashboardController();
    jest.clearAllMocks();
  });

  it('BRDA:111 \u2013 getCptAndClaimCountsByDOS non-Error thrown \u2192 string fallback', async () => {
    // Throw a non-Error object so `error instanceof Error` is false
    const spy = jest
      .spyOn((ctrl as any).cptAndClaimCountsByDOS, 'get')
      .mockRejectedValueOnce('string error');

    const res = makeRes();
    await ctrl.getCptAndClaimCountsByDOS(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toContain('Internal server error');
    spy.mockRestore();
  });

  it('BRDA:235 \u2013 getUncollectedMedicareByCptGroup non-Error thrown \u2192 string fallback', async () => {
    const spy = jest
      .spyOn((ctrl as any).uncollectedMedicareByCptGroup, 'get')
      .mockRejectedValueOnce('plain string throw');

    const res = makeRes();
    await ctrl.getUncollectedMedicareByCptGroup(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toContain('Internal server error');
    spy.mockRestore();
  });

  // Also cover getUncollectedMedicarePerClaim and getUncollectedMCRPerClaimByDOS error paths
  // to ensure full branch coverage on their non-Error fallbacks (BRDA:175, BRDA:195)
  it('getUncollectedMedicarePerClaim \u2013 non-Error thrown', async () => {
    const spy = jest
      .spyOn((ctrl as any).uncollectedMedicarePerClaimByDOS, 'get')
      .mockRejectedValueOnce(42);

    const res = makeRes();
    await ctrl.getUncollectedMedicarePerClaim(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    spy.mockRestore();
  });

  it('getUncollectedMCRPerClaimByDOS \u2013 non-Error thrown', async () => {
    const spy = jest
      .spyOn((ctrl as any).uncollectedMCRPerClaimByDOS, 'get')
      .mockRejectedValueOnce(null);

    const res = makeRes();
    await ctrl.getUncollectedMCRPerClaimByDOS(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    spy.mockRestore();
  });
});

// --- SourceDataController - BRDA:142 (non-Error thrown) ----------------------

describe('SourceDataController \u2013 non-Error thrown (BRDA:142)', () => {
  let ctrl: SourceDataController;

  beforeEach(() => {
    ctrl = new SourceDataController();
    jest.clearAllMocks();
  });

  it('returns 500 with fallback message when a non-Error object is thrown', async () => {
    // Throw a plain string - hits `error instanceof Error` false branch
    mockQuery.mockRejectedValueOnce('plain string');

    const res = makeRes();
    await ctrl.get(
      makeReq({
        body: {
          sort: { column: 'payer', direction: 'asc' },
          filters: {},
          page: 1,
          limit: 10,
        },
      }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
  });
});
