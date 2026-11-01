/**
 * EFT processor - inserts an EFT notification into payerPayment + bankDeposit,
 * then attempts to auto-match an existing remittanceFile (ERA) by payer name
 * and date proximity. If matched, inserts a reconciliation row.
 */

import sql from 'mssql';
import Database from '../db';

export interface EFTNotification {
  traceNumber: string;
  effectiveDate: string;   // YYYY-MM-DD
  amount: number;
  payerName: string;
  bankAccountId?: number;
}

export const EFT_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema',
  type: 'object',
  required: ['traceNumber', 'effectiveDate', 'amount', 'payerName'],
  properties: {
    traceNumber:   { type: 'string',  minLength: 1, maxLength: 50 },
    effectiveDate: { type: 'string',  pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    amount:        { type: 'number',  minimum: 0 },
    payerName:     { type: 'string',  minLength: 1, maxLength: 200 },
    bankAccountId: { type: 'integer', minimum: 1 },
  },
};

export interface EFTProcessorResult {
  payerPaymentId: number;
  bankDepositId: number;
  reconciliationCreated: boolean;
  matchedRemittanceFileId: string | null;
  runLogId: number;
}

export async function processEFT(
  eft: EFTNotification,
  customerId: number,
  triggeredBy: string,
  configId: number | null = null,
): Promise<EFTProcessorResult> {
  const pool = Database.getInstance().getPool();
  const tx = new sql.Transaction(pool);
  let runLogId = 0;

  try {
    // Run log
    const logStart = pool.request();
    logStart.input('configId',    sql.Int,          configId);
    logStart.input('customerId',  sql.Int,          customerId);
    logStart.input('sourceFile',  sql.NVarChar(500), eft.traceNumber);
    logStart.input('triggeredBy', sql.NVarChar(50),  triggeredBy);
    const logResult = await logStart.query(`
      INSERT INTO dbo.IngestRunLog
        (config_id, customer_id, ingest_type, source_file, triggered_by, status, records_found)
      VALUES (@configId, @customerId, 'eft', @sourceFile, @triggeredBy, 'processing', 1);
      SELECT SCOPE_IDENTITY() AS id;
    `);
    runLogId = logResult.recordset[0]?.id ?? 0;

    await tx.begin();

    // payerPayment
    const ppR = new sql.Request(tx);
    ppR.input('pmtMethod',   sql.NVarChar(20),   'EFT');
    ppR.input('pmtAmt',      sql.Decimal(12,2),  eft.amount);
    ppR.input('paidDate',    sql.Date,           eft.effectiveDate);
    ppR.input('remitRef',    sql.NVarChar(50),   eft.traceNumber);
    ppR.input('remitType',   sql.NVarChar(20),   'EFT');
    ppR.input('custId',      sql.Int,            customerId);
    const ppResult = await ppR.query(`
      INSERT INTO dbo.payerPayment
        (PaymentMethod, PaymentAmount, PaidDate, RemittanceReference, RemittanceType, customer_id)
      VALUES (@pmtMethod, @pmtAmt, @paidDate, @remitRef, @remitType, @custId);
      SELECT SCOPE_IDENTITY() AS id;
    `);
    const payerPaymentId = ppResult.recordset[0]?.id as number;

    // bankDeposit
    const bdR = new sql.Request(tx);
    bdR.input('depositDate',   sql.Date,           eft.effectiveDate);
    bdR.input('depositAmt',    sql.Decimal(12,2),  eft.amount);
    bdR.input('ppId',          sql.Int,            payerPaymentId);
    bdR.input('bankAccId',     sql.Int,            eft.bankAccountId ?? null);
    const bdResult = await bdR.query(`
      INSERT INTO dbo.bankDeposit
        (DepositDate, DepositAmount, PayerPaymentID, bank_account_id)
      VALUES (@depositDate, @depositAmt, @ppId, @bankAccId);
      SELECT SCOPE_IDENTITY() AS id;
    `);
    const bankDepositId = bdResult.recordset[0]?.id as number;

    await tx.commit();

    // Attempt auto-match: find an unmatched remittanceFile ERA for this payer within +/-3 days
    let matchedRfId: string | null = null;
    let reconCreated = false;

    const matchR = pool.request();
    matchR.input('payerNameM', sql.NVarChar(200), eft.payerName);
    matchR.input('effDate',    sql.Date,          eft.effectiveDate);
    matchR.input('custIdM',    sql.Int,           customerId);
    const matchResult = await matchR.query(`
      SELECT TOP 1 rf.RemittanceFileID
      FROM dbo.remittanceFile rf
      WHERE rf.era_status = 'unmatched'
        AND rf.customer_id = @custIdM
        AND rf.PracticeLocation LIKE '%' + @payerNameM + '%'
        AND ABS(DATEDIFF(DAY, rf.FileDate, @effDate)) <= 3
      ORDER BY ABS(DATEDIFF(DAY, rf.FileDate, @effDate)), rf.RemittanceFileID;
    `);
    if (matchResult.recordset.length > 0) {
      matchedRfId = matchResult.recordset[0].RemittanceFileID;
      const reconR = pool.request();
      reconR.input('rfIdR',  sql.NVarChar(50), matchedRfId);
      reconR.input('bdIdR',  sql.Int,          bankDepositId);
      await reconR.query(`
        INSERT INTO dbo.reconciliation (RemittanceFileID, BankDepositID, MatchFlag)
        VALUES (@rfIdR, @bdIdR, 1);
        UPDATE dbo.remittanceFile SET era_status='matched' WHERE RemittanceFileID=@rfIdR;
      `);
      reconCreated = true;
    }

    const logEnd = pool.request();
    logEnd.input('lid', sql.Int, runLogId);
    await logEnd.query(`
      UPDATE dbo.IngestRunLog
      SET status='success', records_inserted=1, completed_at=SYSUTCDATETIME()
      WHERE id=@lid;
    `);

    return { payerPaymentId, bankDepositId, reconciliationCreated: reconCreated, matchedRemittanceFileId: matchedRfId, runLogId };
  } catch (err: any) {
    try { await tx.rollback(); } catch (_) { /* ignore */ }
    if (runLogId) {
      try {
        const logErr = pool.request();
        logErr.input('lid2',   sql.Int,              runLogId);
        logErr.input('detail', sql.NVarChar(sql.MAX), String(err?.message ?? err));
        await logErr.query(`
          UPDATE dbo.IngestRunLog
          SET status='error', error_detail=@detail, completed_at=SYSUTCDATETIME()
          WHERE id=@lid2;
        `);
      } catch (_) { /* ignore */ }
    }
    throw err;
  }
}
