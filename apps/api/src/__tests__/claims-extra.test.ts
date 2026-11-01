/**
 * claims-extra.test.ts
 * Extra coverage for src/controllers/claims/index.ts
 * Targets uncovered branches: updateClaimStatus error, updateUpdatedAt error,
 * anyProceduresHaveCarc, determineNewStatus all branches, sort columns,
 * fetchPayers error, fetchClaims error, multi-location, pagination.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/*  DB mock                                                             */
/* ------------------------------------------------------------------ */
const mockQuery = jest.fn<any>();
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
        close: jest.fn().mockResolvedValue(undefined),
        connected: true,
        connecting: false,
      }),
    }),
  },
}));

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
const mockReq = (body: any = {}, headers: any = {}, params: any = {}, query: any = {}) => ({
  body,
  headers,
  params,
  query,
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

import { ClaimsController } from '../controllers/claims/index';

/* ================================================================== */
/*  ClaimsController - extra coverage                                  */
/* ================================================================== */
describe('ClaimsController (extra coverage)', () => {
  let ctrl: ClaimsController;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new ClaimsController();
  });

  // -- Sort column coverage ------------------------------------------

  it('sorts by patient_last_name asc', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'patient_last_name', direction: 'asc' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sorts by payer desc', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'payer', direction: 'desc' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sorts by date_of_service asc', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'date_of_service', direction: 'asc' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sorts by total_dollar_value asc (uses CAST)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'total_dollar_value', direction: 'asc' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sort with no direction (defaults to ASC)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'status' }, // no direction
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // -- Multiple location IDs ----------------------------------------

  it('handles multiple location_ids', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 5 }] })
      .mockResolvedValueOnce({
        recordset: [
          { uid: 'C1', status: 'Open', updated_at: null },
          { uid: 'C2', status: 'Pending', updated_at: new Date().toISOString() },
        ],
      })
      .mockResolvedValueOnce({ recordset: [{ payer: 'Aetna' }, { payer: 'Blue Cross' }] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10, 20, 30],
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.payers).toHaveLength(2);
  });

  // -- Pagination: page > 1 -----------------------------------------

  it('handles page 2 with correct offset', async () => {
    const claims = Array.from({ length: 15 }, (_, i) => ({
      uid: `C${i}`,
      status: 'Open',
      updated_at: null,
    }));
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 15 }] })
      .mockResolvedValueOnce({ recordset: claims })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      page: 2,
      limit: 10,
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // page 2, limit 10 -> offset 10, so 5 claims remain
    expect(body.pagination.currentPage).toBe(2);
    expect(body.claims).toHaveLength(5);
  });

  // -- Filter: 'all' value skips filter ----------------------------

  it('skips query filter when filters.query is "all"', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { query: 'all', payer: 'all', issue_type: 'all', total_dollar_value: 'all', aging: 'all' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // -- Pending claim: null updated_at within expiry -----------------

  it('treats Pending claim with null updated_at as within expiry', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({
        recordset: [{ uid: 'C1', status: 'Pending', updated_at: null }],
      })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      expired_days: 1,
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // Pending with null updated_at is considered within expiry -> in pendingClaims -> at end
    expect(body.claims).toHaveLength(1);
  });

  // -- updateClaimStatus error path (throw) -------------------------

  it('updateClaimStatusOverAPI returns 500 when updateClaimStatus throws', async () => {
    // First call (SELECT status) throws
    mockQuery.mockRejectedValueOnce(new Error('SQL error in updateClaimStatus'));

    const req = mockReq({ claim_id: 'CL001', status: 'Closed' });
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateClaimStatusOverAPI returns 500 when updateUpdatedAt throws', async () => {
    // SELECT status OK, UPDATE status OK, UPDATE updated_at throws
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ status: 'Open' }] }) // checkStatus SELECT
      .mockResolvedValueOnce({ recordset: [] })                   // UPDATE status
      .mockRejectedValueOnce(new Error('updateUpdatedAt fail'));   // UPDATE updated_at

    const req = mockReq({ claim_id: 'CL001', status: 'Closed' });
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // -- fetchClaims DB error -> 500 -----------------------------------

  it('returns 500 when fetchClaims throws a DB error', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] }) // countFilteredClaims OK
      .mockRejectedValueOnce(new Error('fetchClaims error')); // fetchClaims fails

    const req = mockReq({ customer_id: 1, location_ids: [10] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // -- fetchPayers DB error -> 500 -----------------------------------

  it('returns 500 when fetchPayers throws a DB error', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockRejectedValueOnce(new Error('payers DB error'));

    const req = mockReq({ customer_id: 1, location_ids: [10] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // -- countFilteredClaims: zero total (no results) -----------------

  it('returns 200 with empty claims when total=0', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 0 }] }) // count = 0
      .mockResolvedValueOnce({ recordset: [] })              // fetchClaims empty
      .mockResolvedValueOnce({ recordset: [] });             // payers empty

    const req = mockReq({ customer_id: 1, location_ids: [10] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.claims).toHaveLength(0);
    expect(body.pagination.totalRecords).toBe(0);
  });

  // -- countFilteredClaims: undefined total fallback -----------------

  it('handles undefined total in count result', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{}] }) // no total field -> undefined -> 0
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({ customer_id: 1, location_ids: [10] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // -- archived=1 (show archived) -----------------------------------

  it('retrieves archived claims when archived=1', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 2 }] })
      .mockResolvedValueOnce({
        recordset: [
          { uid: 'C1', status: 'Recovered', archived: 1, updated_at: null },
          { uid: 'C2', status: 'NCOF', archived: 1, updated_at: null },
        ],
      })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      archived: 1,
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.claims).toHaveLength(2);
  });

  // -- expired_days = 0 (edge: 0 * 1440 = 0, fallback to 3 min?) ---

  it('uses 3 minutes as default when expired_days is falsy/undefined', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Pending', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    // No expired_days -> defaults to 3 minutes threshold
    const req = mockReq({ customer_id: 1, location_ids: [10] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // -- Pending claim exactly at expiry: older updated_at but isWithinExpiredDays check -

  it('moves expired pending claim to otherClaims (updated_at older than threshold)', async () => {
    // updated_at is 2 full days old, expired_days=1 -> isWithinExpiredDays = false
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 2 }] })
      .mockResolvedValueOnce({
        recordset: [
          { uid: 'C1', status: 'Pending', updated_at: twoDaysAgo },
          { uid: 'C2', status: 'Open', updated_at: null },
        ],
      })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      expired_days: 1, // 1 day threshold
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // Both go to otherClaims since 'C1' is expired, 'C2' is not pending
    expect(body.claims).toHaveLength(2);
  });

  // -- updateClaimStatus: public method via updateClaimStatusOverAPI -

  it('updateClaimStatusOverAPI updates status and updated_at on success', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ status: 'Open' }] }) // SELECT status
      .mockResolvedValueOnce({ recordset: [] })                   // UPDATE status
      .mockResolvedValueOnce({ recordset: [] });                  // UPDATE updated_at

    const req = mockReq({ claim_id: 'CL999', status: 'Recovered' });
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Claim status updated successfully' });
  });

  // -- handleError: message undefined edge case ---------------------

  it('returns 500 with generic message when error has no message property', async () => {
    // Throw a non-Error object
    mockQuery.mockRejectedValueOnce({ code: 'TIMEOUT' });

    const req = mockReq({ customer_id: 1, location_ids: [10] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
  });
});
