import { Request, Response } from 'express';
import Database from '../../modules/db';
import sql from 'mssql';
import { extractCustomerId } from '../../utils/resolve-user-scope';

/** GET /denial-iq/data-quality/quarantine */
export async function listQuarantined(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const xenCustId = extractCustomerId(req);
  const status = (req.query.status as string) || 'open';
  const page = parseInt(req.query.page as string) || 0;
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 25, 100);

  const dataReq = pool.request()
    .input('status', sql.NVarChar(20), status);
  if (xenCustId != null) dataReq.input('_custId', sql.Int, xenCustId);
  const result = await dataReq.query(`
      SELECT dq.*, dqr.description AS rule_description
      FROM dbo.DataQuarantine dq
      LEFT JOIN dbo.DataQualityRule dqr ON dqr.rule_code = dq.rule_code
      WHERE dq.status = @status
        ${xenCustId != null ? 'AND dq.customer_id = @_custId' : ''}
      ORDER BY dq.created_at DESC
      OFFSET ${page * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `);

  const countReq = pool.request()
    .input('status', sql.NVarChar(20), status);
  if (xenCustId != null) countReq.input('_custId', sql.Int, xenCustId);
  const count = await countReq.query(`SELECT COUNT(*) AS total FROM dbo.DataQuarantine WHERE status = @status ${xenCustId != null ? 'AND customer_id = @_custId' : ''}`);

  res.json({ data: result.recordset, totalCount: count.recordset[0]?.total || 0, page, pageSize });
}

/** PATCH /denial-iq/data-quality/quarantine/:id */
export async function resolveQuarantined(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const id = parseInt(req.params.id);
  const { status, resolution_notes } = req.body;
  const scopeFilter = (req as any).scopeFilter;

  await pool.request()
    .input('id', sql.Int, id)
    .input('status', sql.NVarChar(20), status || 'resolved')
    .input('notes', sql.NVarChar(sql.MAX), resolution_notes || null)
    .input('userId', sql.Int, scopeFilter?.userId || null)
    .query(`
      UPDATE dbo.DataQuarantine
      SET status = @status, resolution_notes = @notes,
          resolved_by = @userId, resolved_at = GETUTCDATE()
      WHERE id = @id
    `);
  res.json({ ok: true });
}

/** GET /denial-iq/data-quality/duplicates */
export async function listDuplicates(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const xenCustId = extractCustomerId(req);
  const action = (req.query.action as string) || 'flagged';

  const dupReq = pool.request()
    .input('action', sql.NVarChar(30), action);
  if (xenCustId != null) dupReq.input('_custId', sql.Int, xenCustId);
  const result = await dupReq.query(`
      SELECT dl.*,
             u.FirstName + ' ' + u.LastName AS reviewed_by_name
      FROM dbo.ClaimDeduplicationLog dl
      LEFT JOIN dbo.Users u ON u.userID = dl.reviewed_by
      WHERE dl.action_taken = @action
        ${xenCustId != null ? 'AND dl.customer_id = @_custId' : ''}
      ORDER BY dl.created_at DESC
    `);
  res.json({ data: result.recordset });
}

/** PATCH /denial-iq/data-quality/duplicates/:id */
export async function resolveDuplicate(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const id = parseInt(req.params.id);
  const { action_taken } = req.body; // 'merged', 'rejected', 'accepted'
  const scopeFilter = (req as any).scopeFilter;

  await pool.request()
    .input('id', sql.Int, id)
    .input('action', sql.NVarChar(30), action_taken)
    .input('userId', sql.Int, scopeFilter?.userId || null)
    .query(`
      UPDATE dbo.ClaimDeduplicationLog
      SET action_taken = @action, reviewed_by = @userId, reviewed_at = GETUTCDATE()
      WHERE id = @id
    `);
  res.json({ ok: true });
}

/** GET /denial-iq/data-quality/stats */
export async function getDataQualityStats(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const xenCustId = extractCustomerId(req);

  const statsReq = pool.request();
  if (xenCustId != null) statsReq.input('_custId', sql.Int, xenCustId);
  const custFilter = xenCustId != null ? 'AND customer_id = @_custId' : '';
  const result = await statsReq.query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.DataQuarantine WHERE status = 'open' ${custFilter}) AS open_quarantine,
      (SELECT COUNT(*) FROM dbo.DataQuarantine WHERE status = 'resolved' ${custFilter}) AS resolved_quarantine,
      (SELECT COUNT(*) FROM dbo.ClaimDeduplicationLog WHERE action_taken = 'flagged' ${custFilter}) AS pending_duplicates,
      (SELECT COUNT(*) FROM dbo.claims WHERE data_quality_flags IS NOT NULL AND data_quality_flags != '[]' ${custFilter}) AS flagged_claims,
      (SELECT COUNT(*) FROM dbo.LateArrivingRecord WHERE applied = 0 ${custFilter}) AS pending_late_records
  `);
  res.json({ data: result.recordset[0] });
}

/** GET /denial-iq/data-quality/late-arriving */
export async function listLateArriving(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const xenCustId = extractCustomerId(req);
  const applied = req.query.applied === 'true';

  const lateReq = pool.request()
    .input('applied', sql.Bit, applied ? 1 : 0);
  if (xenCustId != null) lateReq.input('_custId', sql.Int, xenCustId);
  const result = await lateReq.query(`
      SELECT * FROM dbo.LateArrivingRecord
      WHERE applied = @applied
        ${xenCustId != null ? 'AND customer_id = @_custId' : ''}
      ORDER BY late_load DESC
    `);
  res.json({ data: result.recordset });
}
