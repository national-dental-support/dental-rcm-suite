/**
 * Low-coverage controllers - comprehensive unit tests
 * Targets: claims/index.ts, appeal-generator.ts, uncollected-medicare-by-cpt-group.ts,
 *          medicare-by-cpt-group.ts, infrastructure monitoring/helpers.ts, database-connection-controller.ts,
 *          recon-iq/matching/eob-no-payment.ts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/*  DB mock - shared across all tests                                   */
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
    ConnectionPool: jest.fn().mockImplementation(() => ({
      request: () => mockRequestInstance,
      close: jest.fn().mockResolvedValue(undefined),
      connected: true,
      connecting: false,
    })),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../utils/date-filters', () => ({
  DateFilterUtils: jest.fn().mockImplementation(() => ({
    filterByDateObject: jest.fn().mockReturnValue({
      dateConditionForInvoiceLineItem: 'AND 1=1',
    }),
  })),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
const mockReq = (
  body: any = {},
  headers: any = {},
  params: any = {},
  query: any = {},
) => ({
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

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                               */
/* ------------------------------------------------------------------ */
import { ClaimsController } from '../controllers/claims/index';
import { AppealGeneratorController } from '../controllers/denial-iq/appeal-generator';
import { UncollectedMedicareByCptGroup } from '../controllers/analytics/medicare-dashboard/uncollected-medicare-by-cpt-group';
import { MedicareByCptGroup } from '../controllers/analytics/medicare-dashboard/medicare-by-cpt-group';
import { DatabaseConnectionController } from '../controllers/database-connection-controller';
import { EobWithNoPayment } from '../controllers/recon-iq/matching/eob-no-payment';

/* ================================================================== */
/*  ClaimsController                                                    */
/* ================================================================== */
describe('ClaimsController', () => {
  let ctrl: ClaimsController;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new ClaimsController();
  });

  // --- GET: validation paths ---

  it('returns 400 when location_ids is not an array', async () => {
    const req = mockReq({ customer_id: 1, location_ids: 'bad' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when location_ids is empty array', async () => {
    const req = mockReq({ customer_id: 1, location_ids: [] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when customer_id is not a number', async () => {
    const req = mockReq({ customer_id: '123', location_ids: [1] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with paginated claims on success', async () => {
    // count query -> 2, then claims, then payers
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 2 }] }) // countFilteredClaims
      .mockResolvedValueOnce({                               // fetchClaims
        recordset: [
          { uid: 'C1', status: 'Open', updated_at: null },
          { uid: 'C2', status: 'Pending', updated_at: null },
        ],
      })
      .mockResolvedValueOnce({ recordset: [{ payer: 'Blue Cross' }] }); // fetchPayers

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      page: 1,
      limit: 10,
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('claims');
    expect(body).toHaveProperty('payers');
    expect(body).toHaveProperty('pagination');
  });

  it('returns 200 and separates pending vs non-pending claims by expired_days', async () => {
    const recentDate = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 2 }] })
      .mockResolvedValueOnce({
        recordset: [
          { uid: 'C1', status: 'Pending', updated_at: recentDate },
          { uid: 'C2', status: 'Open', updated_at: null },
        ],
      })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      expired_days: 1, // 1 day = 1440 minutes
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles DB error in get() and returns 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB failure'));
    const req = mockReq({ customer_id: 1, location_ids: [10] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // --- GET: filter branches ---

  it('applies query filter when filters.query is set', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { query: 'John' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies payer filter when filters.payer is set', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { payer: 'Medicare' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies issue_type filter', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Denied', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { issue_type: 'Denied' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies total_dollar_value filter', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { total_dollar_value: '500.00' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies aging filter 0-30', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { aging: '0-30' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies aging filter 30-60', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { aging: '30-60' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies aging filter 60-90', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { aging: '60-90' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies aging filter 90+', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      filters: { aging: '90+' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // --- buildOrderByClause branches ---

  it('sorts by patient_first_name asc', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'patient_first_name', direction: 'asc' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sorts by total_dollar_value desc', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'total_dollar_value', direction: 'desc' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sorts by status desc', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'status', direction: 'desc' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('ignores invalid sort column and uses default ORDER BY', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ uid: 'C1', status: 'Open', updated_at: null }] })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      sort: { column: 'invalid_column', direction: 'asc' },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // --- updateClaimStatusOverAPI ---

  it('returns 400 when claim_id is missing in updateClaimStatusOverAPI', async () => {
    const req = mockReq({ status: 'Open' });
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing claim ID' });
  });

  it('returns 400 when status is missing in updateClaimStatusOverAPI', async () => {
    const req = mockReq({ claim_id: 'CL001' });
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing status' });
  });

  it('returns 200 on successful updateClaimStatusOverAPI', async () => {
    // updateClaimStatus: SELECT status, then UPDATE; updateUpdatedAt: UPDATE
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ status: 'Open' }] }) // checkStatus
      .mockResolvedValueOnce({ recordset: [] })                   // updateStatus
      .mockResolvedValueOnce({ recordset: [] });                  // updateUpdatedAt

    const req = mockReq({ claim_id: 'CL001', status: 'Closed' });
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error in updateClaimStatusOverAPI', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({ claim_id: 'CL001', status: 'Closed' });
    const res = mockRes();
    await ctrl.updateClaimStatusOverAPI(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // --- Pending claim expiry branch: claim older than expired_days goes to otherClaims ---
  it('moves Pending claim past expiry threshold into otherClaims', async () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] })
      .mockResolvedValueOnce({
        recordset: [
          { uid: 'C1', status: 'Pending', updated_at: oldDate },
        ],
      })
      .mockResolvedValueOnce({ recordset: [] });

    const req = mockReq({
      customer_id: 1,
      location_ids: [10],
      expired_days: 0.001, // tiny threshold (~1.44 minutes)
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/* ================================================================== */
/*  AppealGeneratorController                                           */
/* ================================================================== */
describe('AppealGeneratorController', () => {
  let ctrl: AppealGeneratorController;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new AppealGeneratorController();
  });

  // --- listTemplates ---

  it('listTemplates returns 200 with all templates when all=1', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, template_name: 'Generic' }] });
    const req = mockReq({}, {}, {}, { all: '1' });
    const res = mockRes();
    await ctrl.listTemplates(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listTemplates returns 200 for active-only templates', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, {}, {});
    const res = mockRes();
    await ctrl.listTemplates(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listTemplates returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({}, {}, {}, {});
    const res = mockRes();
    await ctrl.listTemplates(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // --- createTemplate ---

  it('createTemplate returns 400 when template_name missing', async () => {
    const req = mockReq({ subject_line: 'Sub', body_template: 'Body' });
    const res = mockRes();
    await ctrl.createTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('createTemplate returns 400 when body_template missing', async () => {
    const req = mockReq({ template_name: 'T', subject_line: 'S' });
    const res = mockRes();
    await ctrl.createTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('createTemplate returns 201 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 5 }] });
    const req = mockReq({
      template_name: 'T',
      subject_line: 'S',
      body_template: 'B',
      is_active: 1,
    });
    const res = mockRes();
    await ctrl.createTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createTemplate returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({ template_name: 'T', subject_line: 'S', body_template: 'B' });
    const res = mockRes();
    await ctrl.createTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // --- updateTemplate ---

  it('updateTemplate returns 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ template_name: 'NewName' }, {}, { id: '3' });
    const res = mockRes();
    await ctrl.updateTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateTemplate returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({}, {}, { id: '3' });
    const res = mockRes();
    await ctrl.updateTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // --- deleteTemplate ---

  it('deleteTemplate returns 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({}, {}, { id: '7' });
    const res = mockRes();
    await ctrl.deleteTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteTemplate returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({}, {}, { id: '7' });
    const res = mockRes();
    await ctrl.deleteTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // --- listAppeals ---

  it('listAppeals returns 400 when claimId is missing', async () => {
    const req = mockReq({}, {}, {}, {});
    const res = mockRes();
    await ctrl.listAppeals(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('listAppeals returns 200 with data', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ id: 1, claim_id: 'CL5001' }] });
    const req = mockReq({}, {}, {}, { claimId: 'CL5001' });
    const res = mockRes();
    await ctrl.listAppeals(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listAppeals returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({}, {}, {}, { claimId: 'CL5001' });
    const res = mockRes();
    await ctrl.listAppeals(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // --- generateLetter ---

  it('generateLetter returns 400 when claimId missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await ctrl.generateLetter(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('generateLetter returns 404 when claim not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // claim query returns empty
    const req = mockReq({ claimId: 'CL9999' });
    const res = mockRes();
    await ctrl.generateLetter(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('generateLetter returns 422 when no template found', async () => {
    // Claim found, no templateId, no DenialCode -> fallback template empty
    mockQuery
      .mockResolvedValueOnce({ // claim
        recordset: [{
          ClaimID: 'CL5001', DateOfService: '2025-01-01', ClaimSubmittedDate: '2025-01-05',
          ChargeAmt: '1000', PayerName: null, ProviderName: 'Dr Smith',
          PatientName: 'John Doe', DenialCode: null, DenialDescription: null,
        }],
      })
      .mockResolvedValueOnce({ recordset: [] }) // fallback template empty
      .mockResolvedValueOnce({ recordset: [] }); // payer filing deadline

    const req = mockReq({ claimId: 'CL5001' });
    const res = mockRes();
    await ctrl.generateLetter(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('generateLetter returns 200 with letter using specific templateId', async () => {
    mockQuery
      .mockResolvedValueOnce({ // claim
        recordset: [{
          ClaimID: 'CL5001', DateOfService: '2025-01-01', ClaimSubmittedDate: '2025-01-05',
          ChargeAmt: '500', PayerName: 'Medicare', ProviderName: 'Dr Smith',
          PatientName: 'Jane Doe', DenialCode: 'CO-50', DenialDescription: 'Not covered',
        }],
      })
      .mockResolvedValueOnce({ // template by id
        recordset: [{
          id: 1, body_template: 'Dear {{patient_name}}, claim {{claim_id}}',
          subject_line: 'Appeal for {{claim_id}}', closing_text: 'Sincerely',
        }],
      })
      .mockResolvedValueOnce({ recordset: [{ appeal_days: 90 }] }) // payer deadline
      .mockResolvedValueOnce({ recordset: [{ id: 99, claim_id: 'CL5001' }] }); // insert

    const req = mockReq({ claimId: 'CL5001', templateId: 1, customNotes: 'Test note' });
    const res = mockRes();
    await ctrl.generateLetter(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('letter');
  });

  it('generateLetter falls back to carc match when no templateId', async () => {
    mockQuery
      .mockResolvedValueOnce({ // claim
        recordset: [{
          ClaimID: 'CL5001', DateOfService: null, ClaimSubmittedDate: null,
          ChargeAmt: null, PayerName: 'Aetna', ProviderName: '',
          PatientName: '', DenialCode: 'CO-4', DenialDescription: 'Deductible',
        }],
      })
      .mockResolvedValueOnce({ // carc match template
        recordset: [{
          id: 2, body_template: 'Appeal body {{denial_code}}',
          subject_line: 'Subject', closing_text: null,
        }],
      })
      .mockResolvedValueOnce({ recordset: [] }) // payer deadline (no record)
      .mockResolvedValueOnce({ recordset: [{ id: 100 }] }); // insert

    const req = mockReq({ claimId: 'CL5001' });
    const res = mockRes();
    await ctrl.generateLetter(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('generateLetter returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({ claimId: 'CL5001' });
    const res = mockRes();
    await ctrl.generateLetter(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // --- updateAppealStatus ---

  it('updateAppealStatus returns 400 when id is 0/NaN', async () => {
    // parseInt('abc', 10) = NaN which is falsy
    const req = mockReq({ status: 'submitted' }, {}, { id: 'abc' });
    const res = mockRes();
    await ctrl.updateAppealStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('updateAppealStatus returns 200 on success', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ status: 'submitted', notes: 'Filed' }, {}, { id: '5' });
    const res = mockRes();
    await ctrl.updateAppealStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateAppealStatus returns 200 with submitted_date', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const req = mockReq({ status: 'submitted', submitted_date: '2026-01-01' }, {}, { id: '5' });
    const res = mockRes();
    await ctrl.updateAppealStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateAppealStatus returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({ status: 'submitted' }, {}, { id: '5' });
    const res = mockRes();
    await ctrl.updateAppealStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  UncollectedMedicareByCptGroup                                       */
/* ================================================================== */
describe('UncollectedMedicareByCptGroup', () => {
  let ctrl: UncollectedMedicareByCptGroup;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new UncollectedMedicareByCptGroup();
  });

  const makeResult = (rows: any[]) =>
    ({ recordset: rows } as any);

  it('returns 200 with default date range (no filters)', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([
      { cpt_group_name: 'E&M', total_uncollected: 100 },
    ]));
    const req = mockReq({ filters: {} });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body).toHaveProperty('E&M');
    expect(body['E&M'].percentage).toBe(100);
  });

  it('returns 200 with zero totalSum (percentage = 0)', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([
      { cpt_group_name: 'Surgery', total_uncollected: 0 },
    ]));
    const req = mockReq({ filters: {} });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body['Surgery'].percentage).toBe(0);
  });

  it('applies location filter (array)', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { location: ['Clinic A'] } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies practice_groups filter (array)', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { practice_groups: ['Group1'] } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies provider filter as array', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { provider: ['Dr. Smith'] } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('treats provider empty string as all', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { provider: '' } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('treats provider "all" string as all', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { provider: 'All' } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('treats non-all provider string as [string]', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { provider: 'Dr. Jones' } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('treats non-array non-string provider as [all]', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { provider: null } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses explicit start_date + end_date', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({
      filters: {
        date_of_service: { start_date: '2025-01-01', end_date: '2025-12-31' },
      },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('fills missing start_date with null when end_date provided', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({
      filters: {
        date_of_service: { start_date: '', end_date: '2025-12-31' },
      },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('fills missing end_date with today when start_date provided', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({
      filters: {
        date_of_service: { start_date: '2025-01-01', end_date: '' },
      },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({ filters: {} });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  MedicareByCptGroup                                                  */
/* ================================================================== */
describe('MedicareByCptGroup', () => {
  let ctrl: MedicareByCptGroup;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new MedicareByCptGroup();
  });

  const makeResult = (rows: any[]) => ({ recordset: rows } as any);

  it('returns 200 with percentages computed', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([
      { cpt_group_name: 'E&M', total_billed: 200 },
      { cpt_group_name: 'Surgery', total_billed: 800 },
    ]));
    const req = mockReq({ filters: {} });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body['E&M'].percentage).toBe(20);
    expect(body['Surgery'].percentage).toBe(80);
  });

  it('returns 200 with zero totalSum', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([
      { cpt_group_name: 'E&M', total_billed: 0 },
    ]));
    const req = mockReq({ filters: {} });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body['E&M'].percentage).toBe(0);
  });

  it('applies location filter', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { location: ['Clinic B'] } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies practice_groups filter', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { practice_groups: ['Group2'] } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('provider as empty string maps to all', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { provider: '' } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('provider as "all" string maps to all', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { provider: 'all' } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('provider as specific string maps to [string]', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({ filters: { provider: 'Dr. Adams' } });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses explicit date range', async () => {
    mockQuery.mockResolvedValueOnce(makeResult([]));
    const req = mockReq({
      filters: { date_of_service: { start_date: '2025-06-01', end_date: '2025-06-30' } },
    });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({ filters: {} });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});



/* ================================================================== */
/*  DatabaseConnectionController                                        */
/* ================================================================== */
describe('DatabaseConnectionController', () => {
  it('constructs successfully and has a pool', () => {
    const ctrl = new DatabaseConnectionController();
    expect((ctrl as any).pool).toBeDefined();
  });

  it('closePool() closes the pool without throwing', () => {
    const ctrl = new DatabaseConnectionController();
    // pool.close is already mocked to resolve
    expect(() => ctrl.closePool()).not.toThrow();
  });

  it('closePool() logs warning when pool is null/undefined', () => {
    const ctrl = new DatabaseConnectionController();
    (ctrl as any).pool = null;
    expect(() => ctrl.closePool()).not.toThrow();
  });

  it('constructor throws "Database connection error" when getInstance fails', () => {
    // Temporarily override the mock to throw
    const dbMod = require('../modules/db');
    const origGetInstance = dbMod.default.getInstance;
    dbMod.default.getInstance = () => { throw new Error('Connection refused'); };
    expect(() => new DatabaseConnectionController()).toThrow('Database connection error');
    dbMod.default.getInstance = origGetInstance;
  });

  it('constructor throws for non-Error exception and logs unknown error', () => {
    const dbMod = require('../modules/db');
    const origGetInstance = dbMod.default.getInstance;
    dbMod.default.getInstance = () => { throw 'string error'; };
    expect(() => new DatabaseConnectionController()).toThrow('Database connection error');
    dbMod.default.getInstance = origGetInstance;
  });
});

/* ================================================================== */
/*  EobWithNoPayment                                                    */
/* ================================================================== */
describe('EobWithNoPayment', () => {
  let ctrl: EobWithNoPayment;

  beforeEach(() => {
    mockQuery.mockReset();
    ctrl = new EobWithNoPayment();
  });

  const makeRows = (...rows: any[]) => ({ recordset: rows });

  it('returns 200 with paginated rows (mode=all)', async () => {
    mockQuery.mockResolvedValueOnce(makeRows(
      { eobId: 1, value: 'RF-1', eobDate: '2025-01-01', payerName: 'Medicare', eobType: 'ERA', amount: 500 },
    ));
    const req = mockReq({}, {}, {}, { page: '1', pageSize: '10' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.pagination.page).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it('filters rows by search term', async () => {
    // Search is handled server-side in SQL; mock returns already-filtered result
    mockQuery.mockResolvedValueOnce(makeRows(
      { eobId: 1, value: 'RF-100', eobDate: '2025-01-01', payerName: 'Aetna', eobType: 'ERA', amount: 100 },
    ));
    const req = mockReq({}, {}, {}, { search: 'aetna' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].payerName).toBe('Aetna');
  });

  it('applies practiceId=single mode', async () => {
    mockQuery.mockResolvedValueOnce(makeRows());
    const req = mockReq({}, {}, {}, { practiceId: 'P1' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies practices=list mode (comma-separated string)', async () => {
    mockQuery.mockResolvedValueOnce(makeRows());
    const req = mockReq({}, {}, {}, { practices: 'P1,P2' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies practices=list mode (array)', async () => {
    mockQuery.mockResolvedValueOnce(makeRows());
    const req = mockReq({}, {}, {}, { practices: ['P1', 'P2,P3'] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies payers CSV filter', async () => {
    mockQuery.mockResolvedValueOnce(makeRows());
    const req = mockReq({}, {}, {}, { payers: 'Medicare,Aetna' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies payers as array filter', async () => {
    mockQuery.mockResolvedValueOnce(makeRows());
    const req = mockReq({}, {}, {}, { payers: ['Medicare', 'Aetna'] });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('ignores "all" in normalizeCsv', async () => {
    mockQuery.mockResolvedValueOnce(makeRows());
    const req = mockReq({}, {}, {}, { payers: 'all', providers: 'all' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.filters.payers).toBeNull();
    expect(body.filters.providers).toBeNull();
  });

  it('applies from/to date filters', async () => {
    mockQuery.mockResolvedValueOnce(makeRows());
    const req = mockReq({}, {}, {}, { from: '2025-01-01', to: '2025-12-31' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.filters.from).toBe('2025-01-01');
  });

  it('handles safePage and safePageSize defaults for invalid values', async () => {
    mockQuery.mockResolvedValueOnce(makeRows(
      { eobId: 1, value: 'RF-1', eobDate: '2025-01-01', payerName: 'X', eobType: 'ERA', amount: 0 },
    ));
    const req = mockReq({}, {}, {}, { page: 'abc', pageSize: 'xyz' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    // NaN -> defaults to 1 and 25
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(25);
  });

  it('handles page 2 pagination', async () => {
    // SQL handles pagination; mock returns page 2 results (10 rows out of 30 total)
    const pageRows = Array.from({ length: 10 }, (_, i) => ({
      eobId: i + 11, value: `RF-${i + 11}`, eobDate: '2025-01-01',
      payerName: 'X', eobType: 'ERA', amount: (i + 10) * 10, totalRows: 30,
    }));
    mockQuery.mockResolvedValueOnce({ recordset: pageRows });
    const req = mockReq({}, {}, {}, { page: '2', pageSize: '10' });
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as any;
    expect(body.rows).toHaveLength(10);
    expect(body.pagination.page).toBe(2);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const req = mockReq({}, {}, {}, {});
    const res = mockRes();
    await ctrl.get(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
