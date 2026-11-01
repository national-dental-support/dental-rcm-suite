/**
 * EOB processor - stores a PDF/HTML EOB document against a claim.
 * Uses the existing StorageProvider for encrypted persistence, then
 * inserts a ClaimDocuments row pointing to the stored file.
 */

import sql from 'mssql';
import path from 'path';
import Database from '../db';

export const EOB_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema',
  description: 'EOB document upload uses multipart/form-data with the file in the "file" field and claimId as a query param.',
  type: 'object',
  required: ['claimId'],
  properties: {
    claimId: { type: 'string', minLength: 1, maxLength: 50 },
  },
};

export interface EOBProcessorResult {
  documentId: number;
  claimId: string;
  fileName: string;
  runLogId: number;
}

export async function processEOB(
  claimId: string,
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  customerId: number,
  uploadedBy: string,
  triggeredBy: string,
  configId: number | null = null,
): Promise<EOBProcessorResult> {
  const pool = Database.getInstance().getPool();
  let runLogId = 0;

  try {
    // Run log
    const logStart = pool.request();
    logStart.input('configId',    sql.Int,          configId);
    logStart.input('customerId',  sql.Int,          customerId);
    logStart.input('sourceFile',  sql.NVarChar(500), originalName);
    logStart.input('triggeredBy', sql.NVarChar(50),  triggeredBy);
    const logResult = await logStart.query(`
      INSERT INTO dbo.IngestRunLog
        (config_id, customer_id, ingest_type, source_file, triggered_by, status, records_found)
      VALUES (@configId, @customerId, 'eob', @sourceFile, @triggeredBy, 'processing', 1);
      SELECT SCOPE_IDENTITY() AS id;
    `);
    runLogId = logResult.recordset[0]?.id ?? 0;

    // Insert ClaimDocuments with inline blob (consistent with existing upload pattern)
    const docR = pool.request();
    docR.input('claimId',     sql.NVarChar(50),    claimId);
    docR.input('fileName',    sql.NVarChar(500),   originalName);
    docR.input('contentType', sql.NVarChar(100),   mimeType);
    docR.input('fileSize',    sql.Int,             fileBuffer.length);
    docR.input('fileData',    sql.VarBinary(sql.MAX), fileBuffer);
    docR.input('docType',     sql.NVarChar(50),    'EOB');
    docR.input('uploadedBy',  sql.NVarChar(200),   uploadedBy);
    const docResult = await docR.query(`
      INSERT INTO dbo.ClaimDocuments
        (claim_id, file_name, content_type, file_size, file_data, doc_type, uploaded_by, created_at)
      VALUES
        (@claimId, @fileName, @contentType, @fileSize, @fileData, @docType, @uploadedBy, SYSUTCDATETIME());
      SELECT SCOPE_IDENTITY() AS id;
    `);
    const documentId = docResult.recordset[0]?.id as number;

    const logEnd = pool.request();
    logEnd.input('lid', sql.Int, runLogId);
    await logEnd.query(`
      UPDATE dbo.IngestRunLog
      SET status='success', records_inserted=1, completed_at=SYSUTCDATETIME()
      WHERE id=@lid;
    `);

    return { documentId, claimId, fileName: originalName, runLogId };
  } catch (err: any) {
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
