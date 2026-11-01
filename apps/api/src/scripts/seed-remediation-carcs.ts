/**
 * One-time seed script: import CARC codes from carcs.csv as DenialIQ remediation step sets.
 *
 * Each CARC code gets an active step set for the 'ar-specialist' role with 2 steps:
 *   Step 1: "Review Denial Code" - the official HIPAA description of the code
 *   Step 2: "Take Corrective Action" - generic remediation guide
 *
 * Skips codes that already have an active step set (preserves existing richer sets like CO26).
 *
 * Run:
 *   npm run seed:remediation-carcs
 */

import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import sql from 'mssql';
import { dbConfig } from '../databaseManager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE = 'ar-specialist';

const CORRECTIVE_ACTION_BODY = `Based on the denial reason above, determine the appropriate action:

\u2022 Billing error: Correct the claim and resubmit with updated information
\u2022 Patient responsibility: Update patient billing and collect the balance accordingly
\u2022 Clinical / medical necessity: Prepare an appeal with supporting clinical notes and auth
\u2022 Missing information: Gather required details and resubmit, or call the payer for guidance
\u2022 Payer contract issue: Review contracted rates and escalate to management if underpaid

Document all actions taken in the claim notes.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CsvRow {
  code: string;
  description: string;
  category: string;
}

function readCsv(filePath: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row: CsvRow) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Strip trailing date metadata from CARC descriptions.
 * "...description text.\nStart: 01/01/1995 | Last Modified: 03/01/2018"
 *  -> "...description text."
 */
function cleanDescription(raw: string): string {
  const startIdx = raw.indexOf('\nStart:');
  return (startIdx !== -1 ? raw.slice(0, startIdx) : raw).trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Connect directly (no singleton timing issues in standalone scripts)
  console.log('Connecting to database...');
  const pool = await sql.connect(dbConfig as sql.config);
  console.log('Connected.\n');

  // 1. Load CSV
  const csvPath = path.join('src', 'data', 'carcs.csv');
  console.log(`Reading ${csvPath}...`);
  const rows = await readCsv(csvPath);
  console.log(`Loaded ${rows.length} rows from CSV.`);

  // 2. Get existing reason_codes for this role (to avoid duplicates / preserve richer sets)
  const existingResult = await pool.request().query(`
    SELECT reason_code
    FROM dbo.RemediationStepSet
    WHERE role = '${ROLE}'
  `);
  const existingCodes = new Set<string>(
    existingResult.recordset.map((r: any) => String(r.reason_code))
  );
  console.log(`Found ${existingCodes.size} existing step sets \u2014 these will be skipped.\n`);

  let inserted = 0;
  let skipped = 0;
  let errored = 0;

  for (const row of rows) {
    const code = row.code?.trim();
    const rawDesc = (row.description ?? '').trim();

    // Skip blank or already-seeded codes
    if (!code || !rawDesc) {
      skipped++;
      continue;
    }
    if (existingCodes.has(code)) {
      skipped++;
      continue;
    }

    const description = cleanDescription(rawDesc);

    try {
      // -- Insert step set --------------------------------------------------
      const setResult = await pool.request()
        .input('code', sql.NVarChar(50), code)
        .input('role', sql.NVarChar(50), ROLE)
        .query(`
          INSERT INTO dbo.RemediationStepSet
            (reason_code, role, status, version, published_at, published_by, created_by)
          OUTPUT INSERTED.id
          VALUES (@code, @role, 'active', 1, GETUTCDATE(), 'system-seed', 'system-seed')
        `);
      const setId: number = setResult.recordset[0].id;

      // -- Step 1: Review Denial Code ---------------------------------------
      const step1Result = await pool.request()
        .input('setId', sql.Int,              setId)
        .input('title', sql.NVarChar(200),    'Review Denial Code')
        .input('body',  sql.NVarChar(sql.MAX), description)
        .query(`
          INSERT INTO dbo.RemediationStep
            (set_id, sort_order, title, body, required)
          OUTPUT INSERTED.id
          VALUES (@setId, 1, @title, @body, 1)
        `);
      const step1Id: number = step1Result.recordset[0].id;

      // Checklist item for step 1
      await pool.request()
        .input('stepId', sql.Int,           step1Id)
        .input('text',   sql.NVarChar(500), 'Confirm the denial reason matches the CARC code description')
        .query(`
          INSERT INTO dbo.RemediationStepChecklist
            (step_id, sort_order, item_text)
          VALUES (@stepId, 1, @text)
        `);

      // -- Step 2: Take Corrective Action -----------------------------------
      await pool.request()
        .input('setId', sql.Int,              setId)
        .input('title', sql.NVarChar(200),    'Take Corrective Action')
        .input('body',  sql.NVarChar(sql.MAX), CORRECTIVE_ACTION_BODY)
        .query(`
          INSERT INTO dbo.RemediationStep
            (set_id, sort_order, title, body, required)
          VALUES (@setId, 2, @title, @body, 1)
        `);

      existingCodes.add(code);
      inserted++;

      if (inserted % 50 === 0) {
        console.log(`  ... ${inserted} sets inserted so far`);
      }
    } catch (err: any) {
      console.error(`  ERROR on code '${code}': ${err.message}`);
      errored++;
    }
  }

  await pool.close();

  console.log(`\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  console.log(`Done!`);
  console.log(`  Inserted : ${inserted}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errored}`);
  console.log(`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);

  process.exit(errored > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
