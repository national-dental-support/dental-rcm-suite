/**
 * coverage-procedures-claims.test.ts
 *
 * Targeted branch coverage for:
 *   - src/controllers/procedures/index.ts  (83 uncovered branches)
 *   - src/controllers/claims/index.ts      (50 uncovered branches)
 *
 * Focus: non-Error throws, null/undefined filters, "all" filter skips,
 * secondary/tertiary date-range branches, formatToDollarAbbreviation tiers,
 * buildOrderByClauseAdvanced edge cases, isPositiveInteger edge cases,
 * payment_date filter variants, AR-balance switch arms, aging switch arms,
 * getARSummary + getARAndCollections paths, etc.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/*  Shared mocks (hoisted before imports)                               */
/* ------------------------------------------------------------------ */

const mockQuery = jest.fn<any>();
const mockRequestInstance: any = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
};
const mockPoolRequest = jest.fn().mockReturnValue(mockRequestInstance);

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => ({ request: mockPoolRequest }),
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
    VarChar: Object.assign(f, { MAX: f() }),
    UniqueIdentifier: f(),
    SmallInt: f(),
    Request: jest.fn().mockImplementation(() => mockRequestInstance),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/* chalk proxy - avoids property chain failures */
const _fn = (s: any) => s;
const _cp: any = new Proxy(_fn, {
  get: () => _cp,
  apply: (_t: any, _this: any, args: any[]) => args[0],
});
jest.mock('chalk', () => ({
  __esModule: true,
  default: _cp,
  blue: _cp, green: _cp, red: _cp, yellow: _cp, blueBright: _cp,
  greenBright: _cp, redBright: _cp,
  bgRed: _cp, bgGreen: _cp, bgYellow: _cp,
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const mockReq = (body: any = {}, params: any = {}, query: any = {}) => ({
  body,
  params,
  query,
  headers: {},
  actor: { customer_id: 1, user_id: 'U001', email: 'test@test.com', role: 'Admin' },
  socket: { remoteAddress: '127.0.0.1' },
  ip: '127.0.0.1',
} as any);

/** Request with no customer_id on actor - triggers 400 guards in ProceduresController */
const noCustomerReq = (body: any = {}, params: any = {}, query: any = {}) => ({
  body,
  params,
  query,
  headers: {},
  actor: { customer_id: null, user_id: 'U001', email: 'test@test.com', role: 'Admin' },
  socket: { remoteAddress: '127.0.0.1' },
  ip: '127.0.0.1',
} as any);

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn();
  return r;
};

/* ------------------------------------------------------------------ */
/*  Import controllers AFTER mocks                                      */
/* ------------------------------------------------------------------ */

import { ProceduresController } from '../controllers/procedures/index';
import { ClaimsController } from '../controllers/claims/index';

/* ================================================================== */
/*  ProceduresController - uncovered branches                          */
/* ================================================================== */

describe('ProceduresController \u2014 uncovered branches', () => {
  let ctrl: ProceduresController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockPoolRequest.mockReturnValue(mockRequestInstance);
    ctrl = new ProceduresController();
  });

  /* -- isPositiveInteger edge cases ------------------------------- */

  it('getProceduresAndClaimCounts: 400 when customer_id is missing', async () => {
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(noCustomerReq({ months_ago: 6 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresAndClaimCounts: 400 when months_ago is 0 (not positive)', async () => {
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: 0 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresAndClaimCounts: 400 when months_ago is negative', async () => {
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: -3 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresAndClaimCounts: 400 when months_ago is a float', async () => {
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: 1.5 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresAndClaimCounts: 400 when months_ago is undefined', async () => {
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresAndClaimCounts: 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ date_of_service: '2025-01', claims_count: 5, cpt_count: 10, cpt_per_claim: 2 }] });
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: 12 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getProceduresAndClaimCounts: 500 on non-Error throw (string)', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: 12 }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.error).toBe('Unknown error occurred');
  });

  it('getProceduresAndClaimCounts: 500 on Error throw', async () => {
    mockQuery.mockRejectedValue(new Error('DB failure'));
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: 12 }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.error).toBe('DB failure');
  });

  /* -- getPayerChargesByDateOfService ----------------------------- */

  it('getPayerChargesByDateOfService: 400 when payer is missing', async () => {
    const res = mockRes();
    await ctrl.getPayerChargesByDateOfService(mockReq({ customer_id: '1', months_ago: 6 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getPayerChargesByDateOfService: 400 when customer_id is missing', async () => {
    const res = mockRes();
    await ctrl.getPayerChargesByDateOfService(noCustomerReq({ months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getPayerChargesByDateOfService: 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getPayerChargesByDateOfService(mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getPayerChargesByDateOfService: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('string error');
    const res = mockRes();
    await ctrl.getPayerChargesByDateOfService(mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.error).toBe('Unknown error occurred');
  });

  /* -- getPayerPaymentsByDOS -------------------------------------- */

  it('getPayerPaymentsByDOS: 400 when payer missing', async () => {
    const res = mockRes();
    await ctrl.getPayerPaymentsByDOS(mockReq({ customer_id: '1', months_ago: 6 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getPayerPaymentsByDOS: 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getPayerPaymentsByDOS(mockReq({ customer_id: '1', months_ago: 6, payer: 'Aetna' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getPayerPaymentsByDOS: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('raw string');
    const res = mockRes();
    await ctrl.getPayerPaymentsByDOS(mockReq({ customer_id: '1', months_ago: 6, payer: 'Aetna' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getPayerUncollectedDollarAmounts -------------------------- */

  it('getPayerUncollectedDollarAmounts: 400 when payer missing', async () => {
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmounts(mockReq({ customer_id: '1', months_ago: 6 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getPayerUncollectedDollarAmounts: 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmounts(mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getPayerUncollectedDollarAmounts: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue(42);
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmounts(mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getPayerUncollectedDollarAmountsPerClaimByPercentage ------- */

  it('getPayerUncollectedDollarAmountsPerClaimByPercentage: 400 when missing payer', async () => {
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmountsPerClaimByPercentage(
      mockReq({ customer_id: '1', months_ago: 6 }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getPayerUncollectedDollarAmountsPerClaimByPercentage: 200 when totalSum = 0 (percentage = 0)', async () => {
    // All zero values -> percentage branch: totalSum = 0 -> all percentages = 0
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        'Over $500': 0, '$400-$499': 0, '$300-$399': 0,
        '$200-$299': 0, '$100-$199': 0, '$50-$99': 0, '$0-$49': 0,
      }],
    });
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmountsPerClaimByPercentage(
      mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body['Over $500'].percentage).toBe(0);
  });

  it('getPayerUncollectedDollarAmountsPerClaimByPercentage: 200 when totalSum > 0 (real percentages)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        'Over $500': 1000, '$400-$499': 0, '$300-$399': 0,
        '$200-$299': 0, '$100-$199': 0, '$50-$99': 0, '$0-$49': 0,
      }],
    });
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmountsPerClaimByPercentage(
      mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body['Over $500'].percentage).toBe(100);
  });

  it('getPayerUncollectedDollarAmountsPerClaimByPercentage: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue({ code: 'ERR' });
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmountsPerClaimByPercentage(
      mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getPayerUncollectedDollarAmountCategoriesByPercentage ------- */

  it('getPayerUncollectedDollarAmountCategoriesByPercentage: 400 when payer missing', async () => {
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmountCategoriesByPercentage(
      mockReq({ customer_id: '1', months_ago: 6 }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getPayerUncollectedDollarAmountCategoriesByPercentage: 200 with totalUncollected=0 (zero percentages)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        date_of_service: '2025-01',
        total_uncollected_for_month: '0',
        'Over $500': '0', '$400-$499': '0', '$300-$399': '0',
        '$200-$299': '0', '$100-$199': '0', '$50-$99': '0', '$0-$49': '0',
      }],
    });
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmountCategoriesByPercentage(
      mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body[0].percentages['Over $500']).toBe(0);
  });

  it('getPayerUncollectedDollarAmountCategoriesByPercentage: 200 with non-zero values', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        date_of_service: '2025-01',
        total_uncollected_for_month: '1000',
        'Over $500': '600', '$400-$499': '0', '$300-$399': '0',
        '$200-$299': '0', '$100-$199': '0', '$50-$99': '0', '$0-$49': '0',
      }],
    });
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmountCategoriesByPercentage(
      mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body[0].percentages['Over $500']).toBeGreaterThan(0);
  });

  it('getPayerUncollectedDollarAmountCategoriesByPercentage: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('plain string');
    const res = mockRes();
    await ctrl.getPayerUncollectedDollarAmountCategoriesByPercentage(
      mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getProceduresBilledByCPTGroup ----------------------------- */

  it('getProceduresBilledByCPTGroup: 400 when payer missing', async () => {
    const res = mockRes();
    await ctrl.getProceduresBilledByCPTGroup(mockReq({ customer_id: '1', months_ago: 6 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresBilledByCPTGroup: 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ category: 'Cardiology', value: 5000, percentage: 50 }],
    });
    const res = mockRes();
    await ctrl.getProceduresBilledByCPTGroup(mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getProceduresBilledByCPTGroup: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('plain');
    const res = mockRes();
    await ctrl.getProceduresBilledByCPTGroup(mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getProceduresUncollectedBilledByCPTGroup ------------------ */

  it('getProceduresUncollectedBilledByCPTGroup: 400 when customer_id missing', async () => {
    const res = mockRes();
    await ctrl.getProceduresUncollectedBilledByCPTGroup(noCustomerReq({ months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresUncollectedBilledByCPTGroup: 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ category: 'Radiology', value: 300, percentage: 30 }],
    });
    const res = mockRes();
    await ctrl.getProceduresUncollectedBilledByCPTGroup(mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getProceduresUncollectedBilledByCPTGroup: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue(null);
    const res = mockRes();
    await ctrl.getProceduresUncollectedBilledByCPTGroup(mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getTotalInsuranceCollections - date filter branches ---------- */

  it('getTotalInsuranceCollections: 400 when customer_id missing', async () => {
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(noCustomerReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getTotalInsuranceCollections: 200 with both start_date and end_date (BETWEEN branch)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 5000, prior_year_collections: 4000 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { payment_date: { start_date: '2025-01-01', end_date: '2025-12-31' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: 200 with only start_date (>= branch)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 2000, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { payment_date: { start_date: '2025-01-01' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: 200 with only end_date (<= branch)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 3000, prior_year_collections: 3500 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { payment_date: { end_date: '2025-12-31' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: 200 with no payment_date filter (default year branch)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 1000, prior_year_collections: 800 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: percentageChange >= 0 branch (positive change)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 1100, prior_year_collections: 1000 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).toContain('+');
  });

  it('getTotalInsuranceCollections: percentageChange < 0 branch (negative change)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 800, prior_year_collections: 1000 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).not.toContain('+');
  });

  it('getTotalInsuranceCollections: prior=0 branch (percentageChange stays "--")', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 500, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).toContain('--');
  });

  it('getTotalInsuranceCollections: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('oops');
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- formatToDollarAbbreviation tiers (exercised via getTotalInsuranceCollections) -- */

  it('formatToDollarAbbreviation: >= 1M tier', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 2_500_000, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json.mock.calls[0][0] as any).total).toContain('M');
  });

  it('formatToDollarAbbreviation: >= 1K tier', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 3500, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json.mock.calls[0][0] as any).total).toContain('K');
  });

  it('formatToDollarAbbreviation: < 1K tier (plain dollar)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 42, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json.mock.calls[0][0] as any).total).toMatch(/^\$/);
    expect((res.json.mock.calls[0][0] as any).total).not.toContain('K');
    expect((res.json.mock.calls[0][0] as any).total).not.toContain('M');
  });

  /* -- getTotalPatientCollections -------------------------------- */

  it('getTotalPatientCollections: 400 when customer_id missing', async () => {
    const res = mockRes();
    await ctrl.getTotalPatientCollections(noCustomerReq({ filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getTotalPatientCollections: 200 with prior > 0 (positive percentageChange)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 1200, prior_year_collections: 1000 }],
    });
    const res = mockRes();
    await ctrl.getTotalPatientCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).toContain('+');
  });

  it('getTotalPatientCollections: 200 with prior > 0 (negative percentageChange)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 800, prior_year_collections: 1000 }],
    });
    const res = mockRes();
    await ctrl.getTotalPatientCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).not.toContain('+');
  });

  it('getTotalPatientCollections: 200 with prior = 0 (stays "--")', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 500, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalPatientCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json.mock.calls[0][0] as any).percentage).toContain('--');
  });

  it('getTotalPatientCollections: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('boom');
    const res = mockRes();
    await ctrl.getTotalPatientCollections(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- buildFilterConditions - procedures (all aging switch arms) -- */

  it('getTotalInsuranceCollections: aging filter "0-30"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { aging: '0-30' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: aging filter "31-60"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { aging: '31-60' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: aging filter "61-90"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { aging: '61-90' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: aging filter "91-120"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { aging: '91-120' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: aging filter "121-150"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { aging: '121-150' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: aging filter "151-180"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { aging: '151-180' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: aging filter "180+"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { aging: '180+' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: aging filter "all" (skipped)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 100, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { aging: 'all' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions - ar_balance switch arms ----------- */

  it('getTotalInsuranceCollections: ar_balance filter "Over $500"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { ar_balance: 'Over $500' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: ar_balance filter "$400-$499"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { ar_balance: '$400-$499' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: ar_balance filter "$300-$399"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { ar_balance: '$300-$399' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: ar_balance filter "$200-$299"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { ar_balance: '$200-$299' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: ar_balance filter "$100-$199"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { ar_balance: '$100-$199' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: ar_balance filter "$50-$99"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { ar_balance: '$50-$99' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: ar_balance filter "$0-$49"', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(
      mockReq({ customer_id: '1', filters: { ar_balance: '$0-$49' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions - payment_received date sub-branches - */

  it('getCollectionsByDateRange: payment_received both start+end', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { payment_received: { start_date: '2025-01-01', end_date: '2025-12-31' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: payment_received only start_date', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { payment_received: { start_date: '2025-01-01' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: payment_received only end_date', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { payment_received: { end_date: '2025-12-31' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: date_of_service both start+end', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: date_of_service only start_date', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { date_of_service: { start_date: '2025-06-01' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: date_of_service only end_date', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { date_of_service: { end_date: '2025-12-31' } },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: 400 when customer_id missing', async () => {
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(noCustomerReq({ filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getCollectionsByDateRange: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('fail');
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({ customer_id: '1', filters: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getRevenueByLocation -------------------------------------- */

  it('getRevenueByLocation: 400 when customer_id missing', async () => {
    const res = mockRes();
    await ctrl.getRevenueByLocation(noCustomerReq({ page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getRevenueByLocation: 200 with valid data and sort', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ location_id: 'L1', location_name: 'Main', total_submitted: 1000, total_submitted_with_date: 900, insurance_billed: 5, insurance_collections: 800, patient_collections: 200, gross_collections: 1000, gross_collections_percentage: 100, collection_rate: 100, Adjustment: 0, Refunded: 0 }] })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 1 }] });
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({ customer_id: '1', page: 1, limit: 10, sort: { column: 'name', direction: 'ASC' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getRevenueByLocation: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('db crash');
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getRCMSummary ---------------------------------------------- */

  it('getRCMSummary: 400 when customer_id missing', async () => {
    const res = mockRes();
    await ctrl.getRCMSummary(noCustomerReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getRCMSummary: 200 with current>prior (positive symbols)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        current_year_submitted: 1000, current_year_collections: 900,
        previous_year_submitted: 900, previous_year_collections: 800,
        current_year_claims: 100, previous_year_claims: 80,
        current_year_gross_production: 900, previous_year_gross_production: 800,
      }],
    });
    const res = mockRes();
    await ctrl.getRCMSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.claims.difference).toContain('+');
    expect(body.grossProduction.difference).toContain('+');
  });

  it('getRCMSummary: 200 with current<prior (negative symbols)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        current_year_submitted: 800, current_year_collections: 700,
        previous_year_submitted: 1000, previous_year_collections: 900,
        current_year_claims: 80, previous_year_claims: 100,
        current_year_gross_production: 700, previous_year_gross_production: 900,
      }],
    });
    const res = mockRes();
    await ctrl.getRCMSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.claims.difference).not.toContain('+');
    expect(body.grossProduction.difference).not.toContain('+');
  });

  it('getRCMSummary: 200 with all zeros (prior=0, defaulting)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        current_year_submitted: 0, current_year_collections: 0,
        previous_year_submitted: 0, previous_year_collections: 0,
        current_year_claims: 0, previous_year_claims: 0,
        current_year_gross_production: 0, previous_year_gross_production: 0,
      }],
    });
    const res = mockRes();
    await ctrl.getRCMSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getRCMSummary: 200 when recordset is empty (uses default destructure fallback)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getRCMSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getRCMSummary: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('err string');
    const res = mockRes();
    await ctrl.getRCMSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- getARSummary ----------------------------------------------- */

  it('getARSummary: 200 with prior year > 0 (positive percentageDifference)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 35 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 30 }] });
    const res = mockRes();
    await ctrl.getARSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage_difference).toContain('+');
  });

  it('getARSummary: 200 with prior year > 0 (negative percentageDifference)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 25 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 30 }] });
    const res = mockRes();
    await ctrl.getARSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage_difference).not.toContain('+');
  });

  it('getARSummary: 200 with prior year = 0 (percentageDifference = 0, empty sign)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 30 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 0 }] });
    const res = mockRes();
    await ctrl.getARSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage_difference).toBeDefined();
  });

  it('getARSummary: 200 with average_days_in_ar = 1 (uses singular "day")', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 0 }] });
    const res = mockRes();
    await ctrl.getARSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.current_year_average_days_in_ar).toContain('day');
    expect(body.current_year_average_days_in_ar).not.toContain('days');
  });

  it('getARSummary: 200 with average_days_in_ar = 2 (uses plural "days")', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 2 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 0 }] });
    const res = mockRes();
    await ctrl.getARSummary(mockReq({ customer_id: '1' }), res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.current_year_average_days_in_ar).toContain('days');
  });

  it('getARSummary: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('argh');
    const res = mockRes();
    await ctrl.getARSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getARAndCollections --------------------------------------- */

  it('getARAndCollections: 400 when customer_id missing', async () => {
    const res = mockRes();
    await ctrl.getARAndCollections(noCustomerReq({ page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getARAndCollections: 200 with empty recordset', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({ customer_id: '1', page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json.mock.calls[0][0] as any)).toHaveLength(0);
  });

  it('getARAndCollections: 200 with records (iterates subRows)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ location_id: 'L1', location_name: 'Main', collection_count: 5, patient_collections: 100, insurance_collections: 200, gross_collections: 300, production_dollar_per_hour: 50, ar_balance: 10 }],
      })
      .mockResolvedValueOnce({ recordset: [] }); // subQuery for L1
    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({ customer_id: '1', page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveLength(1);
    expect(body[0].subRows).toHaveLength(0);
  });

  it('getARAndCollections: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('fail');
    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({ customer_id: '1', page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    // Error message includes controller-specific prefix
    expect((res.json.mock.calls[0][0] as any).error).toContain('Unknown error occurred');
  });

  /* -- getTotalARBalance - date condition branches --------------- */

  it('getTotalARBalance: 400 when customer_id missing', async () => {
    const res = mockRes();
    await ctrl.getTotalARBalance(noCustomerReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getTotalARBalance: 200 with start_date AND end_date (BETWEEN branch)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ total_0_30: 100, total_31_60: 50, total_61_90: 20, total_over_90: 10, total_outstanding: 180 }],
    })
    .mockResolvedValueOnce({ recordset: [] })
    .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1', start_date: '2025-01-01', end_date: '2025-12-31' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalARBalance: 200 with only start_date (>= branch)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ total_0_30: 0, total_31_60: 0, total_61_90: 0, total_over_90: 0, total_outstanding: 0 }],
    })
    .mockResolvedValueOnce({ recordset: [] })
    .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1', start_date: '2025-01-01' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalARBalance: 200 with only end_date (<= branch)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ total_0_30: 0, total_31_60: 0, total_61_90: 0, total_over_90: 0, total_outstanding: 0 }],
    })
    .mockResolvedValueOnce({ recordset: [] })
    .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1', end_date: '2025-12-31' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalARBalance: 200 with no dates (empty dateRangeCondition)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ total_0_30: 0, total_31_60: 0, total_61_90: 0, total_over_90: 0, total_outstanding: 0 }],
    })
    .mockResolvedValueOnce({ recordset: [] })
    .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalARBalance: 200 specialtyTotal > 0 branch', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ total_0_30: 100, total_31_60: 50, total_61_90: 20, total_over_90: 10, total_outstanding: 180 }],
    })
    .mockResolvedValueOnce({ recordset: [{ category: 'Cardiology', category_total: 180 }] })
    .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.ar_specialty.details[0].percentage).not.toBe('0.00');
  });

  it('getTotalARBalance: 200 totalOutstandingARBalance > 0 branch', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ total_0_30: 180, total_31_60: 0, total_61_90: 0, total_over_90: 0, total_outstanding: 180 }],
    })
    .mockResolvedValueOnce({ recordset: [] })
    .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.ar_aging.details[0].percentage).not.toBe('0.00');
  });

  it('getTotalARBalance: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('db fail');
    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- getSourceData ---------------------------------------------- */

  it('getSourceData: 400 when customer_id missing in params', async () => {
    const res = mockRes();
    await ctrl.getSourceData(noCustomerReq({ params: { page: 1, limit: 10, filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getSourceData: 200 on success with default sort', async () => {
    const emptyRecordset = { recordset: [] };
    const countRecordset = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRecordset) // count
      .mockResolvedValueOnce(emptyRecordset) // data
      .mockResolvedValueOnce(emptyRecordset) // providers
      .mockResolvedValueOnce(emptyRecordset) // locations
      .mockResolvedValueOnce(emptyRecordset) // cpt
      .mockResolvedValueOnce(emptyRecordset); // payers
    const res = mockRes();
    await ctrl.getSourceData(mockReq({ params: { customer_id: '1', page: 1, limit: 10, filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: 200 with numeric sort column (insurance_paid)', async () => {
    const emptyRecordset = { recordset: [] };
    const countRecordset = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRecordset)
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(emptyRecordset);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'insurance-medicare-collected', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: 200 with string sort column (code)', async () => {
    const emptyRecordset = { recordset: [] };
    const countRecordset = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRecordset)
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(emptyRecordset)
      .mockResolvedValueOnce(emptyRecordset);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'code', direction: 'desc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: 500 on non-Error throw', async () => {
    mockQuery.mockRejectedValue('fail');
    const res = mockRes();
    await ctrl.getSourceData(mockReq({ params: { customer_id: '1', page: 1, limit: 10, filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('Unknown error occurred');
  });

  /* -- buildOrderByClauseAdvanced - error throw branch ----------- */

  it('getRevenueByLocation: buildOrderByClauseAdvanced throws for invalid column \u2192 500', async () => {
    // Passing an invalid column causes buildOrderByClauseAdvanced to throw
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({
      customer_id: '1', page: 1, limit: 10,
      sort: { column: 'INVALID_COLUMN', direction: 'ASC' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

});

/* ================================================================== */
/*  ClaimsController - uncovered branches                             */
/* ================================================================== */

describe('ClaimsController \u2014 uncovered branches', () => {
  let ctrl: ClaimsController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockPoolRequest.mockReturnValue(mockRequestInstance);
    ctrl = new ClaimsController();
  });

  /* -- 400 validation paths -------------------------------------- */

  it('get: 400 when location_ids is empty array', async () => {
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('get: 400 when location_ids is not an array', async () => {
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: '10' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('get: 400 when customer_id is a string', async () => {
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 'abc', location_ids: [10] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('updateClaimStatusOverAPI: 400 when claim_id is missing', async () => {
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(mockReq({ status: 'Open' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('updateClaimStatusOverAPI: 400 when status is missing', async () => {
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(mockReq({ claim_id: 'CL001' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  /* -- buildFilterConditions - aging switch arms ---------------- */

  it('get: filter aging "0-30"', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { aging: '0-30' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: filter aging "30-60"', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { aging: '30-60' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: filter aging "60-90"', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { aging: '60-90' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: filter aging "90+"', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { aging: '90+' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions - filter applied vs skipped ------- */

  it('get: filter query is a real search term (applied)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { query: 'Smith' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: filter payer is a real value (applied)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { payer: 'Aetna' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: filter issue_type is a real value (applied)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Denied', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { issue_type: 'Denied' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: filter total_dollar_value is a real value (applied)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { total_dollar_value: '1500.00' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: filter total_dollar_value is "all" (skipped)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { total_dollar_value: 'all' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- sort column branches -------------------------------------- */

  it('get: sort by patient_first_name', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], sort: { column: 'patient_first_name', direction: 'asc' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: sort by total_dollar_value desc (CAST branch)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], sort: { column: 'total_dollar_value', direction: 'desc' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: sort by status (no _837 suffix)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], sort: { column: 'status', direction: 'asc' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: sort column not in allowed list (ignored, uses default)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], sort: { column: 'invalid_col', direction: 'asc' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- non-Error throw from countFilteredClaims -> 500 ----------- */

  it('get: 500 on string throw from countFilteredClaims', async () => {
    mockQuery.mockRejectedValue('raw string error');
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- updateClaimStatusOverAPI: non-Error throw -> 500 ----------- */

  it('updateClaimStatusOverAPI: 500 on non-Error string throw', async () => {
    mockQuery.mockRejectedValue('plain string');
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(mockReq({ claim_id: 'CL001', status: 'Closed' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- expired_days provided (non-zero) vs default 3 ------------ */

  it('get: with expired_days provided \u2192 uses that threshold', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Pending', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], expired_days: 0.5 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- Pending claim with recent updated_at (stays in pendingClaims) -- */

  it('get: Pending claim with recent updated_at stays in pendingClaims', async () => {
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Pending', updated_at: fiveSecondsAgo }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], expired_days: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.claims).toHaveLength(1);
  });

  /* -- Non-pending claim is always in otherClaims --------------- */

  it('get: non-Pending claim always goes to otherClaims', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.claims).toHaveLength(1);
  });

});
