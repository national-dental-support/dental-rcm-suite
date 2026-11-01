/**
 * Claim processor - inserts a new claim from a parsed X12 837 or JSON payload
 * into claims, claimhistory, and recon_report. Idempotent on ClaimID.
 */

import sql from 'mssql';
import { Parsed837 } from '../edi-parser/x12-parser';
import Database from '../db';

export interface JsonClaimPayload {
  claimId: string;
  patientId: string;
  payerId: number;
  providerId: number;
  dateOfService: string;   // YYYY-MM-DD
  totalCharge: number;
  serviceLines: Array<{
    procedureCode: string;
    charge: number;
    units?: number;
  }>;
}

export interface ClaimProcessorResult {
  claimId: string;
  inserted: boolean;        // false = already existed, skipped
  serviceLineCount: number;
  runLogId: number;
}

export const JSON_CLAIM_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema',
  type: 'object',
  required: ['claimId', 'patientId', 'payerId', 'providerId', 'dateOfService', 'totalCharge', 'serviceLines'],
  properties: {
    claimId:       { type: 'string',  minLength: 1, maxLength: 50 },
    patientId:     { type: 'string',  minLength: 1 },
    payerId:       { type: 'integer', minimum: 1 },
    providerId:    { type: 'integer', minimum: 1 },
    dateOfService: { type: 'string',  pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    totalCharge:   { type: 'number',  minimum: 0 },
    serviceLines: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        required: ['procedureCode', 'charge'],
        properties: {
          procedureCode: { type: 'string', minLength: 1 },
          charge:        { type: 'number', minimum: 0 },
          units:         { type: 'integer', minimum: 1, default: 1 },
        },
      },
    },
  },
};

export async function processJsonClaim(
  payload: JsonClaimPayload,
  customerId: number,
  triggeredBy: string,
  configId: number | null = null,
): Promise<ClaimProcessorResult> {
  const pool = Database.getInstance().getPool();
  const tx = new sql.Transaction(pool);

  let runLogId = 0;

  try {
    // Run log entry
    const logStart = pool.request();
    logStart.input('configId',    sql.Int,          configId);
    logStart.input('customerId',  sql.Int,          customerId);
    logStart.input('sourceFile',  sql.NVarChar(500), payload.claimId);
    logStart.input('triggeredBy', sql.NVarChar(50),  triggeredBy);
    const logResult = await logStart.query(`
      INSERT INTO dbo.IngestRunLog
        (config_id, customer_id, ingest_type, source_file, triggered_by, status, records_found)
      VALUES (@configId, @customerId, 'claim', @sourceFile, @triggeredBy, 'processing', 1);
      SELECT SCOPE_IDENTITY() AS id;
    `);
    runLogId = logResult.recordset[0]?.id ?? 0;

    // Check idempotency before opening transaction
    const existsR = pool.request();
    existsR.input('cid', sql.NVarChar(50), payload.claimId);
    const existsResult = await existsR.query(`SELECT 1 AS ex FROM dbo.claims WHERE ClaimID = @cid`);
    if (existsResult.recordset.length > 0) {
      // Already exists - skip, mark success
      const logSkip = pool.request();
      logSkip.input('lid', sql.Int, runLogId);
      await logSkip.query(`
        UPDATE dbo.IngestRunLog
        SET status='success', records_inserted=0,
            error_detail='Claim already exists \u2014 skipped (idempotent)',
            completed_at=SYSUTCDATETIME()
        WHERE id=@lid;
      `);
      return { claimId: payload.claimId, inserted: false, serviceLineCount: 0, runLogId };
    }

    await tx.begin();

    // INSERT claims
    const claimR = new sql.Request(tx);
    claimR.input('claimId',   sql.NVarChar(50),   payload.claimId);
    claimR.input('patientId', sql.NVarChar(50),   payload.patientId);
    claimR.input('payerId',   sql.Int,            payload.payerId);
    claimR.input('provId',    sql.Int,            payload.providerId);
    claimR.input('dos',       sql.Date,           payload.dateOfService);
    claimR.input('charge',    sql.Decimal(12,2),  payload.totalCharge);
    claimR.input('custId',    sql.Int,            customerId);
    await claimR.query(`
      INSERT INTO dbo.claims
        (ClaimID, PatientID, PayerID, ProviderID, DateOfService,
         ChargeAmt, ClaimSubmittedDate, customer_id)
      VALUES
        (@claimId, @patientId, @payerId, @provId, @dos,
         @charge, CAST(GETDATE() AS date), @custId);
    `);

    // INSERT claimhistory (initial Submitted row)
    const histR = new sql.Request(tx);
    histR.input('claimIdH', sql.NVarChar(50), payload.claimId);
    histR.input('custIdH',  sql.Int,          customerId);
    await histR.query(`
      INSERT INTO dbo.claimhistory
        (ClaimID, ClaimStatus, ClaimSubmittedDate, ClaimModifiedDate, customer_id)
      VALUES
        (@claimIdH, 'Submitted', CAST(GETDATE() AS date), GETDATE(), @custIdH);
    `);

    // INSERT recon_report charge lines
    for (const sl of payload.serviceLines) {
      const rrR = new sql.Request(tx);
      rrR.input('claimIdRR',  sql.NVarChar(50),   payload.claimId);
      rrR.input('trxAmt',     sql.Decimal(12,2),  sl.charge);
      rrR.input('dos2',       sql.Date,           payload.dateOfService);
      rrR.input('custIdRR',   sql.Int,            customerId);
      await rrR.query(`
        INSERT INTO dbo.recon_report
          (ClaimID, TrxType, TrxAmt, DateOfService, customer_id)
        VALUES
          (@claimIdRR, 'Charge', @trxAmt, @dos2, @custIdRR);
      `);
    }

    await tx.commit();

    const logEnd = pool.request();
    logEnd.input('lid2', sql.Int, runLogId);
    await logEnd.query(`
      UPDATE dbo.IngestRunLog
      SET status='success', records_inserted=1, completed_at=SYSUTCDATETIME()
      WHERE id=@lid2;
    `);

    return {
      claimId: payload.claimId,
      inserted: true,
      serviceLineCount: payload.serviceLines.length,
      runLogId,
    };
  } catch (err: any) {
    try { await tx.rollback(); } catch (_) { /* ignore */ }
    if (runLogId) {
      try {
        const logErr = pool.request();
        logErr.input('lid3',   sql.Int,              runLogId);
        logErr.input('detail', sql.NVarChar(sql.MAX), String(err?.message ?? err));
        await logErr.query(`
          UPDATE dbo.IngestRunLog
          SET status='error', error_detail=@detail, completed_at=SYSUTCDATETIME()
          WHERE id=@lid3;
        `);
      } catch (_) { /* ignore */ }
    }
    throw err;
  }
}

/** Convert a Parsed837 to JsonClaimPayload array (one per CLM segment). */
export function parsed837ToPayloads(
  parsed: Parsed837,
  resolvePayerId: (payerName: string) => number,
  resolveProviderId: (npi: string) => number,
): JsonClaimPayload[] {
  return parsed.claims.map(c => ({
    claimId:       c.claimId,
    patientId:     parsed.subscriber.id,
    payerId:       resolvePayerId(parsed.payer.name),
    providerId:    resolveProviderId(parsed.providerNpi ?? ''),
    dateOfService: c.dateOfService,
    totalCharge:   c.totalCharge,
    serviceLines:  c.serviceLines.map(sl => ({
      procedureCode: sl.procedureCode,
      charge:        sl.charge,
      units:         sl.units,
    })),
  }));
}
