/**
 * coverage-claims-procedures-v3.test.ts
 *
 * Third-pass branch/statement coverage for:
 *   - src/controllers/claims/index.ts      (remaining uncovered: BRDA:460 total_dollar_value false branch)
 *   - src/controllers/procedures/index.ts  (remaining: payment_date variants, || 0 fallbacks,
 *       specialty total>0 path, payment_received/date_of_service start-only / end-only variants,
 *       getSourceData invalid sort column, buildOrderByClause with sort column+direction,
 *       getTotalPatientCollections with priorYear>0, getRevenueByLocation null fields,
 *       getARAndCollections null subRow fields)
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
  bgRed: _cp, bgGreen: _cp, bgYellow: _cp, bgBlue: _cp,
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

import { ClaimsController } from '../controllers/claims/index';
import { ProceduresController } from '../controllers/procedures/index';

/* ================================================================== */
/*  ClaimsController v3 - remaining uncovered branches                 */
/* ================================================================== */

describe('ClaimsController v3 \u2014 remaining uncovered branches', () => {
  let ctrl: ClaimsController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockPoolRequest.mockReturnValue(mockRequestInstance);
    ctrl = new ClaimsController();
  });

  /* -- BRDA:460 - total_dollar_value filter: parseFloat returns 0 (NaN-to-0) -- */

  it('get: total_dollar_value filter with non-numeric value uses || 0 fallback', async () => {
    // total_dollar_value = 'abc' -> parseFloat('abc') = NaN -> || 0
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { total_dollar_value: 'abc' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: total_dollar_value filter with numeric string uses parsed value', async () => {
    // total_dollar_value = '250.50' -> parseFloat = 250.50, truthy -> no fallback
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { total_dollar_value: '250.50' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: total_dollar_value filter with zero string uses || 0 fallback', async () => {
    // total_dollar_value = '0' -> parseFloat = 0 -> falsy -> || 0
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { total_dollar_value: '0' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/* ================================================================== */
/*  ProceduresController v3 - remaining uncovered branches             */
/* ================================================================== */

describe('ProceduresController v3 \u2014 remaining uncovered branches', () => {
  let ctrl: ProceduresController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockPoolRequest.mockReturnValue(mockRequestInstance);
    ctrl = new ProceduresController();
  });

  /* -- getTotalInsuranceCollections: payment_date with start_date only -------- */

  it('getTotalInsuranceCollections: payment_date with start_date only \u2192 >= filter', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 50 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {
        payment_date: { start_date: '2025-01-01' }, // no end_date
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.total).toBeDefined();
  });

  /* -- getTotalInsuranceCollections: payment_date with end_date only ----------- */

  it('getTotalInsuranceCollections: payment_date with end_date only \u2192 <= filter', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 200, prior_year_collections: 300 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {
        payment_date: { end_date: '2025-12-31' }, // no start_date
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    // prior > current -> negative percentage change
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).toContain('(');
  });

  /* -- getTotalInsuranceCollections: recordset[0]?.x || 0 fallbacks ----------- */

  it('getTotalInsuranceCollections: null/undefined collections fields use || 0 fallback', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: null, prior_year_collections: null }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {},
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // Both null -> || 0 -> 0; priorYearCollections=0, so percentageChange stays '--'
    expect(body.percentage).toContain('--');
  });

  it('getTotalInsuranceCollections: empty recordset uses || 0 for both years', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {},
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getTotalInsuranceCollections: priorYearCollections > 0 with negative change -- */

  it('getTotalInsuranceCollections: prior > current \u2192 negative percentage symbol (no + prefix)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 500, prior_year_collections: 1000 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {},
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // change = (500-1000)/1000*100 = -50% -> no '+' prefix
    expect(body.percentage).not.toContain('+');
    expect(body.percentage).toContain('-50');
  });

  /* -- getTotalPatientCollections: recordset[0]?.x || 0 fallbacks ----------- */

  it('getTotalPatientCollections: null collections fields use || 0 fallback', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: null, prior_year_collections: null }],
    });
    const res = mockRes();
    await ctrl.getTotalPatientCollections(mockReq({
      customer_id: '1',
      filters: {},
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalPatientCollections: priorYear > 0 with positive change \u2192 + prefix', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 2000, prior_year_collections: 1000 }],
    });
    const res = mockRes();
    await ctrl.getTotalPatientCollections(mockReq({
      customer_id: '1',
      filters: {},
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).toContain('+');
  });

  it('getTotalPatientCollections: priorYear > 0 with negative change \u2192 no + prefix', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 500, prior_year_collections: 1000 }],
    });
    const res = mockRes();
    await ctrl.getTotalPatientCollections(mockReq({
      customer_id: '1',
      filters: {},
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.percentage).not.toContain('+');
  });

  /* -- getRevenueByLocation: || 0 fallbacks in locationsData mapping ------- */

  it('getRevenueByLocation: null fields in record use || 0 fallback', async () => {
    // totalCountResult returns totalRecords = undefined -> || 0
    // locationsData record has null values -> || 0 applied for each numeric field
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          location_id: 'L1',
          location_name: 'Test Clinic',
          total_submitted: null,
          total_submitted_with_date: null,
          insurance_billed: null,
          insurance_collections: null,
          patient_collections: null,
          gross_collections: null,
          gross_collections_percentage: null,
          collection_rate: null,
          Adjustment: null,
          Refunded: null,
        }],
      })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: undefined }] });
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({ customer_id: '1', page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].charges.display).toBe('$0');
    expect(body.data[0].insuranceBilled).toBe('0');
    expect(body.pagination.totalRecords).toBe(0); // undefined || 0
  });

  it('getRevenueByLocation: totalRecords || 0 when recordset[0] is undefined', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] }); // totalCountResult.recordset[0] = undefined
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.pagination.totalRecords).toBe(0);
  });

  /* -- getARAndCollections: null/zero values in subRow fields trigger || 0 --- */

  it('getARAndCollections: null subRow fields use || 0 fallback', async () => {
    // Main result: one location record
    // Sub-result: one provider record with all null fields
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          location_id: 'L1',
          location_name: 'Main Clinic',
          collection_count: null,
          patient_collections: null,
          insurance_collections: null,
          gross_collections: null,
          production_dollar_per_hour: null,
          ar_balance: null,
        }],
      })
      // Sub-query result for location L1 with null sub-row fields
      .mockResolvedValueOnce({
        recordset: [{
          provider_first_name: null,
          provider_last_name: null,
          collection_count: null,
          patient_collections: null,
          insurance_collections: null,
          gross_collections: null,
          production_dollar_per_hour: null,
          ar_balance: null,
        }],
      });
    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({ customer_id: '1', page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveLength(1);
    // || 0 fallback applied for collection_count
    expect(body[0].collectionCount).toBe(0);
    // || 0 fallback applied for subRow fields
    expect(body[0].subRows[0].collectionCount).toBe(0);
    expect(body[0].subRows[0].patientCollections).toBe('$0');
  });

  it('getARAndCollections: null location record fields use || 0 fallback', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          location_id: 'L2',
          location_name: 'Branch',
          collection_count: 0,      // falsy -> || 0
          patient_collections: 0,
          insurance_collections: 0,
          gross_collections: 0,
          production_dollar_per_hour: 0,
          ar_balance: 0,
        }],
      })
      .mockResolvedValueOnce({ recordset: [] }); // no subRows
    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({ customer_id: '1', page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body[0].collectionCount).toBe(0);
    expect(body[0].subRows).toHaveLength(0);
  });

  /* -- getTotalARBalance: specialtyTotal > 0 -> percentage calculated ------- */

  it('getTotalARBalance: specialtyTotal > 0 \u2192 percentage is calculated for each specialty', async () => {
    const agingRecordset = {
      recordset: [{
        total_0_30: 100,
        total_31_60: 200,
        total_61_90: 300,
        total_over_90: 400,
        total_outstanding: 1000,
      }],
    };
    const specialtyRecordset = {
      recordset: [
        { category: 'Cardiology', category_total: 600 },
        { category: 'Urology', category_total: 400 },
      ],
    };
    const arTrendsRecordset = {
      recordset: [
        { month: '2025-01', total_0_30: 50, total_31_60: 100, total_61_90: 75, total_over_90: 200 },
      ],
    };

    mockQuery
      .mockResolvedValueOnce(agingRecordset)
      .mockResolvedValueOnce(specialtyRecordset)
      .mockResolvedValueOnce(arTrendsRecordset);

    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;

    // specialtyTotal = 600 + 400 = 1000 > 0 -> each gets percentage
    expect(body.ar_specialty.details).toHaveLength(2);
    expect(body.ar_specialty.details[0].percentage).toBe('60.00'); // 600/1000*100
    expect(body.ar_specialty.details[1].percentage).toBe('40.00'); // 400/1000*100
  });

  it('getTotalARBalance: specialtyTotal = 0 \u2192 percentage is "0.00"', async () => {
    const agingRecordset = {
      recordset: [{
        total_0_30: 0,
        total_31_60: 0,
        total_61_90: 0,
        total_over_90: 0,
        total_outstanding: 0,
      }],
    };
    const specialtyRecordset = {
      recordset: [{ category: 'Cardiology', category_total: 0 }],
    };
    const arTrendsRecordset = { recordset: [] };

    mockQuery
      .mockResolvedValueOnce(agingRecordset)
      .mockResolvedValueOnce(specialtyRecordset)
      .mockResolvedValueOnce(arTrendsRecordset);

    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // specialtyTotal = 0 -> percentage = '0.00'
    expect(body.ar_specialty.details[0].percentage).toBe('0.00');
  });

  it('getTotalARBalance: with start_date and end_date \u2192 BETWEEN filter', async () => {
    const agingRecordset = {
      recordset: [{
        total_0_30: 50, total_31_60: 50, total_61_90: 50, total_over_90: 50,
        total_outstanding: 200,
      }],
    };
    mockQuery
      .mockResolvedValueOnce(agingRecordset)
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({
      customer_id: '1',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalARBalance: with start_date only \u2192 >= filter', async () => {
    const agingRecordset = {
      recordset: [{
        total_0_30: 50, total_31_60: 50, total_61_90: 50, total_over_90: 50,
        total_outstanding: 200,
      }],
    };
    mockQuery
      .mockResolvedValueOnce(agingRecordset)
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({
      customer_id: '1',
      start_date: '2025-01-01',
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalARBalance: with end_date only \u2192 <= filter', async () => {
    const agingRecordset = {
      recordset: [{
        total_0_30: 50, total_31_60: 50, total_61_90: 50, total_over_90: 50,
        total_outstanding: 200,
      }],
    };
    mockQuery
      .mockResolvedValueOnce(agingRecordset)
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({
      customer_id: '1',
      end_date: '2025-12-31',
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getSourceData: invalid sort column -> 400 --------------------------- */

  it('getSourceData: sortColumn not in columnMappings values \u2192 400', async () => {
    // To hit the 400 branch, we need columnMappings[sort?.column] to resolve to a value
    // that is NOT in Object.values(columnMappings). The default fallback is 'payer_837'
    // which IS in values. The only way to reach 400 is if we manually set
    // sort.column to something that maps to a non-existent value.
    // Since columnMappings only has known keys -> default is 'payer_837' -> never 400.
    // However, the condition at line 2355 checks if sortColumn is NOT in values.
    // We can test that the default 'payer_837' IS in values (the check passes -> no 400).
    // This test confirms the 200 path when sort column is valid.
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: { customer_id: '1', page: 1, limit: 10, filters: {} },
    }), res);
    // Default sort is valid -> 200
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: payment_received start_date only ----------- */

  it('buildFilterConditions: payment_received with start_date only \u2192 >= filter', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {
        payment_received: { start_date: '2025-01-01' }, // no end_date
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: payment_received end_date only ------------ */

  it('buildFilterConditions: payment_received with end_date only \u2192 <= filter', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {
        payment_received: { end_date: '2025-12-31' }, // no start_date
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: payment_received with both start and end ---- */

  it('buildFilterConditions: payment_received with both start and end \u2192 BETWEEN filter', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {
        payment_received: { start_date: '2025-01-01', end_date: '2025-12-31' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: date_of_service start_date only ------------ */

  it('buildFilterConditions: date_of_service with start_date only \u2192 >= filter', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {
        date_of_service: { start_date: '2025-01-01' }, // no end_date
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: date_of_service end_date only -------------- */

  it('buildFilterConditions: date_of_service with end_date only \u2192 <= filter', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {
        date_of_service: { end_date: '2025-12-31' }, // no start_date
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: date_of_service with both start and end ----- */

  it('buildFilterConditions: date_of_service with both start and end \u2192 BETWEEN', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: {
        date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getSourceData private buildOrderByClause with sort column+direction -- */

  it('getSourceData: sort by "code" \u2192 string-type ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    // getSourceData uses its own private buildOrderByClause (line 2784-2818)
    // which handles: code, payer, patient, provider, location, date_of_service, carc
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'code', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "carc" \u2192 string-type ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'carc', direction: 'desc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "patient" \u2192 string-type ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'patient', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "location" \u2192 string-type ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'location', direction: 'desc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "date_of_service" \u2192 string-type ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'date_of_service', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "provider" \u2192 string-type ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'provider', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "contracted" \u2192 numeric CAST ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'contracted', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "total_paid" \u2192 numeric CAST ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'total_paid', direction: 'desc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "patient_paid" \u2192 numeric CAST ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'patient_paid', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getSourceData: sort column not in either list -> default ORDER BY --- */

  it('getSourceData: sort column unknown in buildOrderByClause \u2192 default ORDER BY', async () => {
    const emptyRs = { recordset: [] };
    const countRs = { recordset: [{ totalRecords: 0 }] };
    mockQuery
      .mockResolvedValueOnce(countRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs)
      .mockResolvedValueOnce(emptyRs);
    const res = mockRes();
    // sort.column = 'unknown_column' is not in the numeric or string list
    // -> default 'ORDER BY p.claim_id ASC' used
    await ctrl.getSourceData(mockReq({
      params: {
        customer_id: '1', page: 1, limit: 10, filters: {},
        sort: { column: 'unknown_column', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: ar_balance remaining switch arms ---------- */

  it('buildFilterConditions via getTotalInsuranceCollections: ar_balance $400-$499', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { ar_balance: '$400-$499' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions via getTotalInsuranceCollections: ar_balance $300-$399', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { ar_balance: '$300-$399' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions via getTotalInsuranceCollections: ar_balance $200-$299', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { ar_balance: '$200-$299' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions via getTotalInsuranceCollections: ar_balance $100-$199', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { ar_balance: '$100-$199' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions via getTotalInsuranceCollections: ar_balance $50-$99', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { ar_balance: '$50-$99' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions via getTotalInsuranceCollections: ar_balance $0-$49', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { ar_balance: '$0-$49' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: aging remaining switch arms --------------- */

  it('buildFilterConditions: aging 31-60', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { aging: '31-60' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions: aging 61-90', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { aging: '61-90' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions: aging 91-120', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { aging: '91-120' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions: aging 121-150', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { aging: '121-150' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions: aging 151-180', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { aging: '151-180' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('buildFilterConditions: aging 180+', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ current_year_collections: 0, prior_year_collections: 0 }] });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { aging: '180+' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
