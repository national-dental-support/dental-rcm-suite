/**
 * analytics-gap.test.ts
 * Covers: analytics/medicare-dashboard/*, analytics/rcm/*, analytics/payer-mix/*
 */

const mockQuery = jest.fn();
const mockInput = jest.fn();
const mockRequestInstance = {
  input: (...a: any[]) => { mockInput(...a); return mockRequestInstance; },
  query: mockQuery,
};

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ getPool: () => ({ request: () => mockRequestInstance }) }),
  },
  databaseInstance: { getPool: () => ({ request: () => mockRequestInstance }) },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(),
    Date: f(), Float: f(), VarChar: f, UniqueIdentifier: f(),
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

jest.mock('../utils/telemetry', () => ({ trackEvent: jest.fn() }));

// Mock chalk
jest.mock('chalk', () => {
  const fn = (s: any) => s;
  fn.bgRed = { white: (s: any) => s };
  fn.greenBright = (s: any) => s;
  fn.cyan = (s: any) => s;
  return { __esModule: true, default: fn, bgRed: fn.bgRed, greenBright: fn.greenBright };
});

const mockReq = (body: any = {}, headers: any = {}) => ({ body, headers, query: {} } as any);
const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

// --- MEDICARE DASHBOARD ---------------------------------------------------

describe('CptAndClaimCountsByDOS', () => {
  let CptAndClaimCountsByDOS: any;
  beforeAll(() => {
    ({ CptAndClaimCountsByDOS } = require('../controllers/analytics/medicare-dashboard/cpt-and-claim-counts'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 with no filters', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ date_of_service: '2025-01-01', claims_count: 5 }] });
    const ctrl = new CptAndClaimCountsByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with location+practiceGroups+provider filters', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new CptAndClaimCountsByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { location: ['Clinic A'], practice_groups: ['GroupA'], provider: ['Dr. Smith'], date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' } } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with provider as string', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new CptAndClaimCountsByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { provider: 'Dr Jones' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with provider=all string', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new CptAndClaimCountsByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { provider: 'all' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));
    const ctrl = new CptAndClaimCountsByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ChargesVsMedicareByDOS', () => {
  let ChargesVsMedicareByDOS: any;
  beforeAll(() => {
    ({ ChargesVsMedicareByDOS } = require('../controllers/analytics/medicare-dashboard/charges-vs-medicare'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 with default dates', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ date_of_service: '2025-01-01', billed: 1000 }] });
    const ctrl = new ChargesVsMedicareByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with explicit date range', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new ChargesVsMedicareByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { date_of_service: { start_date: '2025-01-01', end_date: '2025-06-30' }, location: ['Loc1'], practice_groups: ['PG1'], provider: ['Dr X'] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ChargesVsMedicareByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PaymentsVsMedicareByDOS', () => {
  let PaymentsVsMedicareByDOS: any;
  beforeAll(() => {
    ({ PaymentsVsMedicareByDOS } = require('../controllers/analytics/medicare-dashboard/payments-vs-medicare'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 combining allowable and payments data', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ date_of_service: '2025-01', medicare_allowable: 500 }] })
      .mockResolvedValueOnce({ recordset: [{ date_of_service: '2025-01', payments: 300 }] });
    const ctrl = new PaymentsVsMedicareByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' } } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with location filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const ctrl = new PaymentsVsMedicareByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { location: ['L1'], practice_groups: ['PG1'], provider: ['Dr A'] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new PaymentsVsMedicareByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('UncollectedMedicarePerClaimByDOS', () => {
  let UncollectedMedicarePerClaimByDOS: any;
  beforeAll(() => {
    ({ UncollectedMedicarePerClaimByDOS } = require('../controllers/analytics/medicare-dashboard/uncollected-medicare-per-claim'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new UncollectedMedicarePerClaimByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with filters', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ date_of_service: '2025-01-01' }] });
    const ctrl = new UncollectedMedicarePerClaimByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { location: ['L1'], practice_groups: ['PG1'], provider: ['P1'], date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' } } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new UncollectedMedicarePerClaimByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

const uncollectedMCRRow = { 'Over $500': 1000, '$400-$499': 500, '$300-$399': 200, '$200-$299': 100, '$100-$199': 50, '$50-$99': 25, '$0-$49': 10 };

describe('UncollectedMCRPerClaimByDOS', () => {
  let UncollectedMCRPerClaimByDOS: any;
  beforeAll(() => {
    ({ UncollectedMCRPerClaimByDOS } = require('../controllers/analytics/medicare-dashboard/uncollected-mcr-per-claim'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 with amounts and percentages', async () => {
    mockQuery.mockResolvedValue({ recordset: [uncollectedMCRRow] });
    const ctrl = new UncollectedMCRPerClaimByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with filters', async () => {
    mockQuery.mockResolvedValue({ recordset: [uncollectedMCRRow] });
    const ctrl = new UncollectedMCRPerClaimByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { location: ['L1'], practice_groups: ['PG1'], provider: ['P1'], date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' } } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new UncollectedMCRPerClaimByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('UncollectedMedicarePerClaimMixByDOS', () => {
  let UncollectedMedicarePerClaimMixByDOS: any;
  beforeAll(() => {
    ({ UncollectedMedicarePerClaimMixByDOS } = require('../controllers/analytics/medicare-dashboard/uncollected-medicare-per-claim-mix'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new UncollectedMedicarePerClaimMixByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with location/group/provider filters', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new UncollectedMedicarePerClaimMixByDOS();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: { location: ['L1'], practice_groups: ['PG1'], provider: ['P1'] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new UncollectedMedicarePerClaimMixByDOS();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('MedicareByCptGroup', () => {
  let MedicareByCptGroup: any;
  beforeAll(() => {
    ({ MedicareByCptGroup } = require('../controllers/analytics/medicare-dashboard/medicare-by-cpt-group'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ cpt_group_name: 'Surgery', total_billed: 5000 }] });
    const ctrl = new MedicareByCptGroup();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new MedicareByCptGroup();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('UncollectedMedicareByCptGroup', () => {
  let UncollectedMedicareByCptGroup: any;
  beforeAll(() => {
    ({ UncollectedMedicareByCptGroup } = require('../controllers/analytics/medicare-dashboard/uncollected-medicare-by-cpt-group'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new UncollectedMedicareByCptGroup();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new UncollectedMedicareByCptGroup();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('MedicareDashboardController (index)', () => {
  let MedicareDashboardController: any;
  beforeAll(() => {
    ({ MedicareDashboardController } = require('../controllers/analytics/medicare-dashboard/index'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('instantiates and delegates getCptAndClaimCountsByDOS', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getCptAndClaimCountsByDOS(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delegates getChargesVsMedicareByDOS', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getChargesVsMedicareByDOS(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delegates getPaymentsVsMedicareByDOS', async () => {
    mockQuery.mockResolvedValue({ recordset: [] }).mockResolvedValue({ recordset: [] });
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getPaymentsVsMedicareByDOS(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delegates getUncollectedMedicarePerClaim', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getUncollectedMedicarePerClaim(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delegates getUncollectedMCRPerClaimByDOS', async () => {
    mockQuery.mockResolvedValue({ recordset: [uncollectedMCRRow] });
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getUncollectedMCRPerClaimByDOS(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delegates getUncollectedMedicarePerClaimMix', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getUncollectedMedicarePerClaimMix(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delegates getMedicareByCptGroup', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getMedicareByCptGroup(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delegates getUncollectedMedicareByCptGroup', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getUncollectedMedicareByCptGroup(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 when sub-controller throws', async () => {
    mockQuery.mockRejectedValue(new Error('DB down'));
    const ctrl = new MedicareDashboardController();
    const res = mockRes();
    await ctrl.getCptAndClaimCountsByDOS(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// --- RCM ANALYTICS --------------------------------------------------------

describe('ClaimsCount (RCM)', () => {
  let ClaimsCount: any;
  beforeAll(() => {
    ({ ClaimsCount } = require('../controllers/analytics/rcm/claims-count'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 with claims count data', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ CurrentClaims: 100, PreviousClaims: 90, YoYChange: 10 }] });
    const ctrl = new ClaimsCount();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ClaimsCount();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('CollectionRate (RCM)', () => {
  let CollectionRate: any;
  beforeAll(() => {
    ({ CollectionRate } = require('../controllers/analytics/rcm/collection-rate'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it.skip('returns 200 with collection rate data', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ CollectionRatePct: 85.5, CollectionRatePct_Prev: 82.0, YoY_Change_pp: 3.5 }] });
    const ctrl = new CollectionRate();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data).toHaveProperty('currentRate');
  });

  it('returns 200 with null rates', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ CollectionRatePct: null, CollectionRatePct_Prev: null, YoY_Change_pp: null }] });
    const ctrl = new CollectionRate();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new CollectionRate();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('GrossProduction (RCM)', () => {
  let GrossProduction: any;
  beforeAll(() => {
    ({ GrossProduction } = require('../controllers/analytics/rcm/gross-production'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ CurGross: 50000, PrevGross: 45000 }] });
    const ctrl = new GrossProduction();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new GrossProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('RevenueByLocation (RCM)', () => {
  let RevenueByLocation: any;
  beforeAll(() => {
    ({ RevenueByLocation } = require('../controllers/analytics/rcm/revenue-by-location'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ Practice: 'Loc A', TotalRevenue: 1000 }] });
    const ctrl = new RevenueByLocation();
    const res = mockRes();
    await ctrl.get(mockReq({ filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new RevenueByLocation();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimValueByStatus (RCM) - uses new sql.Request', () => {
  let ClaimValueByStatus: any;
  beforeAll(() => {
    ({ ClaimValueByStatus } = require('../controllers/analytics/rcm/claim-value-by-status'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ClaimStatus: 'Open', ClaimValue: 10000 }] });
    const ctrl = new ClaimValueByStatus();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ClaimValueByStatus();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimAmountsByPractice (RCM) - uses new sql.Request', () => {
  let ClaimAmountsByPractice: any;
  beforeAll(() => {
    ({ ClaimAmountsByPractice } = require('../controllers/analytics/rcm/claim-amounts-by-practice'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 with records', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ Practice: 'Practice A', TotalClaimAmount: 5000 }] });
    const ctrl = new ClaimAmountsByPractice();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with null recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: null });
    const ctrl = new ClaimAmountsByPractice();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ClaimAmountsByPractice();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimAmountsByPayer (RCM) - uses new sql.Request', () => {
  let ClaimAmountsByPayer: any;
  beforeAll(() => {
    ({ ClaimAmountsByPayer } = require('../controllers/analytics/rcm/claim-amounts-by-payer'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ Payer: 'Medicare', TotalClaimAmount: 20000 }] });
    const ctrl = new ClaimAmountsByPayer();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ClaimAmountsByPayer();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('CollectionAdjustmentTrends (RCM) - uses new sql.Request', () => {
  let CollectionAdjustmentTrends: any;
  beforeAll(() => {
    ({ CollectionAdjustmentTrends } = require('../controllers/analytics/rcm/collection-adjustment-trends'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ MonthLabel: '2025-01', Collections: 5000, Adjustments: 200 }] });
    const ctrl = new CollectionAdjustmentTrends();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new CollectionAdjustmentTrends();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ClaimValuesByType (RCM) - uses new sql.Request', () => {
  let ClaimValuesByType: any;
  beforeAll(() => {
    ({ ClaimValuesByType } = require('../controllers/analytics/rcm/claim-values-by-type'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ClaimType: 'Primary', TotalClaimAmount: 3000 }] });
    const ctrl = new ClaimValuesByType();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ClaimValuesByType();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('RCMController (index)', () => {
  let RCMController: any;
  beforeAll(() => {
    ({ RCMController } = require('../controllers/analytics/rcm/index'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('instantiates all methods', () => {
    const ctrl = new RCMController();
    expect(typeof ctrl.getClaimsCount).toBe('function');
    expect(typeof ctrl.getCollectionRate).toBe('function');
    expect(typeof ctrl.getGrossProduction).toBe('function');
    expect(typeof ctrl.getRevenueByLocation).toBe('function');
    expect(typeof ctrl.getClaimValueByStatus).toBe('function');
    expect(typeof ctrl.getClaimAmountsByPractice).toBe('function');
    expect(typeof ctrl.getCollectionAdjustmentTrends).toBe('function');
    expect(typeof ctrl.getClaimAmountsByPayer).toBe('function');
    expect(typeof ctrl.getClaimValuesByType).toBe('function');
  });

  it('getClaimsCount delegates and returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ CurrentClaims: 10 }] });
    const ctrl = new RCMController();
    const res = mockRes();
    await ctrl.getClaimsCount(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionRate delegates and returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ CollectionRatePct: 80 }] });
    const ctrl = new RCMController();
    const res = mockRes();
    await ctrl.getCollectionRate(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// --- PAYER MIX ------------------------------------------------------------

describe('InsuranceCollections (PayerMix)', () => {
  let InsuranceCollections: any;
  beforeAll(() => {
    ({ InsuranceCollections } = require('../controllers/analytics/payer-mix/insurance-collections'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200 with total and formatted', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ InsuranceCollection: 1500000 }] });
    const ctrl = new InsuranceCollections();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.formatted).toContain('M');
  });

  it('returns formatted K for thousands', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ InsuranceCollection: 50000 }] });
    const ctrl = new InsuranceCollections();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const data = res.json.mock.calls[0][0];
    expect(data.formatted).toContain('K');
  });

  it('returns raw number for small amounts', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ InsuranceCollection: 500 }] });
    const ctrl = new InsuranceCollections();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    const data = res.json.mock.calls[0][0];
    expect(data.total).toBe(500);
  });

  it('returns 200 with default 0 when null', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ InsuranceCollection: null }] });
    const ctrl = new InsuranceCollections();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new InsuranceCollections();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PatientCollections (PayerMix)', () => {
  let PatientCollections: any;
  beforeAll(() => {
    ({ PatientCollections } = require('../controllers/analytics/payer-mix/patient-collections'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ PatientCollection: 200000 }] });
    const ctrl = new PatientCollections();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new PatientCollections();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('CollectionTrends (PayerMix)', () => {
  let CollectionTrends: any;
  beforeAll(() => {
    ({ CollectionTrends } = require('../controllers/analytics/payer-mix/collection-trends'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ Month: '2025-01', TotalCollections: 10000 }] });
    const ctrl = new CollectionTrends();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new CollectionTrends();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayerCollectionDetails', () => {
  let PayerCollectionDetails: any;
  beforeAll(() => {
    ({ PayerCollectionDetails } = require('../controllers/analytics/payer-mix/payer-collection-details'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ InsuranceName: 'Aetna', collections: 5000 }] });
    const ctrl = new PayerCollectionDetails();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new PayerCollectionDetails();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayersIncreasingProduction', () => {
  let PayersIncreasingProduction: any;
  beforeAll(() => {
    ({ PayersIncreasingProduction } = require('../controllers/analytics/payer-mix/payers-increasing-production'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new PayersIncreasingProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new PayersIncreasingProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayersDecreasingProduction', () => {
  let PayersDecreasingProduction: any;
  beforeAll(() => {
    ({ PayersDecreasingProduction } = require('../controllers/analytics/payer-mix/payers-decreasing-production'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new PayersDecreasingProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new PayersDecreasingProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ProceduresIncreasingProduction', () => {
  let ProceduresIncreasingProduction: any;
  beforeAll(() => {
    ({ ProceduresIncreasingProduction } = require('../controllers/analytics/payer-mix/procedures-increasing-production'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new ProceduresIncreasingProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ProceduresIncreasingProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ProceduresDecreasingProduction', () => {
  let ProceduresDecreasingProduction: any;
  beforeAll(() => {
    ({ ProceduresDecreasingProduction } = require('../controllers/analytics/payer-mix/procedures-decreasing-production'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const ctrl = new ProceduresDecreasingProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const ctrl = new ProceduresDecreasingProduction();
    const res = mockRes();
    await ctrl.get(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PayerMixController (index)', () => {
  let PayerMixController: any;
  beforeAll(() => {
    ({ PayerMixController } = require('../controllers/analytics/payer-mix/index'));
  });
  beforeEach(() => { mockQuery.mockReset(); });

  it('instantiates and has all methods', () => {
    const ctrl = new PayerMixController();
    expect(typeof ctrl.getInsuranceCollections).toBe('function');
    expect(typeof ctrl.getPatientCollections).toBe('function');
    expect(typeof ctrl.getCollectionTrends).toBe('function');
    expect(typeof ctrl.getPayersIncreasing).toBe('function');
    expect(typeof ctrl.getPayersDecreasing).toBe('function');
    expect(typeof ctrl.getProceduresIncreasing).toBe('function');
    expect(typeof ctrl.getProceduresDecreasing).toBe('function');
    expect(typeof ctrl.getPayerCollectionDetails).toBe('function');
  });
});
