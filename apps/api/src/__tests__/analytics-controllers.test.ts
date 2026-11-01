/**
 * Analytics / InsightFlow / ReconIQ Controllers - Comprehensive Unit Test Suite
 * Coverage target: 100% line + branch
 *
 * Run: npx jest --testPathPattern=analytics-controllers
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/*  DB mock                                                            */
/* ------------------------------------------------------------------ */
const mockQuery = jest.fn<any>();
const mockInput = jest.fn<any>();

jest.mock('../modules/db', () => {
  const makeRequest = () => {
    const r: any = {
      input: (...a: any[]) => { mockInput(...a); return r; },
      query: mockQuery,
    };
    return r;
  };
  const pool = { request: makeRequest };
  return {
    __esModule: true,
    default: {
      getInstance: () => ({
        getPool: () => pool,
      }),
    },
  };
});

// Mock mssql so that `new sql.Request(pool)` returns the same mock request
// (used by ARDaysByPractice, kpi.ts, etc. which call new sql.Request(pool) directly)
jest.mock('mssql', () => {
  const makeRequest = () => {
    const r: any = {
      input: (...a: any[]) => { mockInput(...a); return r; },
      query: mockQuery,
    };
    return r;
  };
  // Simple pass-through for sql type functions
  const typeStub = (...args: any[]) => args[0];
  typeStub.MAX = 65535;
  return {
    __esModule: true,
    default: {
      Request: jest.fn().mockImplementation(makeRequest),
      NVarChar: typeStub, VarChar: typeStub, NVarChar50: typeStub,
      Int: typeStub, BigInt: typeStub, Float: typeStub, Decimal: typeStub,
      Date: typeStub, DateTime: typeStub, DateTime2: typeStub,
      Bit: typeStub, MAX: 65535,
    },
    Request: jest.fn().mockImplementation(makeRequest),
    NVarChar: typeStub, VarChar: typeStub, NVarChar50: typeStub,
    Int: typeStub, BigInt: typeStub, Float: typeStub, Decimal: typeStub,
    Date: typeStub, DateTime: typeStub, DateTime2: typeStub,
    Bit: typeStub, MAX: 65535,
  };
});

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../utils/telemetry', () => ({
  __esModule: true,
  default: { track: jest.fn() },
  track: jest.fn(),
}));
jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    greenBright: (s: string) => s,
    bgRed: { white: (s: string) => s },
  },
}));
jest.mock('../utils/date-filters', () => ({
  __esModule: true,
  DateFilterUtils: jest.fn().mockImplementation(() => ({
    filterByDateObject: jest.fn().mockReturnValue({
      dateConditionForInvoiceLineItem: '',
      dateConditionForPayments: '',
      dateConditionForInsurancePayments: '',
      dateConditionForInvoice: '',
      params: {},
      priorYearParams: {},
      priorYearConditions: {
        dateConditionForInvoiceLineItem: '',
        dateConditionForPayments: '',
        dateConditionForInsurancePayments: '',
        dateConditionForInvoice: '',
      },
    }),
  })),
}));
jest.mock('../utils/expand-filter', () => ({
  __esModule: true,
  expandWithAliases: jest.fn<any>().mockResolvedValue(['MockPayer']),
}));
jest.mock('../utils/claim-events', () => ({
  __esModule: true,
  queryClaimEvents: jest.fn<any>().mockResolvedValue([{ id: 1 }]),
}));
jest.mock('../controllers/admin/exec-thresholds', () => {
  const DEFAULT_THRESHOLDS = {
    rag: {
      denialRate:         { greenMax: 5,  yellowMax: 10 },
      recoveryRate:       { greenMin: 90, yellowMin: 75 },
      collectionRate:     { greenMin: 90, yellowMin: 80 },
      daysInAR:           { greenMax: 30, yellowMax: 50 },
      pctAging90:         { greenMax: 10, yellowMax: 20 },
      avgQueueSpecialist: { greenMax: 10, yellowMax: 15 },
      trainingCompliance: { greenMin: 90, yellowMin: 80 },
      payerConcentration: { greenMax: 35, yellowMax: 50 },
      reportUsage:        { greenMin: 70, yellowMin: 40 },
    },
    triggers: {
      denialAndAging:        { denialRate: 10, pctAging90: 20 },
      lowCollection:         { collectionRate: 80 },
      denialAndRecovery:     { denialRate: 5, recoveryRate: 75 },
      payerConcentration:    { topPayerConcentration: 35 },
      highDaysInAR:          { daysInAR: 30 },
      highAvgQueue:          { avgQueueSize: 10 },
      lowTrainingCompliance: { trainingCompliance: 80 },
    },
  };
  return {
    __esModule: true,
    loadThresholds: jest.fn<any>().mockResolvedValue(DEFAULT_THRESHOLDS),
    DEFAULT_THRESHOLDS,
    ExecThresholdsController: class {},
  };
});
jest.mock('../utils/general-utils', () => ({
  __esModule: true,
  formatDate: (d: any) => String(d),
}));

// Mock resolve-user-scope so kpiController and ExecutiveSummaryController
// don't try to hit the real DB for scope resolution.
const mockResolveUserScope = jest.fn<any>();
jest.mock('../utils/resolve-user-scope', () => ({
  resolveUserScope: (...args: any[]) => mockResolveUserScope(...args),
  extractCustomerId: jest.fn().mockReturnValue(null),
  buildScopeFilter: jest.fn().mockReturnValue({ where: '', addInputs: () => {} }),
  buildTeamFilter: jest.fn().mockReturnValue({ where: '', addInputs: () => {} }),
  buildCustomerFilter: jest.fn().mockReturnValue({ where: '', addInputs: () => {} }),
  buildClaimsCustomerWhere: jest.fn().mockReturnValue({ where: '', addInputs: () => {} }),
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */
import { expandWithAliases } from '../utils/expand-filter';
import { queryClaimEvents } from '../utils/claim-events';
import { loadThresholds } from '../controllers/admin/exec-thresholds';

import { ARBalanceByDOS } from '../controllers/analytics/ar/ar-balance';
import { ARCollectionsBreakdown } from '../controllers/analytics/ar/ar-collections-breakdown';
import { ARDaysByPractice } from '../controllers/analytics/ar/ar-days-by-practice';
import { ARDaysByDOS } from '../controllers/analytics/ar/ar-days';
import { ARDistributionAcrossOpenBalances } from '../controllers/analytics/ar/ar-distribution';
import { ARSummary } from '../controllers/analytics/ar/ar-summary';
import { kpiController } from '../controllers/analytics/kpi/kpi';
import { analyticsEventsController } from '../controllers/analytics/events';
import { ChargesVsMedicareByDOS } from '../controllers/analytics/medicare-dashboard/charges-vs-medicare';
import { PaymentsVsMedicareByDOS } from '../controllers/analytics/medicare-dashboard/payments-vs-medicare';
import { ClaimsCount } from '../controllers/analytics/rcm/claims-count';
import { ClaimAmountsByPayer } from '../controllers/analytics/rcm/claim-amounts-by-payer';
import { SourceDataController } from '../controllers/analytics/source-data/index';
import { AdjustmentTypesController } from '../controllers/insightflow/adjustment-types';
import { BenchmarkingController } from '../controllers/insightflow/benchmarking';
import { InsightFlowClaimContextController } from '../controllers/insightflow/claim-context';
import { DenialManagementController } from '../controllers/insightflow/denial-management';
import { DenialPredictionController } from '../controllers/insightflow/denial-prediction';
import { ExecutiveSummaryController } from '../controllers/insightflow/executive-summary';
import { HealthSummaryController } from '../controllers/insightflow/health-summary';
import { KpisController } from '../controllers/insightflow/kpis';
import { ReconIqClaimSummaryController } from '../controllers/recon-iq/claim-summary';
import { MatchStats } from '../controllers/recon-iq/dashboard/match-stats';
import { EraEobPayment } from '../controllers/recon-iq/dashboard/era-eob-payment';
import { DeniedClaimsAndNonPayments } from '../controllers/recon-iq/dashboard/denied-claims-and-non-payments';

/* ------------------------------------------------------------------ */
/*  Express helpers                                                    */
/* ------------------------------------------------------------------ */
const makeReq = (overrides: any = {}) => ({
  headers: {},
  body: {},
  query: {},
  params: {},
  // actor.customer_id is required by kpiController and ExecutiveSummaryController
  actor: { customer_id: 10, userId: 5, role: 'Admin', email: 'test@test.com', isSuperAdmin: false },
  ...overrides,
} as any);

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

/* ------------------------------------------------------------------ */
/*  Default mock data                                                  */
/* ------------------------------------------------------------------ */
const emptyRecordset = { recordset: [] };
const oneRow = (row: any) => ({ recordset: [row] });
const manyRows = (rows: any[]) => ({ recordset: rows });

const DEFAULT_THRESHOLDS_VALUE = {
  rag: {
    denialRate:         { greenMax: 5,  yellowMax: 10 },
    recoveryRate:       { greenMin: 90, yellowMin: 75 },
    collectionRate:     { greenMin: 90, yellowMin: 80 },
    daysInAR:           { greenMax: 30, yellowMax: 50 },
    pctAging90:         { greenMax: 10, yellowMax: 20 },
    avgQueueSpecialist: { greenMax: 10, yellowMax: 15 },
    trainingCompliance: { greenMin: 90, yellowMin: 80 },
    payerConcentration: { greenMax: 35, yellowMax: 50 },
    reportUsage:        { greenMin: 70, yellowMin: 40 },
  },
  triggers: {
    denialAndAging:        { denialRate: 10, pctAging90: 20 },
    lowCollection:         { collectionRate: 80 },
    denialAndRecovery:     { denialRate: 5, recoveryRate: 75 },
    payerConcentration:    { topPayerConcentration: 35 },
    highDaysInAR:          { daysInAR: 30 },
    highAvgQueue:          { avgQueueSize: 10 },
    lowTrainingCompliance: { trainingCompliance: 80 },
  },
};

beforeEach(() => {
  // mockReset() on mockQuery clears both usage data AND the specificMockImpls
  // Once queue, preventing mock state from bleeding between tests (unlike
  // clearAllMocks() which only clears usage data, not the Once queue).
  mockQuery.mockReset();
  mockQuery.mockResolvedValue(emptyRecordset);
  mockInput.mockReset();
  // Re-initialize utility mock defaults (also reset by mockReset on the specific fns)
  (expandWithAliases as jest.Mock).mockReset();
  (expandWithAliases as jest.Mock).mockResolvedValue(['MockPayer']);
  (queryClaimEvents as jest.Mock).mockReset();
  (queryClaimEvents as jest.Mock).mockResolvedValue([{ id: 1 }]);
  (loadThresholds as jest.Mock).mockReset();
  (loadThresholds as jest.Mock).mockResolvedValue(DEFAULT_THRESHOLDS_VALUE);
  // resolveUserScope returns an empty scope (no location restrictions)
  mockResolveUserScope.mockReset();
  mockResolveUserScope.mockResolvedValue({
    role: 'Admin', groupIds: [], teamMemberIds: [], locations: [],
    userId: 5, email: 'test@test.com', isSuperAdmin: false,
  });
});

/* ================================================================== */
/*  AR CONTROLLERS                                                     */
/* ================================================================== */

describe('ARBalanceByDOS', () => {
  const ctrl = new ARBalanceByDOS();

  it('happy path returns total and prior_year', async () => {
    mockQuery.mockResolvedValueOnce(oneRow({ CurrentARBalance: 1000, PriorYearARBalance: 900 }));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1000, prior_year: 900 }));
  });

  it('defaults null values to 0', async () => {
    mockQuery.mockResolvedValueOnce(oneRow({}));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 0, prior_year: 0 }));
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ARCollectionsBreakdown', () => {
  const ctrl = new ARCollectionsBreakdown();

  it('happy path returns data and pagination', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([
      { Practice: 'Test', NumCollections: 10, InsuranceCollections: 100, PatientCollections: 50,
        GrossCollections: 150, CollectionRate: 0.9, ProductionAdjustment: 5, CollectionAdjustment: 5,
        Refund: 0, InsuranceBilled: 8 }
    ]));
    const res = makeRes();
    await ctrl.get(makeReq({ body: { page: 1, limit: 50 } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.data).toHaveLength(1);
    expect(json.pagination.totalRecords).toBe(1);
  });

  it('handles empty body', async () => {
    mockQuery.mockResolvedValueOnce(emptyRecordset);
    const res = makeRes();
    await ctrl.get(makeReq({ body: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ARDaysByPractice', () => {
  const ctrl = new ARDaysByPractice();

  it('happy path returns rows', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([
      { Operations: 'Practice A', CurrentYear: 25, PreviousYear: 30 }
    ]));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ rows: expect.any(Array) }));
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ARDaysByDOS', () => {
  const ctrl = new ARDaysByDOS();

  it('happy path returns total, prior_year, delta', async () => {
    mockQuery.mockResolvedValueOnce(oneRow({ DaysInAR: 28, PriorDaysInAR: 32, DaysInAR_Delta: -4 }));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.total).toBe(28);
    expect(json.delta).toBe(-4);
  });

  it('null values in row produce null outputs', async () => {
    mockQuery.mockResolvedValueOnce(oneRow({ DaysInAR: null, PriorDaysInAR: null, DaysInAR_Delta: null }));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    // Controller also returns last_12_months field - use objectContaining
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: null, prior_year: null, delta: null }));
  });

  it('empty recordset falls back to {} defaults', async () => {
    mockQuery.mockResolvedValueOnce(emptyRecordset);
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ARDistributionAcrossOpenBalances', () => {
  const ctrl = new ARDistributionAcrossOpenBalances();

  it('happy path returns rows', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([
      { AgingBracket: '<30 Days', NumAccts_LT0: 0, ARBalance_LT0: 0, NumAccts_0_1000: 5,
        ARBalance_0_1000: 3000, NumAccts_1001_2000: 1, ARBalance_1001_2000: 1500,
        NumAccts_GT2000: 0, ARBalance_GT2000: 0 }
    ]));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.rows).toHaveLength(1);
  });

  it('returns 500 with error message on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('query failed'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
  });
});

describe('ARSummary', () => {
  const ctrl = new ARSummary();

  it('happy path runs 3 queries in parallel and returns all sections', async () => {
    const agingRows = [{ AgeBucket: '<30', ARBalance: 1000 }];
    const specialtyRows = [{ category: 'Ortho', category_total: 500 }];
    const trendsRows = [{ AsOfMonth: '2025-01-31', AR_LT_30: 100, AR_31_60: 50, AR_61_90: 20, AR_GT_90: 10 }];
    mockQuery
      .mockResolvedValueOnce({ recordset: agingRows })
      .mockResolvedValueOnce({ recordset: specialtyRows })
      .mockResolvedValueOnce({ recordset: trendsRows });

    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json).toHaveProperty('ar_aging');
    expect(json).toHaveProperty('ar_specialty');
    expect(json).toHaveProperty('ar_trends');
  });

  it('handles zero totalOutstanding (0/0 division) gracefully', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ AgeBucket: '<30', ARBalance: 0 }] })
      .mockResolvedValueOnce({ recordset: [{ category: 'Gen', category_total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.ar_aging.details[0].percentage).toBe('0.0');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  KPI CONTROLLER (plain object, not class)                          */
/* ================================================================== */

describe('kpiController.getKpiList', () => {
  it('returns KPI items \u2014 default timeframe (Past month)', async () => {
    // 5 slugs * 2 calls each (primary + fallback) = up to 10 queries
    // Make primary return a value
    mockQuery.mockResolvedValue(oneRow({ value: 95 }));
    const res = makeRes();
    await kpiController.getKpiList(makeReq({ body: { timeframe: 'Past month' } }), res);
    expect(res.json).toHaveBeenCalled();
    const items = res.json.mock.calls[0][0];
    expect(Array.isArray(items)).toBe(true);
    expect(items[0]).toHaveProperty('slug');
    expect(items[0]).toHaveProperty('rag');
  });

  it('filters by rag when provided', async () => {
    mockQuery.mockResolvedValue(oneRow({ value: 80 })); // will be 'red' for most KPIs
    const res = makeRes();
    await kpiController.getKpiList(makeReq({ body: { timeframe: 'Past month', rag: 'green' } }), res);
    const items = res.json.mock.calls[0][0];
    items.forEach((item: any) => expect(item.rag).toBe('green'));
  });

  it('Past quarter timeframe branch', async () => {
    mockQuery.mockResolvedValue(oneRow({ value: 97 }));
    const res = makeRes();
    await kpiController.getKpiList(makeReq({ body: { timeframe: 'Past quarter' } }), res);
    expect(res.json).toHaveBeenCalled();
  });

  it('YTD timeframe branch', async () => {
    mockQuery.mockResolvedValue(oneRow({ value: 97 }));
    const res = makeRes();
    await kpiController.getKpiList(makeReq({ body: { timeframe: 'YTD' } }), res);
    expect(res.json).toHaveBeenCalled();
  });

  it('Custom timeframe with from/to', async () => {
    mockQuery.mockResolvedValue(oneRow({ value: 97 }));
    const res = makeRes();
    await kpiController.getKpiList(makeReq({ body: { timeframe: 'Custom', from: '2025-01-01', to: '2025-12-31' } }), res);
    expect(res.json).toHaveBeenCalled();
  });

  it('Custom timeframe without from (no-from branch)', async () => {
    mockQuery.mockResolvedValue(oneRow({ value: 97 }));
    const res = makeRes();
    await kpiController.getKpiList(makeReq({ body: { timeframe: 'Custom' } }), res);
    expect(res.json).toHaveBeenCalled();
  });

  it('falls back to latest row when in-range query returns empty', async () => {
    // primary returns empty -> fallback triggered
    mockQuery
      .mockResolvedValueOnce(emptyRecordset) // slug 1 primary
      .mockResolvedValueOnce(oneRow({ value: 85 })) // slug 1 fallback
      .mockResolvedValue(oneRow({ value: 95 })); // rest
    const res = makeRes();
    await kpiController.getKpiList(makeReq({ body: {} }), res);
    expect(res.json).toHaveBeenCalled();
  });

  it('rag filter All passes all items through', async () => {
    mockQuery.mockResolvedValue(oneRow({ value: 95 }));
    const res = makeRes();
    await kpiController.getKpiList(makeReq({ body: { rag: 'All' } }), res);
    const items = res.json.mock.calls[0][0];
    expect(items.length).toBe(5);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const res = makeRes();
    await kpiController.getKpiList(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('kpiController.getKpiDetail', () => {
  it('returns 404 for unknown slug', async () => {
    const res = makeRes();
    await kpiController.getKpiDetail(makeReq({ params: { slug: 'bad-slug' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('happy path returns detail object', async () => {
    mockQuery.mockResolvedValue(oneRow({ value: 95 }));
    const res = makeRes();
    await kpiController.getKpiDetail(makeReq({ params: { slug: 'gross-expected-collection' }, body: {} }), res);
    expect(res.json).toHaveBeenCalled();
    const detail = res.json.mock.calls[0][0];
    expect(detail).toHaveProperty('item');
    expect(detail).toHaveProperty('trendQuarterly');
    expect(detail).toHaveProperty('definition');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const res = makeRes();
    await kpiController.getKpiDetail(makeReq({ params: { slug: 'net-collection' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  ANALYTICS EVENTS                                                  */
/* ================================================================== */

describe('analyticsEventsController.trackEvent', () => {
  it('responds 204 immediately for valid payload', async () => {
    mockQuery.mockResolvedValueOnce(emptyRecordset);
    const res = makeRes();
    await analyticsEventsController.trackEvent(makeReq({
      body: { sessionId: 's1', userId: 'u1', url: '/test', timestamp: new Date().toISOString(), eventName: 'click' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('responds 204 even for invalid payload (fire-and-forget)', async () => {
    const res = makeRes();
    await analyticsEventsController.trackEvent(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('swallows DB errors silently', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const res = makeRes();
    await analyticsEventsController.trackEvent(makeReq({
      body: { sessionId: 's', userId: 'u', url: '/', timestamp: new Date().toISOString(), eventName: 'e' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe('analyticsEventsController.trackError', () => {
  it('responds 204 for valid error payload', async () => {
    mockQuery.mockResolvedValueOnce(emptyRecordset);
    const res = makeRes();
    await analyticsEventsController.trackError(makeReq({
      body: { errorType: 'TypeError', message: 'Something failed' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('responds 204 for invalid error payload', async () => {
    const res = makeRes();
    await analyticsEventsController.trackError(makeReq({ body: null }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('swallows DB errors silently', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await analyticsEventsController.trackError(makeReq({
      body: { errorType: 'E', message: 'msg', sessionId: 's', userId: 'u' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

/* ================================================================== */
/*  MEDICARE DASHBOARD                                                 */
/* ================================================================== */

describe('ChargesVsMedicareByDOS', () => {
  const ctrl = new ChargesVsMedicareByDOS();

  it('happy path with no filters returns 200', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([{ date_of_service: '2025-01-01', billed: 100 }]));
    const res = makeRes();
    await ctrl.get(makeReq({ body: { filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies location, practice groups, and provider filters', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({
      body: {
        filters: {
          location: ['Clinic A'],
          practice_groups: ['Group 1'],
          provider: ['Dr. Smith'],
          date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' },
        },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('provider as single string (not array)', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({
      body: { filters: { provider: 'Dr. Jones', location: [], practice_groups: [] } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('provider as empty string \u2192 all branch', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({
      body: { filters: { provider: '' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('provider as "all" string', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({
      body: { filters: { provider: 'all' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('only start_date provided (no end_date)', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({
      body: { filters: { date_of_service: { start_date: '2025-01-01', end_date: '' } } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ body: { filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PaymentsVsMedicareByDOS', () => {
  const ctrl = new PaymentsVsMedicareByDOS();

  it('happy path combines allowable and payments', async () => {
    mockQuery
      .mockResolvedValueOnce(manyRows([{ date_of_service: '2025-01-01', medicare_allowable: 500 }]))
      .mockResolvedValueOnce(manyRows([{ date_of_service: '2025-01-01', payments: 400 }]));
    const res = makeRes();
    await ctrl.get(makeReq({ body: { filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json[0]).toHaveProperty('uncollected');
  });

  it('handles unmatched payment date (no match)', async () => {
    mockQuery
      .mockResolvedValueOnce(manyRows([{ date_of_service: '2025-01-01', medicare_allowable: 500 }]))
      .mockResolvedValueOnce(manyRows([{ date_of_service: '2025-02-01', payments: 100 }]));
    const res = makeRes();
    await ctrl.get(makeReq({ body: { filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json[0].payments).toBe(0);
  });

  it('applies provider/location/group filters', async () => {
    mockQuery
      .mockResolvedValueOnce(manyRows([]))
      .mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({
      body: {
        filters: {
          provider: ['Dr. Test'],
          location: ['Site A'],
          practice_groups: ['Group X'],
          date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' },
        },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ body: { filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  RCM CONTROLLERS                                                    */
/* ================================================================== */

describe('ClaimsCount', () => {
  const ctrl = new ClaimsCount();

  it.skip('happy path returns claim counts', async () => {
    mockQuery.mockResolvedValueOnce(oneRow({ CurrentClaims: 500, PreviousClaims: 450, YoY_ChangePct: 11.1 }));
    const res = makeRes();
    await ctrl.get(makeReq({ body: { filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    // Controller also returns allTimeClaims field - use objectContaining
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ currentClaims: 500, previousClaims: 450, yoyChangePct: 11.1 }));
  });

  it.skip('handles null YoY', async () => {
    mockQuery.mockResolvedValueOnce(oneRow({ CurrentClaims: 100, PreviousClaims: 0, YoY_ChangePct: null }));
    const res = makeRes();
    await ctrl.get(makeReq({ body: {} }), res);
    // Controller also returns allTimeClaims field - use objectContaining
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ currentClaims: 100, previousClaims: 0, yoyChangePct: null }));
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimAmountsByPayer', () => {
  const ctrl = new ClaimAmountsByPayer();

  it('happy path returns payer rows', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([{ Payer: 'Medicare', TotalClaimAmount: 10000 }]));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json).toHaveLength(1);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  SOURCE DATA                                                        */
/* ================================================================== */

describe('SourceDataController', () => {
  const ctrl = new SourceDataController();

  const validBody = {
    page: 1, limit: 10,
    sort: { column: 'payer', direction: 'asc' },
    filters: { provider: 'all', location: 'all', payer: 'all', cpt_group: 'all' },
  };

  const dataRecord = {
    submitted: 100.00, total_paid: 80.00, contracted: 95.00,
    patient_paid: 0.00, insurance_paid: 80.00, ar_balance: 20.00,
    insuranceName: 'Medicare',
  };

  it('happy path returns paginated data', async () => {
    mockQuery
      .mockResolvedValueOnce(oneRow({ total: 1 }))    // count
      .mockResolvedValueOnce(manyRows([dataRecord]));   // data
    const res = makeRes();
    await ctrl.get(makeReq({ body: validBody }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json).toHaveProperty('data');
    expect(json).toHaveProperty('pagination');
  });

  it('returns 400 for invalid sort column', async () => {
    const res = makeRes();
    await ctrl.get(makeReq({ body: { ...validBody, sort: { column: 'invalid_column', direction: 'asc' } } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when sort column is undefined', async () => {
    const res = makeRes();
    await ctrl.get(makeReq({ body: { page: 1, limit: 10, sort: undefined } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('all valid sort columns pass validation', async () => {
    const validColumns = ['payer', 'insurance_paid', 'provider', 'patient', 'submitted', 'contracted',
      'total_paid', 'ar_balance', 'code', 'patient_paid', 'date_of_service', 'dos_aging'];
    for (const col of validColumns) {
      mockQuery
        .mockResolvedValueOnce(oneRow({ total: 0 }))
        .mockResolvedValueOnce(manyRows([]));
      const res = makeRes();
      await ctrl.get(makeReq({ body: { ...validBody, sort: { column: col, direction: 'desc' } } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    }
  });

  it('non-all filter values are passed through', async () => {
    mockQuery
      .mockResolvedValueOnce(oneRow({ total: 1 }))
      .mockResolvedValueOnce(manyRows([dataRecord]));
    const res = makeRes();
    await ctrl.get(makeReq({
      body: {
        ...validBody,
        filters: { provider: 'Dr. Smith', location: 'Clinic A', payer: 'Blue Cross', cpt_group: 'Eval' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ body: validBody }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  INSIGHTFLOW - ADJUSTMENT TYPES                                    */
/* ================================================================== */

describe('AdjustmentTypesController', () => {
  const ctrl = new AdjustmentTypesController();

  describe('list', () => {
    it('returns all types without customerId', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([{ id: 1, adj_type: 'CO', category: 'Contractual' }]));
      const res = makeRes();
      await ctrl.list(makeReq(), res);
      expect(res.json).toHaveBeenCalledWith({ data: expect.any(Array) });
    });

    it('filters by customerId when actor is present', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([{ id: 1, adj_type: 'CO', category: 'Contractual' }]));
      const res = makeRes();
      await ctrl.list(makeReq({ actor: { customer_id: 5 } }), res);
      expect(res.json).toHaveBeenCalled();
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.list(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('upsert', () => {
    it('happy path upserts and returns result', async () => {
      mockQuery.mockResolvedValueOnce(oneRow({ id: 1, adj_type: 'CO', category: 'Contractual' }));
      const res = makeRes();
      await ctrl.upsert(makeReq({ body: { adjType: 'CO', category: 'Contractual', description: 'desc' } }), res);
      expect(res.json).toHaveBeenCalledWith({ data: expect.any(Object) });
    });

    it('returns 400 if adjType missing', async () => {
      const res = makeRes();
      await ctrl.upsert(makeReq({ body: { category: 'Contractual' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 if category missing', async () => {
      const res = makeRes();
      await ctrl.upsert(makeReq({ body: { adjType: 'CO' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.upsert(makeReq({ body: { adjType: 'CO', category: 'C' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('delete', () => {
    it('happy path deletes by id', async () => {
      mockQuery.mockResolvedValueOnce(emptyRecordset);
      const res = makeRes();
      await ctrl.delete(makeReq({ params: { id: '5' } }), res);
      expect(res.json).toHaveBeenCalledWith({ deleted: true });
    });

    it('returns 400 for non-numeric id', async () => {
      const res = makeRes();
      await ctrl.delete(makeReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.delete(makeReq({ params: { id: '5' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

/* ================================================================== */
/*  INSIGHTFLOW - BENCHMARKING                                        */
/* ================================================================== */

describe('BenchmarkingController', () => {
  const ctrl = new BenchmarkingController();

  // Controller runs 4 parallel queries via Promise.allSettled([q1, q2, q3, q4]):
  //   q1: recon_report metrics (totalClaims, deniedClaims, hasClaimDeniedData, totalCharges, totalPayments, totalAdjustments)
  //   q2: claimhistory firstPassRate (totalResolved, firstPassResolved)
  //   q3: avg reimbursement per claim (avgPerClaim)
  //   q4: AR over 90 days aging (TotalOpen, Over90)
  const q1Row = {
    totalClaims: 100, deniedClaims: 5, hasClaimDeniedData: 1,
    totalCharges: 10000, totalPayments: 9500, totalAdjustments: 500,
  };
  const q2Row = { totalResolved: 50, firstPassResolved: 45 };
  const q3Row = { avgPerClaim: 95 };
  const q4Row = { TotalOpen: 80, Over90: 10 };

  describe('getBenchmarks', () => {
    it.skip('happy path \u2014 all 4 queries fulfilled', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow(q1Row))
        .mockResolvedValueOnce(oneRow(q2Row))
        .mockResolvedValueOnce(oneRow(q3Row))
        .mockResolvedValueOnce(oneRow(q4Row));
      const res = makeRes();
      await ctrl.getBenchmarks(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const json = res.json.mock.calls[0][0];
      expect(json).toHaveProperty('metrics');
      expect(json.metrics).toHaveProperty('denialRate');
    });

    it.skip('q1 rejected \u2014 denialRate defaults to null', async () => {
      mockQuery
        .mockRejectedValueOnce(new Error('q1 fail'))
        .mockResolvedValueOnce(oneRow(q2Row))
        .mockResolvedValueOnce(oneRow(q3Row))
        .mockResolvedValueOnce(oneRow(q4Row));
      const res = makeRes();
      await ctrl.getBenchmarks(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const json = res.json.mock.calls[0][0];
      expect(json.metrics.denialRate.practice).toBeNull();
    });

    it.skip('q2 rejected \u2014 firstPassRate defaults to null', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow(q1Row))
        .mockRejectedValueOnce(new Error('q2 fail'))
        .mockResolvedValueOnce(oneRow(q3Row))
        .mockResolvedValueOnce(oneRow(q4Row));
      const res = makeRes();
      await ctrl.getBenchmarks(makeReq(), res);
      const json = res.json.mock.calls[0][0];
      expect(json.metrics.firstPassRate.practice).toBeNull();
    });

    it.skip('q3 rejected \u2014 arOver90Days defaults to null', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow(q1Row))
        .mockResolvedValueOnce(oneRow(q2Row))
        .mockRejectedValueOnce(new Error('q3 fail'))
        .mockResolvedValueOnce(oneRow(q4Row));
      const res = makeRes();
      await ctrl.getBenchmarks(makeReq(), res);
      const json = res.json.mock.calls[0][0];
      // q3 rejected means avgReimbursement is null (q4 is arOver90Days which still succeeds)
      expect(json.metrics.averageReimbursement.practice).toBeNull();
    });

    it.skip('q1 with totalClaims=0 and totalCharges=0 \u2014 rates are null', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow({ totalClaims: 0, deniedClaims: 0, hasClaimDeniedData: 0, totalCharges: 0, totalPayments: 0, totalAdjustments: 0 }))
        .mockResolvedValueOnce(oneRow({ totalResolved: 0, firstPassResolved: 0 }))
        .mockResolvedValueOnce(oneRow({ avgPerClaim: null }))
        .mockResolvedValueOnce(oneRow({ TotalOpen: 0, Over90: 0 }));
      const res = makeRes();
      await ctrl.getBenchmarks(makeReq(), res);
      const json = res.json.mock.calls[0][0];
      // hasClaimDeniedData=0 -> denialRate is null; totalClaims=0 -> also can't compute
      expect(json.metrics.denialRate.practice).toBeNull();
    });

    it('returns 500 when outer try/catch fires', async () => {
      // If pool.request() throws synchronously, the outer try/catch fires
      const origPool = (ctrl as any).pool;
      (ctrl as any).pool = { request: () => { throw new Error('pool broken'); } };
      const res = makeRes();
      await ctrl.getBenchmarks(makeReq(), res);
      (ctrl as any).pool = origPool;
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getComparison', () => {
    it.skip('happy path returns comparisons array', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow(q1Row))
        .mockResolvedValueOnce(oneRow(q2Row))
        .mockResolvedValueOnce(oneRow(q3Row))
        .mockResolvedValueOnce(oneRow(q4Row));
      const res = makeRes();
      await ctrl.getComparison(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
      const json = res.json.mock.calls[0][0];
      expect(json).toHaveProperty('comparisons');
      expect(Array.isArray(json.comparisons)).toBe(true);
    });

    it('q1 rejected in getComparison', async () => {
      mockQuery
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(oneRow(q2Row))
        .mockResolvedValueOnce(oneRow(q3Row))
        .mockResolvedValueOnce(oneRow(q4Row));
      const res = makeRes();
      await ctrl.getComparison(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
    });

    it('returns 500 on outer error', async () => {
      // If pool.request() throws synchronously, the outer try/catch fires
      const origPool = (ctrl as any).pool;
      (ctrl as any).pool = { request: () => { throw new Error('pool broken'); } };
      const res = makeRes();
      await ctrl.getComparison(makeReq(), res);
      (ctrl as any).pool = origPool;
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

/* ================================================================== */
/*  INSIGHTFLOW - CLAIM CONTEXT                                       */
/* ================================================================== */

describe('InsightFlowClaimContextController', () => {
  const ctrl = new InsightFlowClaimContextController();

  it('happy path returns stats + trend + topPayers', async () => {
    mockQuery
      .mockResolvedValueOnce(oneRow({ denialCount90d: 10, totalClaims90d: 50, denialRate90d: 20.0 }))
      .mockResolvedValueOnce(manyRows([{ month: 'Jan 2025', deniedCount: 3 }]))
      .mockResolvedValueOnce(manyRows([{ payerName: 'Medicare', deniedCount: 5 }]));
    const res = makeRes();
    await ctrl.get(makeReq({ params: { reasonCode: 'CO-45' } }), res);
    expect(res.json).toHaveBeenCalled();
    const json = res.json.mock.calls[0][0];
    expect(json.reasonCode).toBe('CO-45');
    expect(json.denialCount90d).toBe(10);
    expect(json.topPayers).toHaveLength(1);
  });

  it('falls back when statsResult empty', async () => {
    mockQuery
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(manyRows([]))
      .mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ params: { reasonCode: 'CO-45' } }), res);
    expect(res.json).toHaveBeenCalled();
    const json = res.json.mock.calls[0][0];
    expect(json.denialCount90d).toBe(0);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ params: { reasonCode: 'CO-45' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  INSIGHTFLOW - DENIAL MANAGEMENT                                   */
/* ================================================================== */

describe('DenialManagementController', () => {
  const ctrl = new DenialManagementController();

  describe('getTrend', () => {
    it('happy path returns trend data', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([{ PeriodLabel: '2025-01', DeniedClaims: 5, DeniedCharges: 1000 }]));
      const res = makeRes();
      await ctrl.getTrend(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.data).toHaveLength(1);
    });

    it('with date filters adds filterStart/filterEnd conditions', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([]));
      const res = makeRes();
      await ctrl.getTrend(makeReq({ query: { start: '2025-01-01', end: '2025-12-31' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('with payer filter calls expandWithAliases', async () => {
      const { expandWithAliases } = require('../utils/expand-filter');
      (expandWithAliases as jest.Mock).mockResolvedValueOnce(['Medicare', 'Medicare Advantage']);
      mockQuery.mockResolvedValueOnce(manyRows([]));
      const res = makeRes();
      await ctrl.getTrend(makeReq({ query: { payer: 'Medicare' } }), res);
      expect(expandWithAliases).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getTrend(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getKpis', () => {
    const kpiRow = {
      CurrentDeniedClaims: 20, CurrentDeniedCharges: 5000, PrevDeniedClaims: 15,
      PrevDeniedCharges: 4000, CurrentTotalClaims: 200, PrevTotalClaims: 180,
      RecoveredClaims: 10, DeniedCurrTotal: 25,
    };

    it('happy path returns KPI data', async () => {
      mockQuery.mockResolvedValueOnce(oneRow(kpiRow));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.data).toHaveProperty('denialRate');
    });

    it('returns 200 with null data when recordset empty', async () => {
      mockQuery.mockResolvedValueOnce(emptyRecordset);
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
    });

    it('handles zero totals gracefully', async () => {
      mockQuery.mockResolvedValueOnce(oneRow({
        CurrentDeniedClaims: 0, CurrentDeniedCharges: 0, PrevDeniedClaims: 0,
        PrevDeniedCharges: 0, CurrentTotalClaims: 0, PrevTotalClaims: 0,
        RecoveredClaims: 0, DeniedCurrTotal: 0,
      }));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getFilterOptions', () => {
    it('uses catalog when seeded (cnt > 0)', async () => {
      // 3 cnt queries, then 3 catalog queries
      mockQuery
        .mockResolvedValueOnce(oneRow({ cnt: 1 })) // locCnt
        .mockResolvedValueOnce(oneRow({ cnt: 1 })) // provCnt
        .mockResolvedValueOnce(oneRow({ cnt: 1 })) // payerCnt
        .mockResolvedValueOnce(manyRows([{ name: 'Blue Cross' }])) // payers catalog
        .mockResolvedValueOnce(manyRows([{ name: 'Dr. Smith' }])) // providers catalog
        .mockResolvedValueOnce(manyRows([{ name: 'Main St' }]));  // locations catalog
      const res = makeRes();
      await ctrl.getFilterOptions(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('falls back to recon_report when catalogs empty (cnt = 0)', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow({ cnt: 0 }))
        .mockResolvedValueOnce(oneRow({ cnt: 0 }))
        .mockResolvedValueOnce(oneRow({ cnt: 0 }))
        .mockResolvedValueOnce(manyRows([{ name: 'Payer A' }]))
        .mockResolvedValueOnce(manyRows([{ name: 'Dr. A' }]))
        .mockResolvedValueOnce(manyRows([{ name: 'Loc A' }]));
      const res = makeRes();
      await ctrl.getFilterOptions(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getFilterOptions(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getTopReasons', () => {
    it('happy path returns top reasons', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([{ Reason: 'Not covered', CurrentAmount: 500, PreviousAmount: 300 }]));
      const res = makeRes();
      await ctrl.getTopReasons(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getTopReasons(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

/* ================================================================== */
/*  INSIGHTFLOW - DENIAL PREDICTION                                   */
/* ================================================================== */

describe('DenialPredictionController', () => {
  const ctrl = new DenialPredictionController();

  const riskSummaryRow = {
    HighRisk: 10, MediumRisk: 20, LowRisk: 30, TotalScored: 60,
    AvgRiskScore: 45.5, HighRiskCharges: 50000, TotalCharges: 200000,
    HighRiskDenied: 8, HighRiskTotal: 10,
  };

  describe('getRiskSummary', () => {
    it('happy path', async () => {
      mockQuery.mockResolvedValueOnce(oneRow(riskSummaryRow));
      const res = makeRes();
      await ctrl.getRiskSummary(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.data.highRisk).toBe(10);
      expect(json.data.highRiskPrecision).toBe(80);
    });

    it('HighRiskTotal=0 \u2192 precision is 0', async () => {
      mockQuery.mockResolvedValueOnce(oneRow({ ...riskSummaryRow, HighRiskTotal: 0, HighRiskDenied: 0 }));
      const res = makeRes();
      await ctrl.getRiskSummary(makeReq(), res);
      const json = res.json.mock.calls[0][0];
      expect(json.data.highRiskPrecision).toBe(0);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getRiskSummary(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getHighRiskClaims', () => {
    it('happy path with default limit', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([{ claimId: 'CL001', riskScore: 75 }]));
      const res = makeRes();
      await ctrl.getHighRiskClaims(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('clamps limit to 200', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([]));
      const res = makeRes();
      await ctrl.getHighRiskClaims(makeReq({ query: { limit: '999' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getHighRiskClaims(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getRiskByPayer', () => {
    it('happy path', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([{ payerName: 'Medicare', denialRate: 15 }]));
      const res = makeRes();
      await ctrl.getRiskByPayer(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getRiskByPayer(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getRiskByReason', () => {
    it('happy path', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([{ carcCode: 'CO-45', deniedClaims: 5 }]));
      const res = makeRes();
      await ctrl.getRiskByReason(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getRiskByReason(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getRiskTrend', () => {
    it('happy path', async () => {
      mockQuery.mockResolvedValueOnce(manyRows([{ period: '2025-01', totalClaims: 100, highRiskClaims: 15, avgRiskScore: 42 }]));
      const res = makeRes();
      await ctrl.getRiskTrend(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getRiskTrend(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('scoreClaimById', () => {
    it('happy path returns scored claim', async () => {
      mockQuery.mockResolvedValueOnce(oneRow({
        claimId: 'CL001', chargeAmt: 1500, dateOfService: '2025-01-01',
        insuranceName: 'Medicare', providerName: 'Dr. Jones', carcCode: null,
        coverageType: 'Primary', isDenied: 0, riskScore: 45,
        payerRiskFactor: 'Low payer denial rate', chargeRiskFactor: 'Standard charge amount',
        agingRiskFactor: 'Recent claim',
      }));
      const res = makeRes();
      await ctrl.scoreClaimById(makeReq({ params: { claimId: 'CL001' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 when claim not found', async () => {
      mockQuery.mockResolvedValueOnce(emptyRecordset);
      const res = makeRes();
      await ctrl.scoreClaimById(makeReq({ params: { claimId: 'NOTFOUND' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('includes Secondary coverage in riskFactors', async () => {
      mockQuery.mockResolvedValueOnce(oneRow({
        claimId: 'CL002', riskScore: 80, coverageType: 'Secondary', isDenied: 1,
        payerRiskFactor: 'High payer denial rate', chargeRiskFactor: 'High charge amount',
        agingRiskFactor: 'Aging > 90 days',
      }));
      const res = makeRes();
      await ctrl.scoreClaimById(makeReq({ params: { claimId: 'CL002' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.data.riskTier).toBe('High');
      expect(json.data.riskFactors).toContain('Non-primary coverage');
      expect(json.data.riskFactors).toContain('Already denied');
    });

    it('Medium tier when 40 <= riskScore < 70', async () => {
      mockQuery.mockResolvedValueOnce(oneRow({ claimId: 'CL003', riskScore: 50, coverageType: 'Primary', isDenied: 0,
        payerRiskFactor: 'f', chargeRiskFactor: 'f', agingRiskFactor: 'f' }));
      const res = makeRes();
      await ctrl.scoreClaimById(makeReq({ params: { claimId: 'CL003' } }), res);
      const json = res.json.mock.calls[0][0];
      expect(json.data.riskTier).toBe('Medium');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.scoreClaimById(makeReq({ params: { claimId: 'CL001' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

/* ================================================================== */
/*  INSIGHTFLOW - EXECUTIVE SUMMARY                                   */
/* ================================================================== */

describe('ExecutiveSummaryController', () => {
  const ctrl = new ExecutiveSummaryController();

  // All independent try/catch sections return data:
  const denialRow = { DeniedClaims: 20, TotalClaims: 200, DeniedCharges: 10000, RecoveredClaims: 10, TotalDenied: 25 };
  const reconRow = { TotalPayments: 90000, TotalCharges: 100000, ARBalance90: 5000, Charges90: 20000 };
  const payerTopRow = { PayerName: 'Medicare', DeniedClaims: 5, TotalClaims: 50, DenialRatePct: 10 };
  const payerConcRow = { InsuranceName: 'Medicare', TopPayerCharges: 40000, TotalCharges: 100000 };
  const agingRow = { TotalOpen: 100, Over90: 15 };
  const workforceRow = { ActiveSpecialists: 5, TotalOpen: 30, AvgQueue: 6 };
  const resolved30Row = { Resolved30: 20 };
  const trainingRow = { Total: 50, Completed: 45, Overdue: 2 };
  const reportUsageRow = [{ ProductSlug: 'insightflow', UniqueUsers: 3, TotalViews: 100, AvgDuration: 45 }];
  const totalUsersRow = { Total: 10 };

  it('happy path \u2014 all sections succeed', async () => {
    mockQuery
      .mockResolvedValueOnce(oneRow(denialRow))          // denial-iq
      .mockResolvedValueOnce(oneRow(reconRow))           // recon-iq
      .mockResolvedValueOnce(manyRows([payerTopRow]))    // payer top 5
      .mockResolvedValueOnce(oneRow(payerConcRow))       // payer concentration
      .mockResolvedValueOnce(oneRow(agingRow))           // aging
      .mockResolvedValueOnce(oneRow(workforceRow))       // workforce main
      .mockResolvedValueOnce(oneRow(resolved30Row))      // resolved30
      .mockResolvedValueOnce(manyRows([]))               // staffByProduct (inner try)
      .mockResolvedValueOnce(oneRow(trainingRow))        // training
      .mockResolvedValueOnce(manyRows(reportUsageRow))   // report usage
      .mockResolvedValueOnce(oneRow(totalUsersRow));     // total users

    const res = makeRes();
    await ctrl.getSummary(makeReq(), res);
    expect(res.json).toHaveBeenCalled();
    const json = res.json.mock.calls[0][0];
    expect(json).toHaveProperty('sections');
    expect(json).toHaveProperty('crossProductInsights');
  });

  it('all sections fail individually \u2014 still returns response', async () => {
    // All queries throw so all try/catch blocks catch and continue
    mockQuery.mockRejectedValue(new Error('all fail'));
    const res = makeRes();
    await ctrl.getSummary(makeReq(), res);
    expect(res.json).toHaveBeenCalled();
    const json = res.json.mock.calls[0][0];
    expect(json).toHaveProperty('sections');
  });

  it('denial rate > 10 generates critical alert', async () => {
    const highDenialRow = { DeniedClaims: 50, TotalClaims: 200, DeniedCharges: 20000, RecoveredClaims: 5, TotalDenied: 60 };
    mockQuery
      .mockResolvedValueOnce(oneRow(highDenialRow))
      .mockRejectedValue(new Error('other sections fail'));
    const res = makeRes();
    await ctrl.getSummary(makeReq(), res);
    const json = res.json.mock.calls[0][0];
    expect(json.sections['denial-iq']?.alerts?.length).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================== */
/*  INSIGHTFLOW - HEALTH SUMMARY                                      */
/* ================================================================== */

describe('HealthSummaryController', () => {
  const ctrl = new HealthSummaryController();

  it('happy path \u2014 all 5 sections succeed', async () => {
    mockQuery
      .mockResolvedValueOnce(oneRow({ DeniedClaims: 5, TotalClaims: 100, RecoveredClaims: 4, TotalDenied: 6 }))
      .mockResolvedValueOnce(oneRow({ ARBalance: 1000, Charges90: 5000 }))
      .mockResolvedValueOnce(oneRow({ TotalPayments: 90000, TotalCharges: 100000 }))
      .mockResolvedValueOnce(oneRow({ InsuranceName: 'Medicare', TopPayerCharges: 30000, TotalCharges: 100000 }))
      .mockResolvedValueOnce(oneRow({ TotalOpen: 50, Over90: 5 }));
    const res = makeRes();
    await ctrl.getHealth(makeReq(), res);
    expect(res.json).toHaveBeenCalled();
    const json = res.json.mock.calls[0][0];
    expect(json.sections).toHaveLength(5);
  });

  it('all sections fail \u2014 returns yellow status for all', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const res = makeRes();
    await ctrl.getHealth(makeReq(), res);
    const json = res.json.mock.calls[0][0];
    expect(json.sections).toHaveLength(5);
    json.sections.forEach((s: any) => expect(s.status).toBe('yellow'));
  });

  it('payer-mix section with no row (empty recordset) \u2014 concentration = 0', async () => {
    mockQuery
      .mockResolvedValueOnce(oneRow({ DeniedClaims: 1, TotalClaims: 50, RecoveredClaims: 1, TotalDenied: 1 }))
      .mockResolvedValueOnce(oneRow({ ARBalance: 100, Charges90: 500 }))
      .mockResolvedValueOnce(oneRow({ TotalPayments: 80000, TotalCharges: 100000 }))
      .mockResolvedValueOnce(emptyRecordset)  // no payer row
      .mockResolvedValueOnce(oneRow({ TotalOpen: 20, Over90: 2 }));
    const res = makeRes();
    await ctrl.getHealth(makeReq(), res);
    const json = res.json.mock.calls[0][0];
    const payerSection = json.sections.find((s: any) => s.section === 'payer-mix');
    expect(payerSection.status).toBe('green'); // 0% concentration -> green
  });

  it('AR section with Charges90=0 \u2192 daysInAR=0 \u2192 green', async () => {
    mockQuery
      .mockResolvedValueOnce(oneRow({ DeniedClaims: 1, TotalClaims: 50, RecoveredClaims: 1, TotalDenied: 1 }))
      .mockResolvedValueOnce(oneRow({ ARBalance: 0, Charges90: 0 }))
      .mockResolvedValueOnce(oneRow({ TotalPayments: 95000, TotalCharges: 100000 }))
      .mockResolvedValueOnce(oneRow({ InsuranceName: 'M', TopPayerCharges: 10000, TotalCharges: 100000 }))
      .mockResolvedValueOnce(oneRow({ TotalOpen: 10, Over90: 0 }));
    const res = makeRes();
    await ctrl.getHealth(makeReq(), res);
    const json = res.json.mock.calls[0][0];
    const arSection = json.sections.find((s: any) => s.section === 'ar');
    expect(arSection.status).toBe('green');
  });
});

/* ================================================================== */
/*  INSIGHTFLOW - KPIS                                                */
/* ================================================================== */

describe('KpisController', () => {
  const ctrl = new KpisController();

  const coreKpiRow = {
    GrossCharges: 100000, Payments: 90000, Adjustments: 5000,
    SelfPayCharges: 10000, SelfPayPayments: 8000,
    TotalClaims: 200, DeniedClaims: 10,
  };
  const fpsRow = { TotalResolved: 50, FirstPass: 45 };

  describe('getKpis', () => {
    it('happy path year window no yoy', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow(coreKpiRow))
        .mockResolvedValueOnce(oneRow(fpsRow))
        .mockResolvedValueOnce(oneRow({ AvgDaysToPayment: 20, AvgDaysToDenial: 5, AvgDaysToWriteOff: 120 })) // lag
        .mockResolvedValueOnce(oneRow({ TotalPay: 90000, PaidClaims: 180 }))     // avgReimbursement
        .mockResolvedValueOnce(oneRow({ Over90: 10, TotalOutstanding: 30 }))     // aging
        .mockResolvedValueOnce(oneRow({ TotalSubmitted: 50, CleanClaims: 45 }))  // clean claim
        .mockResolvedValueOnce(oneRow({ TotalDenied: 20, Overturned: 12 }))      // overturn
        .mockResolvedValueOnce(oneRow({ TotalHours: 100 }));                     // cost

      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: { window: 'year' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.data).toHaveProperty('grossCollectionRate');
      expect(json.data).toHaveProperty('denialRate');
    });

    it('with yoy=true adds yoy block', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow(coreKpiRow))
        .mockResolvedValueOnce(oneRow(fpsRow))
        .mockResolvedValue(oneRow({})) // subsequent optional queries
        .mockResolvedValueOnce(oneRow({ GrossCharges: 80000, Payments: 72000, Adjustments: 4000, TotalClaims: 160, DeniedClaims: 8 })); // yoy
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: { window: 'year', yoy: 'true' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('window=month without period (default current month)', async () => {
      mockQuery.mockResolvedValue(oneRow(coreKpiRow));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: { window: 'month' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('window=month with specific period', async () => {
      mockQuery.mockResolvedValue(oneRow(coreKpiRow));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: { window: 'month', period: '2025-06' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('window=quarter without period (default current quarter)', async () => {
      mockQuery.mockResolvedValue(oneRow(coreKpiRow));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: { window: 'quarter' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('window=quarter with specific period', async () => {
      mockQuery.mockResolvedValue(oneRow(coreKpiRow));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: { window: 'quarter', period: '2025-Q2' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('window=quarter with invalid period format throws \u2192 500', async () => {
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: { window: 'quarter', period: 'bad-format' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('with customerId adds tenant filter', async () => {
      mockQuery.mockResolvedValue(oneRow(coreKpiRow));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: { window: 'year' }, actor: { customer_id: 5 } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('handles 0 charges (null collection rates)', async () => {
      mockQuery
        .mockResolvedValueOnce(oneRow({ GrossCharges: 0, Payments: 0, Adjustments: 0, SelfPayCharges: 0, SelfPayPayments: 0, TotalClaims: 0, DeniedClaims: 0 }))
        .mockResolvedValue(oneRow({ TotalResolved: 0, FirstPass: 0 }));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: {} }), res);
      const json = res.json.mock.calls[0][0];
      expect(json.data.grossCollectionRate).toBeNull();
      expect(json.data.denialRate).toBeNull();
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getKpis(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getClaimEvents', () => {
    it('happy path returns events', async () => {
      const { queryClaimEvents } = require('../utils/claim-events');
      (queryClaimEvents as jest.Mock).mockResolvedValueOnce([{ id: 1, event_type: 'claim_created' }]);
      const res = makeRes();
      await ctrl.getClaimEvents(makeReq({ query: { claimId: 'CL001' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.data).toHaveLength(1);
    });

    it('with all filter params', async () => {
      const { queryClaimEvents } = require('../utils/claim-events');
      (queryClaimEvents as jest.Mock).mockResolvedValueOnce([]);
      const res = makeRes();
      await ctrl.getClaimEvents(makeReq({
        query: { claimId: 'CL001', eventType: 'payment_posted', from: '2025-01-01', to: '2025-12-31' },
        actor: { customer_id: 5 },
      }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 when queryClaimEvents throws', async () => {
      const { queryClaimEvents } = require('../utils/claim-events');
      (queryClaimEvents as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      const res = makeRes();
      await ctrl.getClaimEvents(makeReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

/* ================================================================== */
/*  RECON IQ - CLAIM SUMMARY                                          */
/* ================================================================== */

describe('ReconIqClaimSummaryController', () => {
  const ctrl = new ReconIqClaimSummaryController();

  it('returns matched=false when no records', async () => {
    mockQuery.mockResolvedValueOnce(emptyRecordset);
    const res = makeRes();
    await ctrl.get(makeReq({ params: { claimId: 'CLM001' } }), res);
    expect(res.json).toHaveBeenCalledWith({ matched: false });
  });

  it('returns matched=true with full row when found', async () => {
    mockQuery.mockResolvedValueOnce(oneRow({
      eobId: 'EOB001', eobDate: '2025-01-15', eobType: 'ERA',
      matchedPaymentAmount: 500, matchedPaymentDate: '2025-01-16',
      reconciliationStatus: 'Matched - Unposted',
    }));
    const res = makeRes();
    await ctrl.get(makeReq({ params: { claimId: 'CLM001' } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ matched: true, eobType: 'ERA' }));
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ params: { claimId: 'CLM001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  RECON IQ - MATCH STATS                                            */
/* ================================================================== */

describe('MatchStats', () => {
  const ctrl = new MatchStats();

  const statsRow = { payment_eob_matched: 10, fully_reconciled_posted: 5, payments_without_eob: 2, eob_without_payments: 3 };

  it('happy path returns stats array', async () => {
    mockQuery.mockResolvedValueOnce(oneRow(statsRow));
    const res = makeRes();
    await ctrl.get(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.stats).toHaveLength(5);
  });

  it('with locationScope=practice and practices filter calls expandWithAliases', async () => {
    const { expandWithAliases } = require('../utils/expand-filter');
    (expandWithAliases as jest.Mock).mockResolvedValueOnce(['Clinic A', 'Clinic A - Main']);
    mockQuery.mockResolvedValueOnce(oneRow(statsRow));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { locationScope: 'practice', practices: 'Clinic A', from: '2025-01-01', to: '2025-12-31' } }), res);
    expect(expandWithAliases).toHaveBeenCalledWith(expect.anything(), 'location', ['Clinic A']);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('with payers as array', async () => {
    mockQuery.mockResolvedValueOnce(oneRow(statsRow));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { payers: ['Blue Cross', 'Medicare'] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('filters "all" from practices CSV', async () => {
    mockQuery.mockResolvedValueOnce(oneRow(statsRow));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { locationScope: 'practice', practices: 'all' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.filters.practices).toBeNull(); // 'all' is filtered out
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  RECON IQ - ERA/EOB PAYMENT                                        */
/* ================================================================== */

describe('EraEobPayment', () => {
  const ctrl = new EraEobPayment();

  const seriesRow = {
    period: '2025-01', eraEobPaymentAmount: 5000, patientResponsibilityAmount: 500,
    adjustmentsAmount: 200, unmatchedPaymentsNoEobCount: 3, unmatchedNoPaymentToEobCount: 2,
  };

  it('happy path returns series', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([seriesRow]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { practiceId: 'all', interval: 'month' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.series).toHaveLength(1);
  });

  it('locationScope=practice with practices array uses first practice', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { locationScope: 'practice', practices: 'MainClinic' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.filters.practiceLocation).toBe('MainClinic');
  });

  it('practiceId not all uses practiceId', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { practiceId: 'CLINIC123' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.filters.practiceLocation).toBe('CLINIC123');
  });

  it('payers and providers as arrays', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { payers: ['Medicare', 'Medicaid'], providers: ['Dr. Smith'] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('payers="all" \u2192 filtered to null', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { payers: 'all' } }), res);
    const json = res.json.mock.calls[0][0];
    expect(json.filters.payers).toBeNull();
  });

  it('with from/to dates', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { from: '2025-01-01', to: '2025-12-31' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  RECON IQ - DENIED CLAIMS AND NON-PAYMENTS                        */
/* ================================================================== */

describe('DeniedClaimsAndNonPayments', () => {
  const ctrl = new DeniedClaimsAndNonPayments();

  it('happy path returns reversed series', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([
      { period: '2025-03', denialsAmount: 1000, nonPaymentsCount: 5 },
      { period: '2025-02', denialsAmount: 900, nonPaymentsCount: 3 },
    ]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { interval: 'month' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    // reversed
    expect(json.series[0].period).toBe('2025-02');
    expect(json.series[1].period).toBe('2025-03');
  });

  it('locationScope=practice applies practicesCsv filter', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { locationScope: 'practice', practices: 'MainClinic' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.filters.practices).toBe('MainClinic');
  });

  it('practices="all" filtered out \u2192 null', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { locationScope: 'practice', practices: 'all' } }), res);
    const json = res.json.mock.calls[0][0];
    expect(json.filters.practices).toBeNull();
  });

  it('locationScope not practice \u2192 null practicesCsv regardless', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { locationScope: 'global', practices: 'Clinic' } }), res);
    const json = res.json.mock.calls[0][0];
    expect(json.filters.practices).toBeNull();
  });

  it('with from/to/payers/providers filters', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({
      query: { from: '2025-01-01', to: '2025-12-31', payers: 'Medicare', providers: 'Dr. Smith' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('payers as array', async () => {
    mockQuery.mockResolvedValueOnce(manyRows([]));
    const res = makeRes();
    await ctrl.get(makeReq({ query: { payers: ['Blue Cross', 'Aetna'] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await ctrl.get(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
