import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/require-role';
import sql from 'mssql';
import Database from '../../modules/db';

const router = Router();
const getPool = () => Database.getInstance().getPool();

function custId(req: Request): number | null {
  return (req as any).actor?.customer_id ?? null;
}

// GET /api/admin/provider-goals
router.get('/', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const cId = custId(req);
    const r = pool.request();
    r.input('cId', sql.Int, cId ?? 0);
    const result = await r.query(`
      SELECT id, provider_name AS providerName,
             daily_production_goal AS dailyProductionGoal,
             weekly_production_goal AS weeklyProductionGoal,
             CONVERT(varchar(20), updated_at, 120) AS updatedAt
      FROM dbo.provider_goals
      WHERE customer_id = @cId
      ORDER BY provider_name;
    `);
    res.json({ data: result.recordset });
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to load provider goals' });
  }
});

// PUT /api/admin/provider-goals - upsert by providerName
router.put('/', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const { providerName, dailyProductionGoal, weeklyProductionGoal } = req.body;
    if (!providerName?.trim()) return res.status(400).json({ message: 'providerName required' });
    const pool = getPool();
    const cId = custId(req) ?? 0;
    const r = pool.request();
    r.input('cId', sql.Int, cId);
    r.input('name', sql.NVarChar(255), providerName.trim());
    r.input('daily', sql.Decimal(12, 2), dailyProductionGoal ?? null);
    r.input('weekly', sql.Decimal(12, 2), weeklyProductionGoal ?? null);
    await r.query(`
      MERGE dbo.provider_goals AS tgt
      USING (SELECT @cId AS c, @name AS n) AS src
        ON tgt.customer_id = src.c AND tgt.provider_name = src.n
      WHEN MATCHED THEN
        UPDATE SET daily_production_goal = @daily,
                   weekly_production_goal = @weekly,
                   updated_at = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT (customer_id, provider_name, daily_production_goal, weekly_production_goal)
        VALUES (@cId, @name, @daily, @weekly);
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to save provider goal' });
  }
});

// DELETE /api/admin/provider-goals/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
    const pool = getPool();
    const cId = custId(req) ?? 0;
    const r = pool.request();
    r.input('id', sql.Int, id);
    r.input('cId', sql.Int, cId);
    await r.query(`DELETE FROM dbo.provider_goals WHERE id = @id AND customer_id = @cId`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to delete provider goal' });
  }
});

export default router;
