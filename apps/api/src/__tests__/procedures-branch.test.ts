/**
 * procedures-branch.test.ts
 * Targeted branch coverage for ProceduresController.
 * Focuses on: buildFilterConditions variants, date range combos,
 * aging/AR-balance switch cases, sort columns, non-Error throws,
 * percentage change branches, formatToDollarAbbreviation tiers.
 */

/* -- DB mock -- */
const mockQuery = jest.fn();
const mockInput = jest.fn();

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
    default: { getInstance: () => ({ getPool: () => pool }) },
  };
});

jest.mock('mssql', () => {
  const makeRequest = () => {
    const r: any = {
      input: (...a: any[]) => { mockInput(...a); return r; },
      query: mockQuery,
    };
    return r;
  };
  const typeStub = (...args: any[]) => args[0];
  typeStub.MAX = 65535;
  const defaultExport = {
    Request: jest.fn().mockImplementation(makeRequest),
    NVarChar: typeStub, VarChar: typeStub,
    Int: typeStub, BigInt: typeStub, Float: typeStub, Decimal: typeStub,
    Bit: typeStub, DateTime: typeStub, Date: typeStub, UniqueIdentifier: typeStub,
    SmallInt: typeStub,
  };
  return {
    __esModule: true,
    default: defaultExport,
    NVarChar: typeStub, VarChar: typeStub,
    Int: typeStub, BigInt: typeStub, Float: typeStub, Decimal: typeStub,
    Bit: typeStub, DateTime: typeStub, Date: typeStub, UniqueIdentifier: typeStub,
    SmallInt: typeStub, Request: jest.fn().mockImplementation(makeRequest),
  };
});

jest.mock('chalk', () => {
  const fn = (s: any) => s;
  fn.bgRed = { white: (s: any) => s };
  fn.bgGreen = { white: (s: any) => s };
  fn.bgYellow = { white: (s: any) => s };
  fn.greenBright = (s: any) => s;
  fn.blueBright = (s: any) => s;
  fn.yellow = (s: any) => s;
  fn.redBright = (s: any) => s;
  return { __esModule: true, default: fn, ...fn };
});

import { ProceduresController } from '../controllers/procedures/index';

function makeReq(overrides: any = {}): any {
  const req: any = { body: {}, params: {}, query: {}, ...overrides };
  // Controller reads customer_id from req.actor.customer_id (set by auth middleware)
  // Check body.customer_id or body.params.customer_id (for getSourceData)
  const cid = req.body?.customer_id ?? req.body?.params?.customer_id;
  if (cid && !req.actor) {
    req.actor = { customer_id: Number(cid) };
  }
  return req;
}

function makeRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// 6 empty results for getSourceData's 6 parallel queries
const SIX_EMPTY = Array(6).fill({ recordset: [] });
// 3 empty results for getTotalARBalance's 3 parallel queries
const THREE_EMPTY = Array(3).fill({ recordset: [] });

let ctrl: ProceduresController;

beforeEach(() => {
  ctrl = new ProceduresController();
  jest.resetAllMocks();
});

/* ===================================================================
   getProceduresAndClaimCounts - validation + non-Error catch
=================================================================== */
describe('getProceduresAndClaimCounts()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: { months_ago: 12 } });
    const res = makeRes();
    await ctrl.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when months_ago is not a positive integer', async () => {
    const req = makeReq({ body: { customer_id: '1', months_ago: -5 } });
    const res = makeRes();
    await ctrl.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when months_ago is zero', async () => {
    const req = makeReq({ body: { customer_id: '1', months_ago: 0 } });
    const res = makeRes();
    await ctrl.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when months_ago is a float', async () => {
    const req = makeReq({ body: { customer_id: '1', months_ago: 1.5 } });
    const res = makeRes();
    await ctrl.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with valid params', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ date_of_service: '2026-01' }] });
    const req = makeReq({ body: { customer_id: '1', months_ago: 12 } });
    const res = makeRes();
    await ctrl.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 with Error instance message', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db fail'));
    const req = makeReq({ body: { customer_id: '1', months_ago: 6 } });
    const res = makeRes();
    await ctrl.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('db fail');
  });

  it('returns 500 with non-Error throw (uses "Unknown error" branch)', async () => {
    mockQuery.mockRejectedValueOnce('plain string error');
    const req = makeReq({ body: { customer_id: '1', months_ago: 3 } });
    const res = makeRes();
    await ctrl.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });
});

/* ===================================================================
   getPayerChargesByDateOfService - non-Error + validation
=================================================================== */
describe('getPayerChargesByDateOfService()', () => {
  it('returns 400 when payer missing', async () => {
    const req = makeReq({ body: { customer_id: '1', months_ago: 6 } });
    const res = makeRes();
    await ctrl.getPayerChargesByDateOfService(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce({ code: 42 });
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getPayerChargesByDateOfService(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });

  it('returns 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getPayerChargesByDateOfService(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/* ===================================================================
   getPayerPaymentsByDOS - non-Error
=================================================================== */
describe('getPayerPaymentsByDOS()', () => {
  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce(null);
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getPayerPaymentsByDOS(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });

  it('returns 400 when months_ago invalid', async () => {
    const req = makeReq({ body: { customer_id: '1', months_ago: 'bad', payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getPayerPaymentsByDOS(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

/* ===================================================================
   getPayerUncollectedDollarAmounts - non-Error
=================================================================== */
describe('getPayerUncollectedDollarAmounts()', () => {
  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce('crash');
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getPayerUncollectedDollarAmounts(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });
});

/* ===================================================================
   getTotalInsuranceCollections - date range + percentage branches
=================================================================== */
describe('getTotalInsuranceCollections()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('uses default date filter when no payment_date filter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 5000, prior_year_collections: 4000 }] });
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses start+end date filter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 1000, prior_year_collections: 0 }] });
    const req = makeReq({
      body: {
        customer_id: '1',
        filters: { payment_date: { start_date: '2026-01-01', end_date: '2026-03-31' } },
      },
    });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    // prior_year_collections=0 means percentageChange stays '--'
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.percentage).toContain('--');
  });

  it('uses start-only date filter', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 2000, prior_year_collections: 1000 }] });
    const req = makeReq({
      body: {
        customer_id: '1',
        filters: { payment_date: { start_date: '2026-01-01' } },
      },
    });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    // prior > 0, positive change symbol
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.percentage).toContain('+');
  });

  it('uses end-only date filter with negative change', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 500, prior_year_collections: 2000 }] });
    const req = makeReq({
      body: {
        customer_id: '1',
        filters: { payment_date: { end_date: '2026-03-31' } },
      },
    });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    // Negative change: no '+' symbol but also not '--'
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.percentage).not.toContain('--');
  });

  it('formats very large total (millions)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 5000000, prior_year_collections: 4000000 }] });
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.total).toContain('M');
  });

  it('formats thousands-range total', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 5000, prior_year_collections: 0 }] });
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.total).toContain('K');
  });

  it('formats small total (under 1000)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 500, prior_year_collections: 0 }] });
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.total).toMatch(/^\$/);
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce('boom');
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toContain('Unknown error occurred');
  });
});

/* ===================================================================
   getTotalPatientCollections - percentage change branches
=================================================================== */
describe('getTotalPatientCollections()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getTotalPatientCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns -- when prior_year_collections is 0', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getTotalPatientCollections(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.percentage).toContain('--');
  });

  it('shows positive percentage when current > prior', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 200, prior_year_collections: 100 }] });
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getTotalPatientCollections(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.percentage).toContain('+');
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce({ x: 1 });
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getTotalPatientCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toContain('Unknown error occurred');
  });
});

/* ===================================================================
   getRevenueByLocation - sort + pagination + non-Error
=================================================================== */
describe('getRevenueByLocation()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('uses default page/limit when not provided', async () => {
    // 2 parallel queries: data + totalCount
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses provided page and limit', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ location_id: 1, location_name: 'L1',
        total_submitted: 1000, total_submitted_with_date: 900, insurance_billed: 5,
        insurance_collections: 800, patient_collections: 100, gross_collections: 900,
        gross_collections_percentage: 90, collection_rate: 90, Adjustment: 0, Refunded: 0 }],
    });
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalRecords: 1 }] });
    const req = makeReq({ body: { customer_id: '1', page: 2, limit: 5 } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.pagination.currentPage).toBe(2);
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce('fail');
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });
});

/* ===================================================================
   getRCMSummary - calculation branches
=================================================================== */
describe('getRCMSummary()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getRCMSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles zero submitted (collection rate = 0)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        current_year_submitted: 0, current_year_collections: 0,
        previous_year_submitted: 0, previous_year_collections: 0,
        current_year_claims: 0, previous_year_claims: 0,
        current_year_gross_production: 0, previous_year_gross_production: 0,
      }],
    });
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getRCMSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.collectionRate.percentage).toBe('0.0%');
  });

  it('calculates positive claims percentage change', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        current_year_submitted: 10000, current_year_collections: 8000,
        previous_year_submitted: 8000, previous_year_collections: 6000,
        current_year_claims: 100, previous_year_claims: 80,
        current_year_gross_production: 8000, previous_year_gross_production: 6000,
      }],
    });
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getRCMSummary(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.claims.difference).toContain('+');
  });

  it('calculates negative gross production change', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        current_year_submitted: 8000, current_year_collections: 6000,
        previous_year_submitted: 10000, previous_year_collections: 9000,
        current_year_claims: 80, previous_year_claims: 100,
        current_year_gross_production: 6000, previous_year_gross_production: 9000,
      }],
    });
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getRCMSummary(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.grossProduction.difference).not.toContain('+');
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce('fail');
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getRCMSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toContain('Unknown error occurred');
  });
});

/* ===================================================================
   getARSummary - percentage sign branches
=================================================================== */
describe('getARSummary()', () => {
  it('uses default customer_id when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 30 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 0 }] });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getARSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('shows + sign for positive percentage difference', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 40 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 30 }] });
    const req = makeReq({ body: { customer_id: 1 } });
    const res = makeRes();
    await ctrl.getARSummary(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.percentage_difference).toContain('+');
  });

  it('shows empty sign for negative percentage difference', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 20 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 30 }] });
    const req = makeReq({ body: { customer_id: 1 } });
    const res = makeRes();
    await ctrl.getARSummary(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.percentage_difference).not.toContain('+');
  });

  it('formats single day as "1 day" not "1 days"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 1 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 0 }] });
    const req = makeReq({ body: { customer_id: 1 } });
    const res = makeRes();
    await ctrl.getARSummary(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.current_year_average_days_in_ar).toBe('1 day');
  });

  it('formats plural days', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 45 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 0 }] });
    const req = makeReq({ body: { customer_id: 1 } });
    const res = makeRes();
    await ctrl.getARSummary(req, res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.current_year_average_days_in_ar).toContain('days');
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce('nope');
    const req = makeReq({ body: { customer_id: 1 } });
    const res = makeRes();
    await ctrl.getARSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });
});

/* ===================================================================
   getARAndCollections - non-Error
=================================================================== */
describe('getARAndCollections()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getARAndCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with empty result', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getARAndCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce({ code: 'ERR' });
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getARAndCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toContain('Unknown error occurred');
  });
});

/* ===================================================================
   getCollectionsByDateRange - with/without filters
=================================================================== */
describe('getCollectionsByDateRange()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with empty filters object', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce('boom');
    const req = makeReq({ body: { customer_id: '1', filters: {} } });
    const res = makeRes();
    await ctrl.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });

  it('returns 500 when filters not supplied (TypeError in buildFilterConditions)', async () => {
    // buildFilterConditions(undefined) tries filters.aging which throws TypeError
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getCollectionsByDateRange(req, res);
    // TypeError is caught and returned as 500
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ===================================================================
   getTotalARBalance - date range branches
   NOTE: runs 3 parallel Promise.all queries
=================================================================== */
describe('getTotalARBalance()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  const agingRow = { total_outstanding: 1000, total_0_30: 500, total_31_60: 300, total_61_90: 150, total_over_90: 50 };

  it('uses no date condition when start and end both missing', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [agingRow] });
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // specialty
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // arTrends
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses start_date only condition', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [agingRow] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1', start_date: '2026-01-01' } });
    const res = makeRes();
    await ctrl.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses end_date only condition', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [agingRow] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1', end_date: '2026-03-31' } });
    const res = makeRes();
    await ctrl.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses both start_date and end_date condition', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [agingRow] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1', start_date: '2026-01-01', end_date: '2026-03-31' } });
    const res = makeRes();
    await ctrl.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles specialtyTotal=0 (percentage=0.00)', async () => {
    const zeroAging = { total_outstanding: 0, total_0_30: 0, total_31_60: 0, total_61_90: 0, total_over_90: 0 };
    mockQuery.mockResolvedValueOnce({ recordset: [zeroAging] }); // aging
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // specialty empty
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // arTrends
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles specialty with nonzero total', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [agingRow] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ category: 'E&M', category_total: 500 }, { category: 'Surgery', category_total: 300 }] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ month: '2026-01', total_0_30: 100, total_31_60: 50, total_61_90: 20, total_over_90: 10 }] });
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.ar_specialty.details.length).toBe(2);
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce('crash');
    const req = makeReq({ body: { customer_id: '1' } });
    const res = makeRes();
    await ctrl.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });
});

/* ===================================================================
   getSourceData - sort column + filter branches
   NOTE: runs 6 parallel queries
=================================================================== */
describe('getSourceData()', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = makeReq({ body: { params: {} } });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  function makeSourceReq(sort: any, filters: any = {}) {
    return makeReq({ body: { params: { customer_id: '1', page: 1, limit: 10, sort, filters } } });
  }

  function setupSixEmptyResults() {
    // getSourceData runs Promise.all with 6 queries:
    // [0] countQuery       - needs recordset[0].totalRecords
    // [1] dataQuery        - can be empty
    // [2] uniqueProviders  - can be empty
    // [3] uniqueLocations  - can be empty
    // [4] uniqueCptGroups  - can be empty
    // [5] uniquePayers     - can be empty
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] }); // count
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // data
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // providers
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // locations
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // cptCategories
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // payers
  }

  it('uses default sort (payer_837) when column not in columnMappings', async () => {
    setupSixEmptyResults();
    // 'payer' maps to 'payer_837' - valid
    const req = makeSourceReq({ column: 'payer', direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses DESC sort direction', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'desc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses submitted sort column (maps to submitted)', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'submitted', direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses ar_balance sort column', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'ar_balance', direction: 'desc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses insurance-medicare-collected sort column', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'insurance-medicare-collected', direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses total_paid sort column', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'total_paid', direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses code sort column', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'code', direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Test all aging filter switch cases
  const agingCases = ['0-30', '31-60', '61-90', '91-120', '121-150', '151-180', '180+'];
  agingCases.forEach(aging => {
    it(`applies aging filter: ${aging}`, async () => {
      setupSixEmptyResults();
      const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { aging });
      const res = makeRes();
      await ctrl.getSourceData(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  it('skips aging filter when aging=all', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { aging: 'all' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('skips aging filter when aging not set', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, {});
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Test all AR balance switch cases
  const arBalanceCases = ['Over $500', '$400-$499', '$300-$399', '$200-$299', '$100-$199', '$50-$99', '$0-$49'];
  arBalanceCases.forEach(ar_balance => {
    it(`applies AR balance filter: ${ar_balance}`, async () => {
      setupSixEmptyResults();
      const req = makeSourceReq({ column: 'ar_balance', direction: 'asc' }, { ar_balance });
      const res = makeRes();
      await ctrl.getSourceData(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  it('skips AR balance filter when ar_balance=all', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { ar_balance: 'all' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies location filter', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { location: 'Clinic A' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('skips location filter when location=all', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { location: 'all' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies provider filter', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { provider: 'Dr. Smith' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies query filter', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { query: 'CLM001' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies payer filter', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { payer: 'Medicare' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies cpt_group filter', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, { cpt_group: 'E&M' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies payment_received date range \u2014 start+end', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, {
      payment_received: { start_date: '2026-01-01', end_date: '2026-03-31' },
    });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies payment_received date range \u2014 start only', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, {
      payment_received: { start_date: '2026-01-01' },
    });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies payment_received date range \u2014 end only', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, {
      payment_received: { end_date: '2026-03-31' },
    });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies date_of_service range \u2014 start+end', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, {
      date_of_service: { start_date: '2026-01-01', end_date: '2026-03-31' },
    });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies date_of_service range \u2014 start only', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, {
      date_of_service: { start_date: '2026-01-01' },
    });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies date_of_service range \u2014 end only', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'payer', direction: 'asc' }, {
      date_of_service: { end_date: '2026-03-31' },
    });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce('crash');
    const req = makeSourceReq({ column: 'payer', direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });

  // Test buildOrderByClause string columns by passing them as sort.column
  // These will default to payer_837 in columnMappings lookup (most aren't valid mapped keys)
  // but buildOrderByClause still receives the raw sort.column and routes them
  it('buildOrderByClause: string sort on patient column directly', async () => {
    setupSixEmptyResults();
    // 'patient' maps to 'patient_last_name_837' in columnMappings, which IS in values
    const req = makeSourceReq({ column: 'patient', direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildOrderByClause: numeric sort with financial column via provider mapping', async () => {
    setupSixEmptyResults();
    // 'provider' maps to 'location' - which IS in values
    const req = makeSourceReq({ column: 'provider', direction: 'desc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildOrderByClause: sort without column uses default', async () => {
    setupSixEmptyResults();
    // sort with no column - fallback to payer_837
    const req = makeSourceReq({ direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses contracted sort column', async () => {
    setupSixEmptyResults();
    const req = makeSourceReq({ column: 'contracted', direction: 'asc' });
    const res = makeRes();
    await ctrl.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/* ===================================================================
   buildFilterConditions edge cases via getCollectionsByDateRange
=================================================================== */
describe('buildFilterConditions \u2014 edge cases', () => {
  it('handles aging filter with uppercase ALL', async () => {
    // 'ALL'.toLowerCase() === 'all' so filter is skipped
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1', filters: { aging: 'ALL' } } });
    const res = makeRes();
    await ctrl.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles aging filter with unknown value (no switch case match, still 200)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1', filters: { aging: '200+' } } });
    const res = makeRes();
    await ctrl.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles all filters together', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({
      body: {
        customer_id: '1',
        filters: {
          aging: '0-30',
          location: 'Loc1',
          provider: 'Dr. Jones',
          query: 'search',
          payer: 'Anthem',
          cpt_group: 'Surgery',
          ar_balance: 'Over $500',
          payment_received: { start_date: '2026-01-01', end_date: '2026-03-31' },
          date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' },
        },
      },
    });
    const res = makeRes();
    await ctrl.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/* ===================================================================
   getProceduresBilledByCPTGroup - non-Error
=================================================================== */
describe('getProceduresBilledByCPTGroup()', () => {
  it('returns 400 when validation fails', async () => {
    const req = makeReq({ body: { months_ago: 6, payer: 'Medicare' } }); // no customer_id
    const res = makeRes();
    await ctrl.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ category: 'E&M', value: 1000, percentage: 50.5 }],
    });
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 with Error instance', async () => {
    mockQuery.mockRejectedValueOnce(new Error('query fail'));
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('query fail');
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce({ code: 'TIMEOUT' });
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });
});

/* ===================================================================
   getProceduresUncollectedBilledByCPTGroup - non-Error
=================================================================== */
describe('getProceduresUncollectedBilledByCPTGroup()', () => {
  it('returns 400 when validation fails', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.getProceduresUncollectedBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 with non-Error throw', async () => {
    mockQuery.mockRejectedValueOnce(42);
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getProceduresUncollectedBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Unknown error occurred');
  });

  it('returns 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ category: 'E&M', uncollected_amount: 500, percentage: 100.0 }],
    });
    const req = makeReq({ body: { customer_id: '1', months_ago: 6, payer: 'Medicare' } });
    const res = makeRes();
    await ctrl.getProceduresUncollectedBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/* ===================================================================
   buildOrderByClauseAdvanced - via getRevenueByLocation
=================================================================== */
describe('buildOrderByClauseAdvanced via getRevenueByLocation()', () => {
  it('returns default ORDER BY when sort is null (no column)', async () => {
    // buildOrderByClauseAdvanced returns '' when !sort, so getRevenueByLocation uses 'ORDER BY l.uid'
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const req = makeReq({ body: { customer_id: '1', sort: null } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns default ORDER BY when sort.column is empty', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const req = makeReq({ body: { customer_id: '1', sort: { column: '', direction: 'ASC' } } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('throws when sort column is invalid (not in columnMap)', async () => {
    // buildOrderByClauseAdvanced throws Error for column not in columnMap/validColumns
    // getRevenueByLocation catches it as 500
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = makeReq({ body: { customer_id: '1', sort: { column: 'invalidCol', direction: 'ASC' } } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    // Should be 500 because buildOrderByClauseAdvanced throws
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('applies valid sort with ASC direction', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const req = makeReq({ body: { customer_id: '1', sort: { column: 'name', direction: 'ASC' } } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies valid sort with DESC direction', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const req = makeReq({ body: { customer_id: '1', sort: { column: 'charges', direction: 'DESC' } } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sanitizes non-DESC direction to ASC', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    mockQuery.mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const req = makeReq({ body: { customer_id: '1', sort: { column: 'name', direction: 'asc' } } });
    const res = makeRes();
    await ctrl.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
