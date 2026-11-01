import { Request, Response } from 'express';
import Database from '../../modules/db';
import sql from 'mssql';

/** GET /denial-iq/sla/config */
export async function getSlaConfig(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const scopeFilter = (req as any).scopeFilter;
  const customerFilter = scopeFilter?.sql ? `AND ${scopeFilter.sql}` : '';

  const result = await pool.request().query(`
    SELECT * FROM dbo.SlaConfig WHERE is_active = 1 ${customerFilter} ORDER BY queue_type, payer_class
  `);
  res.json({ data: result.recordset });
}

/** PUT /denial-iq/sla/config */
export async function upsertSlaConfig(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const { queue_type, payer_class, first_touch_hours, followup_max_hours, resolution_target_days } = req.body;
  const scopeFilter = (req as any).scopeFilter;
  const customerId = scopeFilter?.customerId;

  await pool.request()
    .input('customerId', sql.SmallInt, customerId)
    .input('queueType', sql.NVarChar(20), queue_type || null)
    .input('payerClass', sql.NVarChar(100), payer_class || null)
    .input('ftHours', sql.Int, first_touch_hours || 48)
    .input('fuHours', sql.Int, followup_max_hours || 72)
    .input('resDays', sql.Int, resolution_target_days || 30)
    .query(`
      MERGE dbo.SlaConfig AS target
      USING (SELECT @customerId AS cid, @queueType AS qt, @payerClass AS pc) AS source
      ON target.customer_id = source.cid
        AND ISNULL(target.queue_type, '') = ISNULL(source.qt, '')
        AND ISNULL(target.payer_class, '') = ISNULL(source.pc, '')
      WHEN MATCHED THEN
        UPDATE SET first_touch_hours = @ftHours, followup_max_hours = @fuHours,
                   resolution_target_days = @resDays, updated_at = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT (customer_id, queue_type, payer_class, first_touch_hours, followup_max_hours, resolution_target_days)
        VALUES (@customerId, @queueType, @payerClass, @ftHours, @fuHours, @resDays);
    `);
  res.json({ ok: true });
}

/** GET /denial-iq/sla/violations */
export async function getSlaViolations(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const open = req.query.open !== 'false';
  const scopeFilter = (req as any).scopeFilter;
  const customerFilter = scopeFilter?.sql ? `AND sv.${scopeFilter.sql}` : '';

  const result = await pool.request().query(`
    SELECT sv.*,
           u.FirstName + ' ' + u.LastName AS assigned_to_name
    FROM dbo.SlaViolation sv
    LEFT JOIN dbo.Users u ON u.userID = sv.assigned_to
    WHERE 1=1
      ${open ? 'AND sv.resolved_at IS NULL' : ''}
      ${customerFilter}
    ORDER BY sv.detected_at DESC
  `);
  res.json({ data: result.recordset });
}

/** GET /denial-iq/sla/summary */
export async function getSlaSummary(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const scopeFilter = (req as any).scopeFilter;
  const customerFilter = scopeFilter?.sql ? `AND sv.${scopeFilter.sql}` : '';

  const result = await pool.request().query(`
    SELECT
      violation_type,
      COUNT(*) AS total,
      SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) AS resolved_count,
      AVG(actual_hours) AS avg_hours_over
    FROM dbo.SlaViolation sv
    WHERE detected_at >= DATEADD(DAY, -30, GETUTCDATE())
      ${customerFilter}
    GROUP BY violation_type
  `);
  res.json({ data: result.recordset });
}
