/**
 * Unit tests for ingest processors: processJsonClaim, processEra, processEFT,
 * and the pure helper parsed837ToPayloads.
 *
 * Uses the standard DB + mssql mock pattern from analytics-controllers.test.ts.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// -- Shared mock state ---------------------------------------------------------
const mockQuery  = jest.fn<any>();
const mockInput  = jest.fn<any>();
const mockBegin  = jest.fn<any>().mockResolvedValue(undefined);
const mockCommit = jest.fn<any>().mockResolvedValue(undefined);
const mockRollback = jest.fn<any>().mockResolvedValue(undefined);
const mockTx = { begin: mockBegin, commit: mockCommit, rollback: mockRollback };

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
  const mod = {
    __esModule: true,
    default: {
      Transaction: jest.fn().mockImplementation(() => mockTx),
      Request: jest.fn().mockImplementation(makeRequest),
      Int: typeStub, NVarChar: typeStub, Decimal: typeStub,
      Bit: typeStub, DateTime2: typeStub, Date: typeStub, MAX: 65535,
    },
    Transaction: jest.fn().mockImplementation(() => mockTx),
    Request: jest.fn().mockImplementation(makeRequest),
    Int: typeStub, NVarChar: typeStub, Decimal: typeStub,
    Bit: typeStub, DateTime2: typeStub, Date: typeStub, MAX: 65535,
  };
  return mod;
});

// fs/promises - used by eob-processor; mock to avoid real FS calls
jest.mock('fs/promises', () => ({
  readdir: jest.fn<any>().mockResolvedValue([]),
  rename:  jest.fn<any>().mockResolvedValue(undefined),
  mkdir:   jest.fn<any>().mockResolvedValue(undefined),
}));

// -- Imports AFTER mocks -------------------------------------------------------
import { processJsonClaim, parsed837ToPayloads, JsonClaimPayload } from '../modules/ingest/claim-processor';
import { processEra } from '../modules/ingest/era-processor';
import { processEFT }  from '../modules/ingest/eft-processor';
import type { Parsed835 } from '../modules/edi-parser/x12-parser';
import type { Parsed837 } from '../modules/edi-parser/x12-parser';

// -- Test data -----------------------------------------------------------------
const CLAIM_PAYLOAD: JsonClaimPayload = {
  claimId:       'CL5TEST01',
  patientId:     'PT001',
  payerId:       1,
  providerId:    1,
  dateOfService: '2026-01-15',
  totalCharge:   250,
  serviceLines:  [{ procedureCode: '99213', charge: 250, units: 1 }],
};

const PARSED_835: Parsed835 = {
  paymentMethod: 'ACH',
  paymentAmount: 1500,
  paymentDate:   '2026-01-15',
  eftTrace:      'TRC001',
  payerName:     'Test Payer',
  claims: [
    {
      claimId:             'CL5TEST01',
      claimStatus:         '1',
      chargedAmount:       500,
      paidAmount:          400,
      patientResponsibility: 0,
      serviceLines: [
        { procedureCode: '99213', chargedAmount: 300, paidAmount: 250, adjCodes: [{ group: 'CO', carc: '45', amount: 50 }] },
      ],
    },
  ],
};

const PARSED_837: Parsed837 = {
  providerNpi: '1234567890',
  subscriber:  { id: 'S123', firstName: 'John', lastName: 'Doe', dob: '1980-01-01' },
  payer:       { id: 'P001', name: 'Test Payer' },
  claims: [
    {
      claimId:        'CL6TEST01',
      totalCharge:    300,
      dateOfService:  '2026-01-15',
      diagnosisCodes: ['Z34'],
      serviceLines:   [{ procedureCode: '99213', charge: 300, units: 1 }],
    },
    {
      claimId:        'CL6TEST02',
      totalCharge:    150,
      dateOfService:  '2026-01-16',
      diagnosisCodes: [],
      serviceLines:   [{ procedureCode: '99212', charge: 150, units: 1 }],
    },
  ],
};

// -- parsed837ToPayloads (pure function) ---------------------------------------
describe('parsed837ToPayloads()', () => {
  const resolvePayerId    = (_: string) => 42;
  const resolveProviderId = (_: string) => 7;

  it('maps each CLM to a JsonClaimPayload', () => {
    const payloads = parsed837ToPayloads(PARSED_837, resolvePayerId, resolveProviderId);
    expect(payloads).toHaveLength(2);
    expect(payloads[0].claimId).toBe('CL6TEST01');
    expect(payloads[1].claimId).toBe('CL6TEST02');
  });

  it('uses subscriber.id as patientId', () => {
    const payloads = parsed837ToPayloads(PARSED_837, resolvePayerId, resolveProviderId);
    expect(payloads[0].patientId).toBe('S123');
  });

  it('resolves payerId and providerId via callbacks', () => {
    const payloads = parsed837ToPayloads(PARSED_837, resolvePayerId, resolveProviderId);
    expect(payloads[0].payerId).toBe(42);
    expect(payloads[0].providerId).toBe(7);
  });

  it('maps service lines correctly', () => {
    const payloads = parsed837ToPayloads(PARSED_837, resolvePayerId, resolveProviderId);
    expect(payloads[0].serviceLines[0].procedureCode).toBe('99213');
    expect(payloads[0].serviceLines[0].charge).toBe(300);
  });

  it('returns empty array when parsed837.claims is empty', () => {
    const empty837: Parsed837 = { ...PARSED_837, claims: [] };
    const payloads = parsed837ToPayloads(empty837, resolvePayerId, resolveProviderId);
    expect(payloads).toHaveLength(0);
  });
});

// -- processJsonClaim ----------------------------------------------------------
describe('processJsonClaim()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBegin.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
  });

  it('inserts new claim and returns inserted:true', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })  // INSERT IngestRunLog
      .mockResolvedValueOnce({ recordset: [] })             // exists check (empty = new)
      .mockResolvedValue({ recordset: [] });                // all remaining inserts + log update

    const result = await processJsonClaim(CLAIM_PAYLOAD, 1, 'test');

    expect(result.inserted).toBe(true);
    expect(result.claimId).toBe('CL5TEST01');
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it('skips insert and returns inserted:false for duplicate claim', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })      // INSERT IngestRunLog
      .mockResolvedValueOnce({ recordset: [{ ex: 1 }] })      // exists check (has row = duplicate)
      .mockResolvedValue({ recordset: [] });                   // UPDATE IngestRunLog skip

    const result = await processJsonClaim(CLAIM_PAYLOAD, 1, 'test');

    expect(result.inserted).toBe(false);
    expect(result.serviceLineCount).toBe(0);
    expect(mockBegin).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('rolls back and re-throws when INSERT claims fails', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })  // INSERT IngestRunLog
      .mockResolvedValueOnce({ recordset: [] })             // exists check (new)
      .mockRejectedValueOnce(new Error('FK constraint'))   // INSERT claims throws
      .mockResolvedValue({ recordset: [] });                // error log update

    await expect(processJsonClaim(CLAIM_PAYLOAD, 1, 'test'))
      .rejects.toThrow('FK constraint');

    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockCommit).not.toHaveBeenCalled();
  });
});

// -- processEra ----------------------------------------------------------------
describe('processEra()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBegin.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
    // Default: all queries succeed; SCOPE_IDENTITY returns an id
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
  });

  it('commits transaction on success and returns result with claimsFound', async () => {
    const result = await processEra(PARSED_835, 1, 'test.835', null, 'test');

    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();
    expect(result.claimsFound).toBe(1);
    expect(result.runLogId).toBeGreaterThanOrEqual(0);
  });

  it('rolls back and re-throws when a transactional INSERT fails', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })  // IngestRunLog
      .mockResolvedValueOnce({ recordset: [] })             // remittanceFile
      .mockRejectedValueOnce(new Error('table missing'))   // EOBERAClaim throws
      .mockResolvedValue({ recordset: [] });                // error log update

    await expect(processEra(PARSED_835, 1, 'test.835', null, 'test'))
      .rejects.toThrow('table missing');

    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockCommit).not.toHaveBeenCalled();
  });
});

// -- processEFT ----------------------------------------------------------------
describe('processEFT()', () => {
  const EFT_PAYLOAD = {
    traceNumber:   'TRC-001',
    effectiveDate: '2026-01-15',
    amount:        1500,
    payerName:     'Test Payer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBegin.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
  });

  it('inserts payerPayment and bankDeposit, commits, no reconciliation when no ERA match', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })  // IngestRunLog
      .mockResolvedValueOnce({ recordset: [{ id: 10 }] }) // payerPayment
      .mockResolvedValueOnce({ recordset: [{ id: 20 }] }) // bankDeposit
      .mockResolvedValueOnce({ recordset: [] })             // auto-match lookup (no match)
      .mockResolvedValue({ recordset: [] });                // log update

    const result = await processEFT(EFT_PAYLOAD, 1, 'test');

    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();
    expect(result.reconciliationCreated).toBe(false);
    expect(result.matchedRemittanceFileId).toBeNull();
  });

  it('creates reconciliation row when ERA auto-match is found', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })                         // IngestRunLog
      .mockResolvedValueOnce({ recordset: [{ id: 10 }] })                        // payerPayment
      .mockResolvedValueOnce({ recordset: [{ id: 20 }] })                        // bankDeposit
      .mockResolvedValueOnce({ recordset: [{ RemittanceFileID: 'RMF-TEST01' }] }) // auto-match found
      .mockResolvedValue({ recordset: [] });                                       // reconciliation INSERT + log update

    const result = await processEFT(EFT_PAYLOAD, 1, 'test');

    expect(result.reconciliationCreated).toBe(true);
    expect(result.matchedRemittanceFileId).toBe('RMF-TEST01');
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it('rolls back and re-throws when payerPayment INSERT fails', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })  // IngestRunLog
      .mockRejectedValueOnce(new Error('Deadlock'))        // payerPayment throws
      .mockResolvedValue({ recordset: [] });                // error log update

    await expect(processEFT(EFT_PAYLOAD, 1, 'test'))
      .rejects.toThrow('Deadlock');

    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockCommit).not.toHaveBeenCalled();
  });
});
