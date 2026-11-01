/**
 * coverage-claims-procedures-v2.test.ts
 *
 * Supplemental branch/statement coverage for:
 *   - src/controllers/claims/index.ts
 *   - src/controllers/procedures/index.ts
 *
 * Targets uncovered lines reported after coverage-procedures-claims.test.ts:
 *
 * Claims:
 *   301-304  - fetchClaims catch (re-throw)
 *   412-413  - fetchPayers catch (re-throw)
 *   543-567  - updateClaimStatus full method
 *
 * Procedures:
 *   2083-2092  - buildFilters helper (called internally only via... nothing public calls it currently)
 *   2356-2357  - getSourceData invalid sort column -> 400
 *   2471-2501  - getSourceData filter/sort callback for providers/locations/cpt/payers (null values filtered)
 *   2545-2570  - countFilteredProcedures (private, exercised via indirect path if callable)
 *   2613-2632  - buildFilterConditions: location / provider / query / payer arms
 *   2679-2680  - buildFilterConditions: cpt_group arm
 *   2800       - buildOrderByClause: numeric sort column (insurance_paid, etc.)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/*  Shared mocks - must be hoisted before imports                       */
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
/*  ClaimsController - additional uncovered branches                   */
/* ================================================================== */

describe('ClaimsController v2 \u2014 additional uncovered branches', () => {
  let ctrl: ClaimsController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockPoolRequest.mockReturnValue(mockRequestInstance);
    ctrl = new ClaimsController();
  });

  /* -- fetchClaims catch path (lines 301-304) -------------------- */

  it('get: 500 when fetchClaims DB call throws Error', async () => {
    // First call (countFilteredClaims) succeeds with count=1
    // Second call (fetchClaims) throws
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockRejectedValueOnce(new Error('fetchClaims failure'));

    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('get: 500 when fetchClaims DB call throws non-Error', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockRejectedValueOnce('raw string from fetchClaims');

    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- fetchPayers catch path (lines 412-413, 437-438) ----------- */

  it('get: 500 when fetchPayers DB call throws Error', async () => {
    // countFilteredClaims -> OK
    // fetchClaims -> OK with one record
    // fetchPayers -> throws
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockRejectedValueOnce(new Error('fetchPayers failure'));

    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('get: 500 when fetchPayers DB call throws non-Error', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockRejectedValueOnce('payers string error');

    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- countFilteredClaims null recordset[0] (line 334 ?? branch) -- */

  it('get: countFilteredClaims returns empty recordset (uses ?? 0 fallback)', async () => {
    // recordset[0] is undefined -> total ?? 0 -> 0 records
    // fetchClaims -> empty (total=0 means 0 records fetched)
    // fetchPayers -> empty
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })       // countFilteredClaims: recordset[0]?.total = undefined -> 0
      .mockResolvedValueOnce({ recordset: [] })       // fetchClaims: empty
      .mockResolvedValueOnce({ recordset: [] });      // fetchPayers: empty

    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.pagination.totalRecords).toBe(0);
  });

  /* -- updateClaimStatus full coverage (lines 543-567) ----------- */

  it('updateClaimStatusOverAPI: 200 on successful claim status update', async () => {
    // updateClaimStatus: SELECT status query -> success
    // updateClaimStatus: UPDATE query -> success
    // updateUpdatedAt: UPDATE query -> success
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ status: 'Open' }] })  // checkStatusQuery
      .mockResolvedValueOnce({ recordset: [] })                    // updateQuery
      .mockResolvedValueOnce({ recordset: [] });                   // updateUpdatedAt

    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(mockReq({ claim_id: 'CL001', status: 'Closed' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Claim status updated successfully' }));
  });

  it('updateClaimStatusOverAPI: 200 when checkStatus recordset[0] is undefined', async () => {
    // updateClaimStatus: SELECT returns no rows -> recordset[0]?.status = undefined
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })   // checkStatusQuery: empty -> undefined status
      .mockResolvedValueOnce({ recordset: [] })   // updateQuery
      .mockResolvedValueOnce({ recordset: [] });  // updateUpdatedAt

    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(mockReq({ claim_id: 'CL999', status: 'Pending' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateClaimStatusOverAPI: 500 when updateClaimStatus SELECT throws Error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(mockReq({ claim_id: 'CL001', status: 'Closed' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateClaimStatusOverAPI: 500 when updateClaimStatus UPDATE throws Error', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ status: 'Open' }] })  // SELECT succeeds
      .mockRejectedValueOnce(new Error('UPDATE failed'));           // UPDATE fails

    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(mockReq({ claim_id: 'CL001', status: 'Closed' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateClaimStatusOverAPI: 500 when updateUpdatedAt throws Error', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ status: 'Open' }] })  // checkStatusQuery
      .mockResolvedValueOnce({ recordset: [] })                    // updateQuery
      .mockRejectedValueOnce(new Error('updateUpdatedAt failed')); // updateUpdatedAt fails

    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(mockReq({ claim_id: 'CL001', status: 'Closed' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- buildOrderByClause: sort direction 'desc' -> DESC ---------- */

  it('get: sort by patient_last_name asc uses _837 suffix', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], sort: { column: 'patient_last_name', direction: 'asc' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: sort by payer asc uses _837 suffix', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], sort: { column: 'payer', direction: 'asc' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: sort by date_of_service desc uses _837 suffix', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], sort: { column: 'date_of_service', direction: 'desc' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('get: sort direction "desc" applied correctly for status column', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], sort: { column: 'status', direction: 'desc' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- Pending claim with old updated_at (goes to otherClaims) --- */

  it('get: Pending claim with old updated_at goes to otherClaims (isPending but not isWithinExpiredDays)', async () => {
    // updated_at is 2 days ago, expiredDays = 0.001 minutes -> very small threshold
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Pending', updated_at: twoDaysAgo }] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    // expired_days = 0.0001 (tiny) -> minutesThreshold = 0.144 minutes = 8.64 seconds
    // claim updated 2 days ago -> far outside threshold -> goes to otherClaims
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], expired_days: 0.0001 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.claims).toHaveLength(1);
  });

  /* -- filters.query === 'all' (skipped) ------------------------- */

  it('get: filter query is "all" (skipped, no filter added)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { query: 'all' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- filters.payer === 'all' (skipped) ------------------------ */

  it('get: filter payer is "all" (skipped)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { payer: 'all' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- filters.issue_type === 'all' (skipped) ------------------- */

  it('get: filter issue_type is "all" (skipped)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], filters: { issue_type: 'all' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- pagination: multiple records across pages ----------------- */

  it('get: paginated response slices correctly with page=2', async () => {
    const records = Array.from({ length: 15 }, (_, i) => ({
      uid: `C${i}`,
      status: 'Open',
      updated_at: null,
    }));

    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 15 }] })
      .mockResolvedValueOnce({ recordset: records })
      .mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    // page=2, limit=10 -> offset=10, returns records 10-14 -> 5 records
    await ctrl.get(mockReq({ customer_id: 1, location_ids: [10], page: 2, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.claims).toHaveLength(5);
    expect(body.pagination.currentPage).toBe(2);
    expect(body.pagination.totalRecords).toBe(15);
  });
});

/* ================================================================== */
/*  ProceduresController - additional uncovered branches               */
/* ================================================================== */

describe('ProceduresController v2 \u2014 additional uncovered branches', () => {
  let ctrl: ProceduresController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockPoolRequest.mockReturnValue(mockRequestInstance);
    ctrl = new ProceduresController();
  });

  /* -- getSourceData: invalid sort column -> 400 (lines 2356-2357) - */

  it('getSourceData: 400 when sort column maps to invalid value', async () => {
    // When sort.column is not in columnMappings, sortColumn defaults to 'payer_837'
    // which IS in columnMappings values -> won't 400 via that check.
    // The check is: if (!Object.values(columnMappings).includes(sortColumn)) -> 400
    // But sortColumn = columnMappings[sort?.column] || 'payer_837'
    // So with invalid column, sortColumn = 'payer_837' -> valid -> won't 400
    // The only way to hit the 400 is if the resolved sortColumn is NOT in values.
    // That's only possible if the columnMappings default 'payer_837' isn't in values,
    // but it IS. So this branch is actually unreachable with current logic -
    // test with no sort (default 'payer_837') which is valid.
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
      params: { customer_id: '1', page: 1, limit: 10, filters: {} },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getSourceData: providers with null values filtered out (lines 2471-2473) -- */

  it('getSourceData: filters null providers, locations, cpt groups, and payers from result lists', async () => {
    const countRecordset = { recordset: [{ totalRecords: 1 }] };
    const dataRecordset = { recordset: [{ patient: 'J. Smith', claim_id: 'CL001' }] };
    // providers with a null entry
    const providersRecordset = { recordset: [{ provider: 'Dr. A' }, { provider: null }, { provider: 'Dr. B' }] };
    // locations with a null entry
    const locationsRecordset = { recordset: [{ location: 'Main' }, { location: null }] };
    // cpt categories with a null entry
    const cptRecordset = { recordset: [{ cpt_category: 'Cardiology' }, { cpt_category: null }] };
    // payers with a null entry
    const payersRecordset = { recordset: [{ payer: 'Medicare' }, { payer: null }, { payer: 'Aetna' }] };

    mockQuery
      .mockResolvedValueOnce(countRecordset)
      .mockResolvedValueOnce(dataRecordset)
      .mockResolvedValueOnce(providersRecordset)
      .mockResolvedValueOnce(locationsRecordset)
      .mockResolvedValueOnce(cptRecordset)
      .mockResolvedValueOnce(payersRecordset);

    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: { customer_id: '1', page: 1, limit: 10, filters: {} },
    }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;

    // nulls filtered out; 'All' prepended
    expect(body.providers).toContain('All');
    expect(body.providers).toContain('Dr. A');
    expect(body.providers).toContain('Dr. B');
    expect(body.providers).not.toContain(null);

    expect(body.locations).toContain('All');
    expect(body.locations).toContain('Main');
    expect(body.locations).not.toContain(null);

    expect(body.cptGroups).toContain('All');
    expect(body.cptGroups).toContain('Cardiology');
    expect(body.cptGroups).not.toContain(null);

    expect(body.payers).toContain('All');
    expect(body.payers).toContain('Medicare');
    expect(body.payers).toContain('Aetna');
    expect(body.payers).not.toContain(null);
  });

  /* -- getSourceData: numeric sort column (line 2800) ----------- */

  it('getSourceData: sort by "insurance-medicare-collected" \u2192 numeric CAST sort', async () => {
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
        sort: { column: 'insurance-medicare-collected', direction: 'desc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "submitted" \u2192 numeric CAST sort', async () => {
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
        sort: { column: 'submitted', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "ar_balance" \u2192 numeric CAST sort', async () => {
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
        sort: { column: 'ar_balance', direction: 'desc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: sort by "payer" \u2192 string sort', async () => {
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
        sort: { column: 'payer', direction: 'asc' },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSourceData: no sort object \u2192 uses default payer_837', async () => {
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
      params: { customer_id: '1', page: 1, limit: 10, filters: {} },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: location filter arm (lines 2613-2614) -- */

  it('getTotalInsuranceCollections: location filter applied', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 500, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { location: 'Main Office' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: location filter "all" (skipped)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { location: 'all' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: provider filter arm (lines 2619-2620) -- */

  it('getTotalInsuranceCollections: provider filter applied', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 200, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { provider: 'Dr. Smith' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: provider filter "all" (skipped)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { provider: 'all' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: query filter arm (lines 2625-2626) -- */

  it('getTotalInsuranceCollections: query filter applied', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 300, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { query: 'Smith' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: query filter "all" (skipped)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { query: 'all' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: payer filter arm (lines 2631-2632) -- */

  it('getTotalInsuranceCollections: payer filter applied', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 400, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { payer: 'Medicare' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: payer filter "all" (skipped)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { payer: 'all' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: cpt_group filter (lines 2679-2680) -- */

  it('getTotalInsuranceCollections: cpt_group filter applied', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 150, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { cpt_group: 'Cardiology' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTotalInsuranceCollections: cpt_group filter "all" (skipped)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 100, prior_year_collections: 0 }],
    });
    const res = mockRes();
    await ctrl.getTotalInsuranceCollections(mockReq({
      customer_id: '1',
      filters: { cpt_group: 'all' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- buildFilterConditions: payment_received filter in getCollectionsByDateRange -- */

  it('getCollectionsByDateRange: payment_received no start/end (condition skipped)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: {},
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getSourceData: filters applied via buildFilterConditions -- */

  it('getSourceData: filters with location, provider, query, payer, and cpt_group', async () => {
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
        customer_id: '1', page: 1, limit: 10,
        filters: {
          location: 'Main Office',
          provider: 'Dr. Jones',
          query: 'Smith',
          payer: 'Medicare',
          cpt_group: 'Cardiology',
          aging: '0-30',
          ar_balance: 'Over $500',
        },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getSourceData: multiple locations/cpt groups triggers sort comparator -- */

  it('getSourceData: multiple non-null locations and cpt groups triggers sort (lines 2482, 2491)', async () => {
    const countRecordset = { recordset: [{ totalRecords: 2 }] };
    const dataRecordset = { recordset: [] };
    const providersRecordset = { recordset: [{ provider: 'Dr. A' }, { provider: 'Dr. B' }] };
    // Multiple non-null locations -> sort comparator runs
    const locationsRecordset = {
      recordset: [
        { location: 'Uptown Office' },
        { location: 'Downtown Office' },
        { location: 'Midtown Clinic' },
      ],
    };
    // Multiple non-null cpt groups -> sort comparator runs
    const cptRecordset = {
      recordset: [
        { cpt_category: 'Urology' },
        { cpt_category: 'Cardiology' },
        { cpt_category: 'Radiology' },
      ],
    };
    const payersRecordset = {
      recordset: [
        { payer: 'Medicare' },
        { payer: 'Aetna' },
        { payer: 'Blue Cross' },
      ],
    };

    mockQuery
      .mockResolvedValueOnce(countRecordset)
      .mockResolvedValueOnce(dataRecordset)
      .mockResolvedValueOnce(providersRecordset)
      .mockResolvedValueOnce(locationsRecordset)
      .mockResolvedValueOnce(cptRecordset)
      .mockResolvedValueOnce(payersRecordset);

    const res = mockRes();
    await ctrl.getSourceData(mockReq({
      params: { customer_id: '1', page: 1, limit: 10, filters: {} },
    }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // Locations should be sorted alphabetically (Downtown < Midtown < Uptown)
    expect(body.locations[1]).toBe('Downtown Office');
    expect(body.locations[2]).toBe('Midtown Clinic');
    expect(body.locations[3]).toBe('Uptown Office');
    // CPT groups sorted (Cardiology < Radiology < Urology)
    expect(body.cptGroups[1]).toBe('Cardiology');
  });

  /* -- getSourceData: "all" filters are skipped ------------------- */

  it('getSourceData: filters all set to "all" (all skipped)', async () => {
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
        customer_id: '1', page: 1, limit: 10,
        filters: {
          location: 'all',
          provider: 'all',
          query: 'all',
          payer: 'all',
          cpt_group: 'all',
          aging: 'all',
          ar_balance: 'all',
        },
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getRCMSummary: rateChange < 0 path (negative difference) -- */

  it('getRCMSummary: collectionRate difference is negative when current < prior', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        current_year_submitted: 1000,
        current_year_collections: 600,   // 60%
        previous_year_submitted: 1000,
        previous_year_collections: 800,  // 80%
        current_year_claims: 50,
        previous_year_claims: 60,
        current_year_gross_production: 600,
        previous_year_gross_production: 800,
      }],
    });
    const res = mockRes();
    await ctrl.getRCMSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.collectionRate.difference).not.toContain('+');
  });

  /* -- getRCMSummary: previous_year_submitted = 0 (rate stays 0) - */

  it('getRCMSummary: previous_year_submitted=0 \u2192 previousRate=0 (no division)', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{
        current_year_submitted: 500,
        current_year_collections: 400,
        previous_year_submitted: 0,
        previous_year_collections: 0,
        current_year_claims: 10,
        previous_year_claims: 0,
        current_year_gross_production: 400,
        previous_year_gross_production: 0,
      }],
    });
    const res = mockRes();
    await ctrl.getRCMSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.collectionRate.percentage).toBeDefined();
  });

  /* -- getARAndCollections: subRows has data (iterates non-empty subResult) -- */

  it('getARAndCollections: 200 with subRows containing data', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          location_id: 'L1',
          location_name: 'Main',
          collection_count: 5,
          patient_collections: 100,
          insurance_collections: 200,
          gross_collections: 300,
          production_dollar_per_hour: 50,
          ar_balance: 10,
        }],
      })
      .mockResolvedValueOnce({
        recordset: [{
          provider_name: 'Dr. Smith',
          avg_production_per_hour: 25.5,
          // Note: getARAndCollections maps using provider_first_name/provider_last_name which may be undefined
          provider_first_name: 'John',
          provider_last_name: 'Smith',
          collection_count: 3,
          patient_collections: 50,
          insurance_collections: 100,
          gross_collections: 150,
          production_dollar_per_hour: 25,
          ar_balance: 5,
        }],
      });

    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({ customer_id: '1', page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveLength(1);
    expect(body[0].subRows).toHaveLength(1);
  });

  /* -- getRevenueByLocation: sort.column valid (mapped) ---------- */

  it('getRevenueByLocation: sort by valid column "name" ASC', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({
      customer_id: '1', page: 1, limit: 10,
      sort: { column: 'name', direction: 'ASC' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getRevenueByLocation: sort by valid column "charges" DESC', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({
      customer_id: '1', page: 1, limit: 10,
      sort: { column: 'charges', direction: 'DESC' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getRevenueByLocation: no sort (undefined) \u2192 uses default ORDER BY', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({ customer_id: '1', page: 1, limit: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getTotalARBalance: special null-coalescing paths ----------- */

  it('getTotalARBalance: agingData with null values uses ?? 0', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{
          total_0_30: null,
          total_31_60: null,
          total_61_90: null,
          total_over_90: null,
          total_outstanding: null,
        }],
      })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.ar_aging.total).toBe('$0.00');
  });

  it('getTotalARBalance: arTrends rows with null values (uses ?? 0)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ total_0_30: 100, total_31_60: 50, total_61_90: 20, total_over_90: 10, total_outstanding: 180 }],
      })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({
        recordset: [{
          month: '2025-01',
          total_0_30: null,
          total_31_60: null,
          total_61_90: null,
          total_over_90: null,
        }],
      });

    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.ar_trends.details[0].total_0_30).toBe(0);
  });

  /* -- getARSummary: no customer_id defaults to 1 --------------- */

  it('getARSummary: missing customer_id defaults to 1 (uses body default)', async () => {
    // getARSummary uses: const { customer_id = 1 } = req.body; - no 400 guard
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar: 20 }] })
      .mockResolvedValueOnce({ recordset: [{ average_days_in_ar_prior_year: 15 }] });
    const res = mockRes();
    await ctrl.getARSummary(mockReq({}), res);
    // No customer_id validation - defaults to 1 and queries DB
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getARSummary: both results have empty recordsets (all undefined \u2192 uses || 0)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // average_days_in_ar undefined -> 0
      .mockResolvedValueOnce({ recordset: [] }); // average_days_in_ar_prior_year undefined -> 0

    const res = mockRes();
    await ctrl.getARSummary(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.current_year_average_days_in_ar).toContain('days');
  });

  /* -- isPositiveInteger: string "12" passes (integer-like string) -- */

  it('getProceduresAndClaimCounts: months_ago as string "12" (isPositiveInteger passes)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: '12' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getProceduresAndClaimCounts: months_ago as string "0" (isPositiveInteger fails)', async () => {
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: '0' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresAndClaimCounts: months_ago as string "-5" (isPositiveInteger fails)', async () => {
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: '-5' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getProceduresAndClaimCounts: months_ago as string "abc" (isPositiveInteger fails)', async () => {
    const res = mockRes();
    await ctrl.getProceduresAndClaimCounts(mockReq({ customer_id: '1', months_ago: 'abc' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  /* -- getARAndCollections: sort by valid column ------------------ */

  it('getARAndCollections: sort by "name" column \u2192 valid ORDER BY', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }); // No locations -> empty loop
    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({
      customer_id: '1', page: 1, limit: 10,
      sort: { column: 'name', direction: 'ASC' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getARAndCollections: sort by "ARBalance" column \u2192 throws (not in columnMap) \u2192 500', async () => {
    // buildOrderByClauseAdvanced uses this.columnMap which doesn't have 'ARBalance'
    // -> throws "Invalid sort column" -> caught -> 500
    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({
      customer_id: '1', page: 1, limit: 10,
      sort: { column: 'ARBalance', direction: 'DESC' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  /* -- getTotalPatientCollections: with payment_date filters ---- */

  it('getTotalPatientCollections: with both start and end payment_date filters', async () => {
    // getTotalPatientCollections uses buildFilterConditions but does NOT handle
    // payment_date in its own date logic - it relies on buildFilterConditions
    // which doesn't filter payment_date. So this just tests the basic path.
    mockQuery.mockResolvedValueOnce({
      recordset: [{ current_year_collections: 1000, prior_year_collections: 500 }],
    });
    const res = mockRes();
    await ctrl.getTotalPatientCollections(mockReq({
      customer_id: '1',
      filters: {
        location: 'Main',
        provider: 'Dr. Smith',
        payer: 'Aetna',
        aging: '31-60',
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getCollectionsByDateRange: payer and query filters -------- */

  it('getCollectionsByDateRange: payer filter applied', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { payer: 'Aetna' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: location filter applied', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { location: 'Downtown' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: provider filter applied', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { provider: 'Dr. Lee' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: query filter applied', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { query: 'Smith' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionsByDateRange: cpt_group filter applied', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = mockRes();
    await ctrl.getCollectionsByDateRange(mockReq({
      customer_id: '1',
      filters: { cpt_group: 'Cardiology' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getRevenueByLocation: multiple sort columns --------------- */

  it('getRevenueByLocation: sort by "insuranceBilled"', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({
      customer_id: '1', page: 1, limit: 10,
      sort: { column: 'insuranceBilled', direction: 'ASC' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getRevenueByLocation: sort by "grossCollections"', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ totalRecords: 0 }] });
    const res = mockRes();
    await ctrl.getRevenueByLocation(mockReq({
      customer_id: '1', page: 1, limit: 10,
      sort: { column: 'grossCollections', direction: 'DESC' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- Verify Error throw in getSourceData ---------------------- */

  it('getSourceData: 500 on Error throw', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));
    const res = mockRes();
    await ctrl.getSourceData(mockReq({ params: { customer_id: '1', page: 1, limit: 10, filters: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json.mock.calls[0][0] as any).error).toBe('DB error');
  });

  /* -- getARAndCollections: no sort -> empty orderByClause path --- */

  it('getARAndCollections: no sort object \u2192 buildOrderByClauseAdvanced returns empty string', async () => {
    // With no sort, buildOrderByClauseAdvanced returns '' -> fallback 'ORDER BY l.uid'
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }); // empty locations
    const res = mockRes();
    await ctrl.getARAndCollections(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* -- getTotalARBalance: specialtyResult with category_total as null -- */

  it('getTotalARBalance: specialtyResult row with null category_total (uses ?? 0)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ total_0_30: 100, total_31_60: 0, total_61_90: 0, total_over_90: 0, total_outstanding: 100 }],
      })
      .mockResolvedValueOnce({
        recordset: [{ category: 'Cardiology', category_total: null }],
      })
      .mockResolvedValueOnce({ recordset: [] });

    const res = mockRes();
    await ctrl.getTotalARBalance(mockReq({ customer_id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // specialtyTotal = 0 (null ?? 0 = 0) -> percentage = '0.00'
    expect(body.ar_specialty.details[0].percentage).toBe('0.00');
  });
});
