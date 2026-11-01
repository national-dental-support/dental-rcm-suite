import express from 'express';
import Database from '../../modules/db';
import sql from 'mssql';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();

/** GET /denial-iq/escalation-paths */
router.get('/', async (req, res) => {
  const pool = Database.getInstance().getPool();
  const result = await pool.request().query(`
    SELECT ep.*,
      (SELECT eps.step_order, eps.escalate_to_role, eps.trigger_after_hours, eps.escalate_to_user_id
       FROM dbo.EscalationPathStep eps WHERE eps.path_id = ep.id
       ORDER BY eps.step_order FOR JSON PATH) AS steps
    FROM dbo.EscalationPath ep
    WHERE ep.is_active = 1
    ORDER BY ep.path_name
  `);
  res.json({ data: result.recordset });
});

/** POST /denial-iq/escalation-paths */
router.post('/', requireRole('Admin'), async (req, res) => {
  const pool = Database.getInstance().getPool();
  const { path_name, steps } = req.body;
  const scopeFilter = (req as any).scopeFilter;

  const pathResult = await pool.request()
    .input('name', sql.NVarChar(100), path_name)
    .input('customerId', sql.SmallInt, scopeFilter?.customerId)
    .query(`INSERT INTO dbo.EscalationPath (customer_id, path_name) OUTPUT INSERTED.* VALUES (@customerId, @name)`);

  const pathId = pathResult.recordset[0].id;

  if (Array.isArray(steps)) {
    for (const step of steps) {
      await pool.request()
        .input('pathId', sql.Int, pathId)
        .input('order', sql.Int, step.step_order)
        .input('role', sql.NVarChar(50), step.escalate_to_role)
        .input('hours', sql.Int, step.trigger_after_hours || 24)
        .input('userId', sql.Int, step.escalate_to_user_id || null)
        .query(`
          INSERT INTO dbo.EscalationPathStep (path_id, step_order, escalate_to_role, trigger_after_hours, escalate_to_user_id)
          VALUES (@pathId, @order, @role, @hours, @userId)
        `);
    }
  }

  res.status(201).json({ data: pathResult.recordset[0] });
});

export default router;
