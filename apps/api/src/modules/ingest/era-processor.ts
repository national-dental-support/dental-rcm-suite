/**
 * ERA processor - takes a parsed X12 835 and atomically writes:
 *   remittanceFile (one per batch), EOBERAClaim, remittanceLine,
 *   payerPayment, payerPaymentAllocation, reconciliation (if matched).
 * Rolls back the entire transaction on any error and updates IngestRunLog.
 */

import sql from 'mssql';
import { Parsed835 } from '../edi-parser/x12-parser';
import Database from '../db';

export interface EraProcessorResult {
  remittanceFileId: string;
  claimsFound: number;
  claimsInserted: number;
  remittanceLinesInserted: number;
  payerPaymentId: number | null;
  runLogId: number;
}

export async function processEra(
  parsed: Parsed835,
  customerId: number,
  sourceFile: string,
  configId: number | null,
  triggeredBy: string,
): Promise<EraProcessorResult> {
  const pool = Database.getInstance().getPool();
  const tx = new sql.Transaction(pool);

  let runLogId = 0;

  try {
    // -- Create run log entry -------------------------------------------------
    const logStart = pool.request();
    logStart.input('configId',     sql.Int,          configId);
    logStart.input('customerId',   sql.Int,          customerId);
    logStart.input('ingestType',   sql.NVarChar(20), 'era');
    logStart.input('sourceFile',   sql.NVarChar(500),sourceFile);
    logStart.input('triggeredBy',  sql.NVarChar(50), triggeredBy);
    logStart.input('recordsFound', sql.Int,          parsed.claims.length);
    const logResult = await logStart.query(`
      INSERT INTO dbo.IngestRunLog
        (config_id, customer_id, ingest_type, source_file, triggered_by, status, records_found)
      VALUES
        (@configId, @customerId, @ingestType, @sourceFile, @triggeredBy, 'processing', @recordsFound);
      SELECT SCOPE_IDENTITY() AS id;
    `);
    runLogId = logResult.recordset[0]?.id ?? 0;

    await tx.begin();
    const r = new sql.Request(tx);

    // -- remittanceFile (one per 835 batch) -----------------------------------
    const rfId = `RMF-ERA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    r.input('rfId',         sql.NVarChar(50),  rfId);
    r.input('fileType',     sql.NVarChar(20),  'ERA');
    r.input('amount',       sql.Decimal(12,2), parsed.paymentAmount);
    r.input('fileDate',     sql.Date,          parsed.paymentDate || null);
    r.input('payerName',    sql.NVarChar(200), parsed.payerName);
    r.input('eraStatus',    sql.NVarChar(50),  'unmatched');
    r.input('custId',       sql.Int,           customerId);
    await r.query(`
      INSERT INTO dbo.remittanceFile
        (RemittanceFileID, FileType, Amount, FileDate, PracticeLocation,
         TaxID, PracticeID, LocationID, era_status, customer_id)
      VALUES
        (@rfId, @fileType, @amount, @fileDate, @payerName,
         '', 1, 1, @eraStatus, @custId);
    `);

    // -- payerPayment ---------------------------------------------------------
    let payerPaymentId: number | null = null;
    const r2 = new sql.Request(tx);
    r2.input('pmtMethod',   sql.NVarChar(20),  parsed.paymentMethod);
    r2.input('pmtAmt',      sql.Decimal(12,2), parsed.paymentAmount);
    r2.input('paidDate',    sql.Date,          parsed.paymentDate || null);
    r2.input('eftTrace',    sql.NVarChar(50),  parsed.eftTrace ?? null);
    r2.input('checkNum',    sql.NVarChar(50),  parsed.checkNumber ?? null);
    r2.input('remitType',   sql.NVarChar(20),  parsed.eftTrace ? 'EFT' : 'CHECK');
    r2.input('custId2',     sql.Int,           customerId);
    const ppResult = await r2.query(`
      INSERT INTO dbo.payerPayment
        (PaymentMethod, PaymentAmount, PaidDate, EFTTraceNumber, CheckNumber,
         RemittanceType, customer_id)
      VALUES
        (@pmtMethod, @pmtAmt, @paidDate, @eftTrace, @checkNum, @remitType, @custId2);
      SELECT SCOPE_IDENTITY() AS id;
    `);
    payerPaymentId = ppResult.recordset[0]?.id ?? null;

    // -- Per-claim: EOBERAClaim + remittanceLine + payerPaymentAllocation -----
    let claimsInserted = 0;
    let remittanceLinesInserted = 0;

    for (const claim of parsed.claims) {
      const claimR = new sql.Request(tx);
      claimR.input('claimId', sql.NVarChar(50), claim.claimId);
      claimR.input('rfIdC',   sql.NVarChar(50), rfId);

      // EOBERAClaim - idempotent
      await claimR.query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.EOBERAClaim WHERE ClaimID = @claimId)
          INSERT INTO dbo.EOBERAClaim (RemittanceFileID, ClaimID)
          VALUES (@rfIdC, @claimId);
      `);

      // remittanceLine per service line
      for (const svc of claim.serviceLines) {
        const rlR = new sql.Request(tx);
        const rlId = `RL-${rfId}-${claim.claimId}-${svc.procedureCode}-${Date.now()}`;
        const carc = svc.adjCodes[0]?.carc ?? (claim.claimStatus === '4' ? 'CO-50' : '');
        rlR.input('rlId',      sql.NVarChar(50),   rlId.slice(0, 50));
        rlR.input('claimIdRL', sql.NVarChar(50),   claim.claimId);
        rlR.input('rfIdRL',    sql.NVarChar(50),   rfId);
        rlR.input('chargeAmt', sql.Decimal(12,2),  svc.chargedAmount);
        rlR.input('paidAmt',   sql.Decimal(12,2),  svc.paidAmount);
        rlR.input('adjAmt',    sql.Decimal(12,2),  svc.chargedAmount - svc.paidAmount);
        rlR.input('adjCode',   sql.NVarChar(20),   carc);
        rlR.input('lineStatus',sql.NVarChar(20),   claim.claimStatus === '4' ? 'denied' : svc.paidAmount > 0 ? 'paid' : 'zero');
        await rlR.query(`
          INSERT INTO dbo.remittanceLine
            (RemitLineID, ClaimID, PostedDate, ChargeAmt, AllowedAmt, PaidAmt,
             PatientRespAmt, AdjustmentAmt, era_remittance_file_id,
             era_xen_claim_num, era_adj_code, era_line_status)
          VALUES
            (@rlId, @claimIdRL, CAST(GETDATE() AS date), @chargeAmt, @paidAmt, @paidAmt,
             0, @adjAmt, @rfIdRL, @claimIdRL, @adjCode, @lineStatus);
        `);
        remittanceLinesInserted++;
      }

      // payerPaymentAllocation
      if (payerPaymentId !== null) {
        const ppaR = new sql.Request(tx);
        const ppaId = `PPA-${rfId}-${claim.claimId}`.slice(0, 50);
        ppaR.input('ppaId',    sql.NVarChar(50),   ppaId);
        ppaR.input('ppId',     sql.Int,            payerPaymentId);
        ppaR.input('ppaClm',   sql.NVarChar(50),   claim.claimId);
        ppaR.input('applied',  sql.Decimal(12,2),  claim.paidAmount);
        ppaR.input('ppaCust',  sql.Int,            customerId);
        await ppaR.query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.payerPaymentAllocation WHERE ClaimID = @ppaClm AND PayerPaymentID = @ppId)
            INSERT INTO dbo.payerPaymentAllocation
              (PayerPaymentAllocationID, PayerPaymentID, ClaimID, AmountApplied, customer_id)
            VALUES (@ppaId, @ppId, @ppaClm, @applied, @ppaCust);
        `);
      }

      claimsInserted++;
    }

    await tx.commit();

    // Update run log - success
    const logEnd = pool.request();
    logEnd.input('logId',    sql.Int, runLogId);
    logEnd.input('inserted', sql.Int, claimsInserted);
    await logEnd.query(`
      UPDATE dbo.IngestRunLog
      SET status='success', records_inserted=@inserted, completed_at=SYSUTCDATETIME()
      WHERE id=@logId;
    `);

    return {
      remittanceFileId: rfId,
      claimsFound: parsed.claims.length,
      claimsInserted,
      remittanceLinesInserted,
      payerPaymentId,
      runLogId,
    };
  } catch (err: any) {
    try { await tx.rollback(); } catch (_) { /* ignore */ }

    if (runLogId) {
      try {
        const logErr = pool.request();
        logErr.input('logId',  sql.Int,          runLogId);
        logErr.input('detail', sql.NVarChar(sql.MAX), String(err?.message ?? err));
        await logErr.query(`
          UPDATE dbo.IngestRunLog
          SET status='error', error_detail=@detail, completed_at=SYSUTCDATETIME()
          WHERE id=@logId;
        `);
      } catch (_) { /* ignore */ }
    }

    throw err;
  }
}
