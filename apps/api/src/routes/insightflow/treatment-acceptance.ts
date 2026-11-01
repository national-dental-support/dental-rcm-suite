import { Router, Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';

const router = Router();
const getPool = () => Database.getInstance().getPool();

function tenantFilter(req: Request) {
  const custId: number | null = (req as any).actor?.customer_id ?? null;
  if (custId == null) return { filter: '', bind: (r: sql.Request) => r };
  return {
    filter: `AND tp.customer_id = @_custId`,
    bind: (r: sql.Request) => { r.input('_custId', sql.Int, custId); return r; },
  };
}

function arrParam(req: Request, key: string): string[] {
  const raw = req.query[key];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw as string[] : [String(raw)];
  return arr.map(v => v.trim()).filter(Boolean);
}

// GET /treatment-acceptance/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const pool = getPool();

    const providerVals = arrParam(req, 'providers');
    const pvNames = providerVals.map((_, i) => `@_taPv${i}`);
    const pvFilter = providerVals.length
      ? `AND tp.provider_name IN (${pvNames.join(',')})`
      : '';

    const dateFrom = req.query['dateFrom'] as string || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const dateTo = req.query['dateTo'] as string || new Date().toISOString().slice(0, 10);

    const r = pool.request();
    tf.bind(r);
    providerVals.forEach((v, i) => r.input(`_taPv${i}`, sql.NVarChar, v));
    r.input('_from', sql.Date, dateFrom);
    r.input('_to', sql.Date, dateTo);

    const result = await r.query(`
      -- Overall summary
      SELECT
        COUNT(*)                                        AS totalPlans,
        SUM(tp.amount_presented)                        AS totalPresented,
        SUM(tp.amount_accepted)                         AS totalAccepted,
        CASE WHEN SUM(tp.amount_presented) > 0
          THEN ROUND(SUM(tp.amount_accepted) / SUM(tp.amount_presented) * 100, 1)
          ELSE 0 END                                    AS acceptanceRate
      FROM dbo.treatment_plans tp
      WHERE tp.plan_date BETWEEN @_from AND @_to
        ${tf.filter} ${pvFilter};

      -- By treatment type
      SELECT
        tp.treatment_type                               AS treatmentType,
        COUNT(*)                                        AS totalPlans,
        SUM(tp.amount_presented)                        AS totalPresented,
        SUM(tp.amount_accepted)                         AS totalAccepted,
        CASE WHEN SUM(tp.amount_presented) > 0
          THEN ROUND(SUM(tp.amount_accepted) / SUM(tp.amount_presented) * 100, 1)
          ELSE 0 END                                    AS acceptanceRate
      FROM dbo.treatment_plans tp
      WHERE tp.plan_date BETWEEN @_from AND @_to
        ${tf.filter} ${pvFilter}
      GROUP BY tp.treatment_type
      ORDER BY totalPresented DESC;
    `);

    const rs = result.recordsets as any[][];
    const overall = rs[0]?.[0] ?? { totalPlans: 0, totalPresented: 0, totalAccepted: 0, acceptanceRate: 0 };
    const byType = rs[1] ?? [];

    const ragForRate = (rate: number): 'green' | 'amber' | 'red' => {
      if (rate >= 80) return 'green';
      if (rate >= 60) return 'amber';
      return 'red';
    };

    res.json({
      overall: { ...overall, rag: ragForRate(Number(overall.acceptanceRate)) },
      byType: byType.map((r: any) => ({ ...r, rag: ragForRate(Number(r.acceptanceRate)) })),
      dateFrom,
      dateTo,
    });
  } catch (e: any) {
    console.error('treatment-acceptance/summary error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /treatment-acceptance/trend
router.get('/trend', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const pool = getPool();

    const r = pool.request();
    tf.bind(r);

    const result = await r.query(`
      SELECT
        FORMAT(tp.plan_date, 'yyyy-MM')                 AS month,
        COUNT(*)                                        AS totalPlans,
        SUM(tp.amount_presented)                        AS totalPresented,
        SUM(tp.amount_accepted)                         AS totalAccepted,
        CASE WHEN SUM(tp.amount_presented) > 0
          THEN ROUND(SUM(tp.amount_accepted) / SUM(tp.amount_presented) * 100, 1)
          ELSE 0 END                                    AS acceptanceRate
      FROM dbo.treatment_plans tp
      WHERE tp.plan_date >= DATEADD(MONTH, -12, GETDATE())
        ${tf.filter}
      GROUP BY FORMAT(tp.plan_date, 'yyyy-MM')
      ORDER BY month ASC;
    `);

    res.json({ trend: result.recordset ?? [] });
  } catch (e: any) {
    console.error('treatment-acceptance/trend error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
