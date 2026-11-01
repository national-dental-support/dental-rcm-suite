import { Request, Response } from 'express';
import Database from '../../modules/db';
import sql from 'mssql';

/**
 * Denial Event controller - CRUD + query for the first-class DenialEvent entity.
 */

/** GET /denial-iq/denial-events?claimId= */
export async function listDenialEvents(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const claimId = req.query.claimId as string;
  const page = parseInt(req.query.page as string) || 0;
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 25, 100);

  let where = 'WHERE 1=1';
  const request = pool.request();

  if (claimId) {
    where += ' AND de.claim_id = @claimId';
    request.input('claimId', sql.NVarChar(50), claimId);
  }

  const scopeFilter = (req as any).scopeFilter;
  if (scopeFilter?.sql) where += ` AND de.${scopeFilter.sql}`;

  const result = await request.query(`
    SELECT de.*, c.code AS carc_description
    FROM dbo.DenialEvent de
    LEFT JOIN dbo.Carcs c ON c.code = de.carc_code
    ${where}
    ORDER BY de.denial_posting_date DESC, de.created_at DESC
    OFFSET ${page * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY
  `);

  const countResult = await pool.request().query(`
    SELECT COUNT(*) AS total FROM dbo.DenialEvent de ${where}
  `);

  res.json({
    data: result.recordset,
    totalCount: countResult.recordset[0]?.total || 0,
    page, pageSize,
  });
}

/** POST /denial-iq/denial-events */
export async function createDenialEvent(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const {
    claim_id, denial_class, carc_code, rarc_code, group_code,
    denied_amount, denial_posting_date, appeal_deadline,
    location_id, department_id, payer_id, source_system,
  } = req.body;

  if (!claim_id) return res.status(400).json({ message: 'claim_id is required' });

  const scopeFilter = (req as any).scopeFilter;
  const customerId = scopeFilter?.customerId;

  const result = await pool.request()
    .input('claim_id', sql.NVarChar(50), claim_id)
    .input('denial_class', sql.NVarChar(50), denial_class || null)
    .input('carc_code', sql.NVarChar(50), carc_code || null)
    .input('rarc_code', sql.NVarChar(50), rarc_code || null)
    .input('group_code', sql.NVarChar(10), group_code || null)
    .input('denied_amount', sql.Decimal(12, 2), denied_amount || null)
    .input('denial_posting_date', sql.Date, denial_posting_date || null)
    .input('appeal_deadline', sql.Date, appeal_deadline || null)
    .input('location_id', sql.Int, location_id || null)
    .input('department_id', sql.Int, department_id || null)
    .input('payer_id', sql.NVarChar(50), payer_id || null)
    .input('source_system', sql.NVarChar(100), source_system || 'denial-iq')
    .input('customer_id', sql.SmallInt, customerId)
    .query(`
      INSERT INTO dbo.DenialEvent
        (claim_id, denial_class, carc_code, rarc_code, group_code,
         denied_amount, denial_posting_date, appeal_deadline,
         location_id, department_id, payer_id, source_system, customer_id)
      OUTPUT INSERTED.*
      VALUES
        (@claim_id, @denial_class, @carc_code, @rarc_code, @group_code,
         @denied_amount, @denial_posting_date, @appeal_deadline,
         @location_id, @department_id, @payer_id, @source_system, @customer_id)
    `);

  // Also update claims.denial_posting_date if not set
  if (denial_posting_date) {
    await pool.request()
      .input('claimId', sql.NVarChar(50), claim_id)
      .input('dpd', sql.Date, denial_posting_date)
      .query(`
        UPDATE dbo.claims
        SET denial_posting_date = @dpd
        WHERE ClaimID = @claimId AND denial_posting_date IS NULL
      `);
  }

  res.status(201).json({ data: result.recordset[0] });
}

/** PATCH /denial-iq/denial-events/:id */
export async function updateDenialEvent(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const id = parseInt(req.params.id);
  const { status, recovered_amount, resolution_date } = req.body;

  const sets: string[] = ['updated_at = GETUTCDATE()'];
  const request = pool.request().input('id', sql.Int, id);

  if (status) { sets.push('status = @status'); request.input('status', sql.NVarChar(30), status); }
  if (recovered_amount !== undefined) { sets.push('recovered_amount = @recovered'); request.input('recovered', sql.Decimal(12, 2), recovered_amount); }
  if (resolution_date) { sets.push('resolution_date = @resDate'); request.input('resDate', sql.Date, resolution_date); }

  await request.query(`UPDATE dbo.DenialEvent SET ${sets.join(', ')} WHERE id = @id`);
  res.json({ ok: true });
}
