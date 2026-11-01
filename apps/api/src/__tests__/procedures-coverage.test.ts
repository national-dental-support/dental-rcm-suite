/**
 * ProceduresController - Comprehensive Unit Test Suite
 * Coverage target: 80%+
 *
 * Run: npx jest --testPathPattern="procedures-coverage" --no-coverage
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/*  DB mock                                                             */
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

/* ------------------------------------------------------------------ */
/*  mssql mock                                                          */
/* ------------------------------------------------------------------ */
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
  return {
    __esModule: true,
    default: {
      Request: jest.fn().mockImplementation(makeRequest),
      NVarChar: typeStub, VarChar: typeStub,
      Int: typeStub, BigInt: typeStub, Float: typeStub, Decimal: typeStub,
      Date: typeStub, DateTime: typeStub, DateTime2: typeStub,
      Bit: typeStub, SmallInt: typeStub, UniqueIdentifier: typeStub,
      MAX: 65535,
    },
    Request: jest.fn().mockImplementation(makeRequest),
    NVarChar: typeStub, VarChar: typeStub,
    Int: typeStub, BigInt: typeStub, Float: typeStub, Decimal: typeStub,
    Date: typeStub, DateTime: typeStub, DateTime2: typeStub,
    Bit: typeStub, SmallInt: typeStub, UniqueIdentifier: typeStub,
    MAX: 65535,
  };
});

/* ------------------------------------------------------------------ */
/*  chalk mock - covers all used property chains                        */
/* ------------------------------------------------------------------ */
const fn = (s: any) => s;
const colorProxy: any = new Proxy(fn, {
  get: () => colorProxy,
  apply: (_t: any, _this: any, args: any[]) => args[0],
});

jest.mock('chalk', () => ({
  __esModule: true,
  default: colorProxy,
  greenBright: colorProxy,
  bgRed: colorProxy,
  bgGreen: colorProxy,
  bgYellow: colorProxy,
  blueBright: colorProxy,
  redBright: colorProxy,
  yellow: colorProxy,
}));

/* ------------------------------------------------------------------ */
/*  logger mock                                                         */
/* ------------------------------------------------------------------ */
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/* ------------------------------------------------------------------ */
/*  Import controller AFTER mocks                                       */
/* ------------------------------------------------------------------ */
import { ProceduresController } from '../controllers/procedures/index';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
const mockReq = (
  body: any = {},
  params: any = {},
  query: any = {},
  headers: any = {},
) => {
  // Controller reads customer_id from req.actor.customer_id (set by auth middleware)
  // Find customer_id in body directly or in body.params
  const cid = body.customer_id ?? body.params?.customer_id;
  return {
    body,
    params,
    query,
    headers,
    actor: cid ? { customer_id: Number(cid) } : undefined,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as any;
};

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn();
  return r;
};

/* ------------------------------------------------------------------ */
/*  Shared setup                                                        */
/* ------------------------------------------------------------------ */
let controller: ProceduresController;

beforeEach(() => {
  mockQuery.mockReset();
  mockInput.mockReset();
  controller = new ProceduresController();
});

/* ================================================================== */
/*  getProceduresAndClaimCounts                                         */
/* ================================================================== */
describe('getProceduresAndClaimCounts', () => {
  it('returns 400 when customer_id is missing', async () => {
    const req = mockReq({ months_ago: 12 });
    const res = mockRes();
    await controller.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when months_ago is missing', async () => {
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when months_ago is 0 (not positive)', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 0 });
    const res = mockRes();
    await controller.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when months_ago is negative', async () => {
    const req = mockReq({ customer_id: '1', months_ago: -5 });
    const res = mockRes();
    await controller.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with data on success', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ date_of_service: '2025-01', cpt_count: 10, claims_count: 5, cpt_per_claim: 2 }] });
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.any(Array));
  });

  it('returns 200 with empty recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const req = mockReq({ customer_id: '1', months_ago: 6 });
    const res = mockRes();
    await controller.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getProceduresAndClaimCounts(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getPayerChargesByDateOfService                                      */
/* ================================================================== */
describe('getPayerChargesByDateOfService', () => {
  it('returns 400 when customer_id is missing', async () => {
    const req = mockReq({ months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerChargesByDateOfService(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when payer is missing', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getPayerChargesByDateOfService(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when months_ago is invalid', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 'abc', payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerChargesByDateOfService(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with data on success', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ date_of_service: '2025-01', total_submitted: 1000 }] });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerChargesByDateOfService(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('DB fail'));
    const req = mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerChargesByDateOfService(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getPayerPaymentsByDOS                                               */
/* ================================================================== */
describe('getPayerPaymentsByDOS', () => {
  it('returns 400 when customer_id is missing', async () => {
    const req = mockReq({ months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerPaymentsByDOS(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when payer is missing', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getPayerPaymentsByDOS(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with records', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ date_of_service: '2025-01', total_contracted: 500 }] });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerPaymentsByDOS(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('DB fail'));
    const req = mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerPaymentsByDOS(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getPayerUncollectedDollarAmounts                                    */
/* ================================================================== */
describe('getPayerUncollectedDollarAmounts', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({ months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when payer missing', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmounts(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with data', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ date_of_service: '2025-01', total_uncollected_for_month: 1234 }] });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmounts(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmounts(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getPayerUncollectedDollarAmountsPerClaimByPercentage                */
/* ================================================================== */
describe('getPayerUncollectedDollarAmountsPerClaimByPercentage', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({ months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountsPerClaimByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when payer missing', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountsPerClaimByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 and calculates percentages correctly', async () => {
    const recordset = [{
      'Over $500': 500,
      '$400-$499': 200,
      '$300-$399': 100,
      '$200-$299': 50,
      '$100-$199': 30,
      '$50-$99': 20,
      '$0-$49': 10,
    }];
    mockQuery.mockResolvedValue({ recordset });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountsPerClaimByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0] as any;
    expect(jsonArg).toHaveProperty('Over $500');
    expect(jsonArg['Over $500']).toHaveProperty('percentage');
  });

  it('returns 200 with zero totalSum (all zeros)', async () => {
    const recordset = [{
      'Over $500': 0,
      '$400-$499': 0,
      '$300-$399': 0,
      '$200-$299': 0,
      '$100-$199': 0,
      '$50-$99': 0,
      '$0-$49': 0,
    }];
    mockQuery.mockResolvedValue({ recordset });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountsPerClaimByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0] as any;
    // All percentages should be 0 when totalSum is 0
    expect(jsonArg['Over $500'].percentage).toBe(0);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountsPerClaimByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getPayerUncollectedDollarAmountCategoriesByPercentage               */
/* ================================================================== */
describe('getPayerUncollectedDollarAmountCategoriesByPercentage', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({ months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountCategoriesByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when payer missing', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountCategoriesByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with transformed data including percentages', async () => {
    const recordset = [{
      date_of_service: '2025-01',
      total_uncollected_for_month: '1000',
      'Over $500': '500',
      '$400-$499': '200',
      '$300-$399': '150',
      '$200-$299': '100',
      '$100-$199': '50',
      '$50-$99': 0,
      '$0-$49': 0,
    }];
    mockQuery.mockResolvedValue({ recordset });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountCategoriesByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any[];
    expect(body[0]).toHaveProperty('date_of_service', '2025-01');
    expect(body[0]).toHaveProperty('percentages');
    expect(body[0].percentages).toHaveProperty('Over $500');
  });

  it('handles zero total_uncollected gracefully', async () => {
    const recordset = [{
      date_of_service: '2025-01',
      total_uncollected_for_month: '0',
      'Over $500': '0',
      '$400-$499': '0',
      '$300-$399': '0',
      '$200-$299': '0',
      '$100-$199': '0',
      '$50-$99': '0',
      '$0-$49': '0',
    }];
    mockQuery.mockResolvedValue({ recordset });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountCategoriesByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any[];
    expect(body[0].percentages['Over $500']).toBe(0);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getPayerUncollectedDollarAmountCategoriesByPercentage(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getProceduresBilledByCPTGroup                                       */
/* ================================================================== */
describe('getProceduresBilledByCPTGroup', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({ months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when payer missing', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when months_ago is invalid string', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 'xyz', payer: 'Medicare' });
    const res = mockRes();
    await controller.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 and formats pie chart data', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        { category: 'Urology', payer: 'Medicare', value: 1000, percentage: 50.123456 },
        { category: 'Cardiology', payer: 'Medicare', value: 1000, percentage: 49.876544 },
      ],
    });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any[];
    expect(body[0]).toHaveProperty('category', 'Urology');
    expect(body[0]).toHaveProperty('percentage', 50.12);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' });
    const res = mockRes();
    await controller.getProceduresBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getProceduresUncollectedBilledByCPTGroup                           */
/* ================================================================== */
describe('getProceduresUncollectedBilledByCPTGroup', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({ months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getProceduresUncollectedBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when payer missing', async () => {
    const req = mockReq({ customer_id: '1', months_ago: 12 });
    const res = mockRes();
    await controller.getProceduresUncollectedBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with formatted data', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        { category: 'Cardiology', payer: 'Medicare', value: 2000, percentage: 100.0 },
      ],
    });
    const req = mockReq({ customer_id: '1', months_ago: 12, payer: 'Medicare' });
    const res = mockRes();
    await controller.getProceduresUncollectedBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any[];
    expect(body[0].percentage).toBe(100);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1', months_ago: 6, payer: 'Medicare' });
    const res = mockRes();
    await controller.getProceduresUncollectedBilledByCPTGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getTotalInsuranceCollections                                        */
/* ================================================================== */
describe('getTotalInsuranceCollections', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with current/prior year data (no prior = "--")', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 5000, prior_year_collections: 0 }],
    });
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('percentage');
    expect(body.percentage).toContain('--');
  });

  it('returns 200 with percentage change when prior year > 0', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 11000, prior_year_collections: 10000 }],
    });
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).toContain('+10.0%');
  });

  it('handles payment_date start+end filter', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 2000, prior_year_collections: 1000 }],
    });
    const req = mockReq({
      customer_id: '1',
      filters: { payment_date: { start_date: '2025-01-01', end_date: '2025-12-31' } },
    });
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles payment_date start only filter', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 2000, prior_year_collections: 0 }],
    });
    const req = mockReq({
      customer_id: '1',
      filters: { payment_date: { start_date: '2025-01-01' } },
    });
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles payment_date end only filter', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 2000, prior_year_collections: 0 }],
    });
    const req = mockReq({
      customer_id: '1',
      filters: { payment_date: { end_date: '2025-12-31' } },
    });
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('formats collections >= 1M correctly', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 2_000_000, prior_year_collections: 1_000_000 }],
    });
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.total).toContain('M');
  });

  it('formats collections >= 1K correctly', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 5000, prior_year_collections: 0 }],
    });
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getTotalInsuranceCollections(req, res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.total).toContain('K');
  });
});

/* ================================================================== */
/*  getTotalPatientCollections                                          */
/* ================================================================== */
describe('getTotalPatientCollections', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getTotalPatientCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with "--" when prior year is zero', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 3000, prior_year_collections: 0 }],
    });
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getTotalPatientCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).toContain('--');
  });

  it('returns 200 with negative percentage change', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ current_year_collections: 8000, prior_year_collections: 10000 }],
    });
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getTotalPatientCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).toContain('-20.0%');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getTotalPatientCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getRevenueByLocation                                                */
/* ================================================================== */
describe('getRevenueByLocation', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with paginated location data', async () => {
    const locationRecord = {
      location_id: 1,
      location_name: 'Clinic A',
      total_submitted: 10000,
      total_submitted_with_date: 9000,
      insurance_billed: 50,
      insurance_collections: 8000,
      patient_collections: 2000,
      gross_collections: 10000,
      gross_collections_percentage: 100,
      collection_rate: 100,
      Adjustment: 500,
      Refunded: 200,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [locationRecord] })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 1 }] });

    const req = mockReq({ customer_id: '1', page: 1, limit: 10 });
    const res = mockRes();
    await controller.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(body.pagination.totalRecords).toBe(1);
  });

  it('returns 200 with sorted data (valid sort column)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });

    const req = mockReq({ customer_id: '1', page: 1, limit: 10, sort: { column: 'name', direction: 'ASC' } });
    const res = mockRes();
    await controller.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 when sort column is invalid (buildOrderByClauseAdvanced throws)', async () => {
    const req = mockReq({ customer_id: '1', sort: { column: 'invalidCol', direction: 'ASC' } });
    const res = mockRes();
    // This will throw in buildOrderByClauseAdvanced -> caught by try/catch -> 500
    await controller.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getRevenueByLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getRCMSummary                                                       */
/* ================================================================== */
describe('getRCMSummary', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getRCMSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with computed summary (all zeros)', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        current_year_submitted: 0,
        current_year_collections: 0,
        previous_year_submitted: 0,
        previous_year_collections: 0,
        current_year_claims: 0,
        previous_year_claims: 0,
        current_year_gross_production: 0,
        previous_year_gross_production: 0,
      }],
    });
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getRCMSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('collectionRate');
    expect(body).toHaveProperty('claims');
    expect(body).toHaveProperty('grossProduction');
  });

  it('returns 200 with positive rate and claims change', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        current_year_submitted: 100000,
        current_year_collections: 80000,
        previous_year_submitted: 90000,
        previous_year_collections: 70000,
        current_year_claims: 120,
        previous_year_claims: 100,
        current_year_gross_production: 80000,
        previous_year_gross_production: 70000,
      }],
    });
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getRCMSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.collectionRate.percentage).toBe('80.0%');
    expect(body.claims.difference).toContain('+20.0%');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getRCMSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('handles undefined error (non-Error thrown)', async () => {
    mockQuery.mockRejectedValue('string error');
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getRCMSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getARSummary                                                        */
/* ================================================================== */
describe('getARSummary', () => {
  it('returns 200 with default customer_id when not provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 25 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 30 }] });

    const req = mockReq({});
    const res = mockRes();
    await controller.getARSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('current_year_average_days_in_ar');
    expect(body).toHaveProperty('percentage_difference');
  });

  it('formats "1 day" (singular) correctly', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 0 }] });

    const req = mockReq({ customer_id: 1 });
    const res = mockRes();
    await controller.getARSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.current_year_average_days_in_ar).toBe('1 day');
  });

  it('formats "2 days" (plural) correctly', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 2 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 0 }] });

    const req = mockReq({ customer_id: 1 });
    const res = mockRes();
    await controller.getARSummary(req, res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.current_year_average_days_in_ar).toBe('2 days');
  });

  it('handles positive percentage difference', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 40 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 30 }] });

    const req = mockReq({ customer_id: 1 });
    const res = mockRes();
    await controller.getARSummary(req, res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage_difference).toContain('+');
  });

  it('handles negative percentage difference', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 20 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 30 }] });

    const req = mockReq({ customer_id: 1 });
    const res = mockRes();
    await controller.getARSummary(req, res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage_difference).toContain('-');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: 1 });
    const res = mockRes();
    await controller.getARSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getARAndCollections                                                  */
/* ================================================================== */
describe('getARAndCollections', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getARAndCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with empty recordset', async () => {
    // First query returns no records, so the for loop runs 0 times
    mockQuery.mockResolvedValue({ recordset: [] });
    const req = mockReq({ customer_id: '1', page: 1, limit: 10 });
    const res = mockRes();
    await controller.getARAndCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('returns 200 with location records and subRows', async () => {
    const mainRecord = {
      location_id: 'loc1',
      location_name: 'Main Clinic',
      collection_count: 10,
      patient_collections: 1000,
      insurance_collections: 5000,
      gross_collections: 6000,
      production_dollar_per_hour: 200,
      ar_balance: 300,
    };
    const subRecord = {
      provider_name: 'Dr. Smith',
      avg_production_per_hour: 150,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [mainRecord] })
      .mockResolvedValueOnce({ recordset: [subRecord] });

    const req = mockReq({ customer_id: '1', page: 1, limit: 10 });
    const res = mockRes();
    await controller.getARAndCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any[];
    expect(body[0]).toHaveProperty('id', 'loc1');
    expect(body[0]).toHaveProperty('subRows');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getARAndCollections(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getCollectionsByDateRange                                            */
/* ================================================================== */
describe('getCollectionsByDateRange', () => {
  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with monthly data', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        { month: '2025-01', total_insurance_paid: '8000.00', total_patient_paid: '1000.00' },
        { month: '2025-02', total_insurance_paid: '9000.50', total_patient_paid: '1200.75' },
      ],
    });
    const req = mockReq({ customer_id: '1', filters: {} });
    const res = mockRes();
    await controller.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any[];
    expect(body[0]).toHaveProperty('month', '2025-01');
    expect(body[0]).toHaveProperty('totalInsurancePaid', 8000);
    expect(body[0]).toHaveProperty('totalPatientPaid', 1000);
  });

  it('applies filters when provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const req = mockReq({
      customer_id: '1',
      filters: { aging: '0-30', location: 'Clinic A', provider: 'Dr. Jones' },
    });
    const res = mockRes();
    await controller.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getCollectionsByDateRange(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getTotalARBalance                                                    */
/* ================================================================== */
describe('getTotalARBalance', () => {
  const agingRow = {
    total_0_30: 1000,
    total_31_60: 2000,
    total_61_90: 3000,
    total_over_90: 4000,
    total_outstanding: 10000,
  };
  const specialtyRow = { category: 'Cardiology', category_total: 5000 };
  const trendRow = { month: '2025-01', total_0_30: 100, total_31_60: 200, total_61_90: 300, total_over_90: 400 };

  it('returns 400 when customer_id missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with all AR data (no date range)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [agingRow] })
      .mockResolvedValueOnce({ recordset: [specialtyRow] })
      .mockResolvedValueOnce({ recordset: [trendRow] });

    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('ar_aging');
    expect(body).toHaveProperty('ar_specialty');
    expect(body).toHaveProperty('ar_trends');
    expect(body.ar_aging.details).toHaveLength(4);
  });

  it('returns 200 with start_date + end_date (both set)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [agingRow] })
      .mockResolvedValueOnce({ recordset: [specialtyRow] })
      .mockResolvedValueOnce({ recordset: [trendRow] });

    const req = mockReq({ customer_id: '1', start_date: '2025-01-01', end_date: '2025-12-31' });
    const res = mockRes();
    await controller.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with start_date only', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [agingRow] })
      .mockResolvedValueOnce({ recordset: [specialtyRow] })
      .mockResolvedValueOnce({ recordset: [trendRow] });

    const req = mockReq({ customer_id: '1', start_date: '2025-01-01' });
    const res = mockRes();
    await controller.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with end_date only', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [agingRow] })
      .mockResolvedValueOnce({ recordset: [specialtyRow] })
      .mockResolvedValueOnce({ recordset: [trendRow] });

    const req = mockReq({ customer_id: '1', end_date: '2025-12-31' });
    const res = mockRes();
    await controller.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('calculates 0.00 percentages when total_outstanding is 0', async () => {
    const zeroAgingRow = {
      total_0_30: 0,
      total_31_60: 0,
      total_61_90: 0,
      total_over_90: 0,
      total_outstanding: 0,
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [zeroAgingRow] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.ar_aging.details[0].percentage).toBe('0.00');
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getTotalARBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  getSourceData                                                        */
/* ================================================================== */
describe('getSourceData', () => {
  const emptyResults = [
    { recordset: [{ totalRecords: 0 }] },
    { recordset: [] },
    { recordset: [] },
    { recordset: [] },
    { recordset: [] },
    { recordset: [] },
  ];

  it('returns 400 when customer_id missing from params', async () => {
    const req = mockReq({ params: {} });
    const res = mockRes();
    await controller.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('uses default sort column (payer_837) when sort column is unrecognized', async () => {
    // An unrecognized sort.column maps to undefined, then falls back to 'payer_837'
    // which IS in the valid values list, so it proceeds normally (no 400)
    emptyResults.forEach(r => mockQuery.mockResolvedValueOnce(r));
    const req = mockReq({
      params: {
        customer_id: '1',
        sort: { column: 'totally_invalid_col', direction: 'asc' },
        filters: {},
      },
    });
    const res = mockRes();
    await controller.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with data using default sort', async () => {
    emptyResults.forEach(r => mockQuery.mockResolvedValueOnce(r));

    const req = mockReq({
      params: {
        customer_id: '1',
        page: 1,
        limit: 10,
        filters: {},
      },
    });
    const res = mockRes();
    await controller.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(body).toHaveProperty('providers');
    expect(body).toHaveProperty('locations');
    expect(body).toHaveProperty('cptGroups');
    expect(body).toHaveProperty('payers');
  });

  it('returns 200 with data rows and filter results', async () => {
    const dataRow = {
      patient: 'J. Smith',
      practice_provider: 'Clinic A',
      dos_aging: '2025-01-01',
      days_ago: 30,
      payer: 'Medicare',
      carc: 'CO45',
      claim_id: 'CL5001',
      code: '99213',
    };
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 1 }] })
      .mockResolvedValueOnce({ recordset: [dataRow] })
      .mockResolvedValueOnce({ recordset: [{ provider: 'Dr. Jones' }] })
      .mockResolvedValueOnce({ recordset: [{ location: 'Clinic A' }] })
      .mockResolvedValueOnce({ recordset: [{ cpt_category: 'Urology' }] })
      .mockResolvedValueOnce({ recordset: [{ payer: 'Medicare' }] });

    const req = mockReq({
      params: {
        customer_id: '1',
        page: 1,
        limit: 10,
        sort: { column: 'payer', direction: 'asc' },
        filters: { aging: '31-60', payer: 'Medicare' },
      },
    });
    const res = mockRes();
    await controller.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.pagination.totalRecords).toBe(1);
    expect(body.providers).toContain('All');
    expect(body.providers).toContain('Dr. Jones');
  });

  it('returns 200 with valid sort column "submitted" (numeric sort)', async () => {
    emptyResults.forEach(r => mockQuery.mockResolvedValueOnce(r));
    const req = mockReq({
      params: {
        customer_id: '1',
        sort: { column: 'submitted', direction: 'desc' },
        filters: {},
      },
    });
    const res = mockRes();
    await controller.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 with valid sort column "code" (string sort)', async () => {
    emptyResults.forEach(r => mockQuery.mockResolvedValueOnce(r));
    const req = mockReq({
      params: {
        customer_id: '1',
        sort: { column: 'code', direction: 'asc' },
        filters: {},
      },
    });
    const res = mockRes();
    await controller.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValue(new Error('fail'));
    const req = mockReq({
      params: { customer_id: '1', filters: {} },
    });
    const res = mockRes();
    await controller.getSourceData(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  buildFilterConditions - exercised via getTotalInsuranceCollections  */
/* ================================================================== */
describe('buildFilterConditions (via getCollectionsByDateRange)', () => {
  const callWithFilters = async (filters: any) => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const req = mockReq({ customer_id: '1', filters });
    const res = mockRes();
    await controller.getCollectionsByDateRange(req, res);
    return res;
  };

  it('handles aging filter 0-30', async () => {
    const res = await callWithFilters({ aging: '0-30' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles aging filter 31-60', async () => {
    const res = await callWithFilters({ aging: '31-60' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles aging filter 61-90', async () => {
    const res = await callWithFilters({ aging: '61-90' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles aging filter 91-120', async () => {
    const res = await callWithFilters({ aging: '91-120' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles aging filter 121-150', async () => {
    const res = await callWithFilters({ aging: '121-150' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles aging filter 151-180', async () => {
    const res = await callWithFilters({ aging: '151-180' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles aging filter 180+', async () => {
    const res = await callWithFilters({ aging: '180+' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles aging filter = all (skips aging branch)', async () => {
    const res = await callWithFilters({ aging: 'all' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles provider filter', async () => {
    const res = await callWithFilters({ provider: 'Dr. Smith' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles provider = all (skips branch)', async () => {
    const res = await callWithFilters({ provider: 'all' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles query filter', async () => {
    const res = await callWithFilters({ query: 'CL5001' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles payer filter', async () => {
    const res = await callWithFilters({ payer: 'Medicare' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles payment_received start+end date range', async () => {
    const res = await callWithFilters({ payment_received: { start_date: '2025-01-01', end_date: '2025-12-31' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles payment_received start date only', async () => {
    const res = await callWithFilters({ payment_received: { start_date: '2025-01-01' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles payment_received end date only', async () => {
    const res = await callWithFilters({ payment_received: { end_date: '2025-12-31' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles date_of_service start+end date range', async () => {
    const res = await callWithFilters({ date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles date_of_service start only', async () => {
    const res = await callWithFilters({ date_of_service: { start_date: '2025-01-01' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles date_of_service end only', async () => {
    const res = await callWithFilters({ date_of_service: { end_date: '2025-12-31' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles cpt_group filter', async () => {
    const res = await callWithFilters({ cpt_group: 'Urology' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles ar_balance filter Over $500', async () => {
    const res = await callWithFilters({ ar_balance: 'Over $500' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles ar_balance filter $400-$499', async () => {
    const res = await callWithFilters({ ar_balance: '$400-$499' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles ar_balance filter $300-$399', async () => {
    const res = await callWithFilters({ ar_balance: '$300-$399' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles ar_balance filter $200-$299', async () => {
    const res = await callWithFilters({ ar_balance: '$200-$299' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles ar_balance filter $100-$199', async () => {
    const res = await callWithFilters({ ar_balance: '$100-$199' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles ar_balance filter $50-$99', async () => {
    const res = await callWithFilters({ ar_balance: '$50-$99' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles ar_balance filter $0-$49', async () => {
    const res = await callWithFilters({ ar_balance: '$0-$49' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles ar_balance = all (skips branch)', async () => {
    const res = await callWithFilters({ ar_balance: 'all' });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/* ================================================================== */
/*  formatToDollarAbbreviation (exercised through public methods)       */
/* ================================================================== */
describe('formatToDollarAbbreviation (via getRCMSummary)', () => {
  it('formats small amounts as $X.XX', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        current_year_submitted: 0,
        current_year_collections: 0,
        previous_year_submitted: 0,
        previous_year_collections: 0,
        current_year_claims: 0,
        previous_year_claims: 0,
        current_year_gross_production: 500,
        previous_year_gross_production: 0,
      }],
    });
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getRCMSummary(req, res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.grossProduction.total).toBe('$500.00');
  });

  it('formats amounts in thousands as $XK', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        current_year_submitted: 0,
        current_year_collections: 0,
        previous_year_submitted: 0,
        previous_year_collections: 0,
        current_year_claims: 0,
        previous_year_claims: 0,
        current_year_gross_production: 50000,
        previous_year_gross_production: 0,
      }],
    });
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getRCMSummary(req, res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.grossProduction.total).toContain('K');
  });

  it('formats amounts in millions as $XM', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{
        current_year_submitted: 0,
        current_year_collections: 0,
        previous_year_submitted: 0,
        previous_year_collections: 0,
        current_year_claims: 0,
        previous_year_claims: 0,
        current_year_gross_production: 5_000_000,
        previous_year_gross_production: 0,
      }],
    });
    const req = mockReq({ customer_id: '1' });
    const res = mockRes();
    await controller.getRCMSummary(req, res);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.grossProduction.total).toContain('M');
  });
});
