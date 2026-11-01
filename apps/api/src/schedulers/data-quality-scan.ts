import cron from 'node-cron';
import Database from '../modules/db';
import logger from '../utils/logger';
import { withLock } from '../utils/distributed-lock';
import { runAsSystem } from '../modules/rls-context';

/**
 * Data Quality Scanner - runs daily at 4 AM UTC.
 *
 * Checks all active DataQualityRules against their target tables.
 * Flags violations via data_quality_flags column and creates
 * DataQuarantine records for errors.
 */
export function startDataQualityScan(): void {
  cron.schedule('0 4 * * *', async () => {
    await withLock('data-quality-scan', 1800, async () => {
      try {
        // G7: background job legitimately operates cross-tenant under RLS
        await runAsSystem(() => runDataQualityScan());
      } catch (err: any) {
        logger.error(`[DataQuality] Scan error: ${err?.message}`);
      }
    });
  });
  logger.info('[DataQuality] Data quality scanner started (daily at 4 AM UTC)');
}

async function runDataQualityScan(): Promise<void> {
  const pool = Database.getInstance().getPool();
  if (!pool.connected) return;

  let totalFlags = 0;
  let totalQuarantined = 0;

  // 1. MISSING_PAYER - claims with no payer
  const missingPayer = await pool.request().query(`
    UPDATE dbo.claims
    SET data_quality_flags = CASE
      WHEN data_quality_flags IS NULL THEN '["MISSING_PAYER"]'
      WHEN data_quality_flags NOT LIKE '%MISSING_PAYER%' THEN REPLACE(data_quality_flags, ']', ',"MISSING_PAYER"]')
      ELSE data_quality_flags
    END
    WHERE (PayerID IS NULL OR PayerID = 0)
      AND (data_quality_flags IS NULL OR data_quality_flags NOT LIKE '%MISSING_PAYER%')
  `);
  totalFlags += missingPayer.rowsAffected[0] || 0;

  // 2. MISSING_DOS - claims with no date of service
  const missingDos = await pool.request().query(`
    UPDATE dbo.claims
    SET data_quality_flags = CASE
      WHEN data_quality_flags IS NULL THEN '["MISSING_DOS"]'
      WHEN data_quality_flags NOT LIKE '%MISSING_DOS%' THEN REPLACE(data_quality_flags, ']', ',"MISSING_DOS"]')
      ELSE data_quality_flags
    END
    WHERE DateOfService IS NULL
      AND (data_quality_flags IS NULL OR data_quality_flags NOT LIKE '%MISSING_DOS%')
  `);
  totalFlags += missingDos.rowsAffected[0] || 0;

  // 3. MISSING_CHARGE - claims with zero or null charge
  const missingCharge = await pool.request().query(`
    UPDATE dbo.claims
    SET data_quality_flags = CASE
      WHEN data_quality_flags IS NULL THEN '["MISSING_CHARGE"]'
      WHEN data_quality_flags NOT LIKE '%MISSING_CHARGE%' THEN REPLACE(data_quality_flags, ']', ',"MISSING_CHARGE"]')
      ELSE data_quality_flags
    END
    WHERE (ChargeAmt IS NULL OR ChargeAmt = 0)
      AND (data_quality_flags IS NULL OR data_quality_flags NOT LIKE '%MISSING_CHARGE%')
  `);
  totalFlags += missingCharge.rowsAffected[0] || 0;

  // 4. FUTURE_DOS - date of service in the future
  const futureDos = await pool.request().query(`
    UPDATE dbo.claims
    SET data_quality_flags = CASE
      WHEN data_quality_flags IS NULL THEN '["FUTURE_DOS"]'
      WHEN data_quality_flags NOT LIKE '%FUTURE_DOS%' THEN REPLACE(data_quality_flags, ']', ',"FUTURE_DOS"]')
      ELSE data_quality_flags
    END
    WHERE DateOfService > CAST(GETDATE() AS date)
      AND (data_quality_flags IS NULL OR data_quality_flags NOT LIKE '%FUTURE_DOS%')
  `);
  totalFlags += futureDos.rowsAffected[0] || 0;

  // 5. MISSING_CARC - denied claims with no CARC code
  const missingCarc = await pool.request().query(`
    UPDATE dbo.claimhistory
    SET data_quality_flags = CASE
      WHEN data_quality_flags IS NULL THEN '["MISSING_CARC"]'
      WHEN data_quality_flags NOT LIKE '%MISSING_CARC%' THEN REPLACE(data_quality_flags, ']', ',"MISSING_CARC"]')
      ELSE data_quality_flags
    END
    WHERE IsClaimDenied = 1
      AND (CarcCode IS NULL OR CarcCode = '')
      AND (data_quality_flags IS NULL OR data_quality_flags NOT LIKE '%MISSING_CARC%')
  `);
  totalFlags += missingCarc.rowsAffected[0] || 0;

  // 6. DUPLICATE_CLAIM detection - quarantine records
  const duplicates = await pool.request().query(`
    ;WITH PossibleDups AS (
      SELECT
        c1.ClaimID AS claim_id,
        c2.ClaimID AS duplicate_of,
        'patient_dos_charge' AS match_reason,
        100.0 AS confidence
      FROM dbo.claims c1
      INNER JOIN dbo.claims c2
        ON c1.PatientID = c2.PatientID
        AND c1.DateOfService = c2.DateOfService
        AND c1.ChargeAmt = c2.ChargeAmt
        AND c1.ClaimID > c2.ClaimID  -- Avoid self-match and double-counting
        AND c1.customer_id = c2.customer_id
    )
    INSERT INTO dbo.ClaimDeduplicationLog (claim_id, duplicate_of, match_reason, confidence, customer_id)
    SELECT pd.claim_id, pd.duplicate_of, pd.match_reason, pd.confidence, c.customer_id
    FROM PossibleDups pd
    INNER JOIN dbo.claims c ON c.ClaimID = pd.claim_id
    WHERE NOT EXISTS (
      SELECT 1 FROM dbo.ClaimDeduplicationLog dl
      WHERE dl.claim_id = pd.claim_id AND dl.duplicate_of = pd.duplicate_of
    )
  `);
  const dupCount = duplicates.rowsAffected[0] || 0;

  // 7. Quarantine error-severity records
  const quarantined = await pool.request().query(`
    INSERT INTO dbo.DataQuarantine (source_table, record_key, rule_code, severity, customer_id)
    SELECT 'claims', c.ClaimID, 'MISSING_PAYER', 'error', c.customer_id
    FROM dbo.claims c
    WHERE (c.PayerID IS NULL OR c.PayerID = 0)
      AND NOT EXISTS (
        SELECT 1 FROM dbo.DataQuarantine dq
        WHERE dq.record_key = c.ClaimID AND dq.rule_code = 'MISSING_PAYER' AND dq.status = 'open'
      )
  `);
  totalQuarantined += quarantined.rowsAffected[0] || 0;

  // 8. Clear flags for resolved issues
  const cleared = await pool.request().query(`
    UPDATE dbo.claims
    SET data_quality_flags = REPLACE(data_quality_flags, '"FUTURE_DOS"', '')
    WHERE DateOfService <= CAST(GETDATE() AS date)
      AND data_quality_flags LIKE '%FUTURE_DOS%'
  `);

  logger.info(
    `[DataQuality] Scan complete: ${totalFlags} flags set, ${dupCount} duplicates detected, ` +
    `${totalQuarantined} quarantined, ${cleared.rowsAffected[0] || 0} flags cleared`
  );
}
