import { Request, Response, Router } from 'express';
import { requireRole } from '../../middleware/require-role';
import sql from 'mssql';
import Database from '../../modules/db';
import rateLimit from 'express-rate-limit';
import { DenialManagementController } from '../../controllers/insightflow/denial-management';
import { ExecutiveSummaryController } from '../../controllers/insightflow/executive-summary';
import { DenialPredictionController } from '../../controllers/insightflow/denial-prediction';
import { HealthSummaryController } from '../../controllers/insightflow/health-summary';
import { KpisController } from '../../controllers/insightflow/kpis';
import { AdjustmentTypesController } from '../../controllers/insightflow/adjustment-types';

const databaseInstance = Database.getInstance();

const pool = databaseInstance.getPool();

const router = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

router.post(
  '/collections/all',
  limiter,
  requireRole('User'),
  async (req: Request, res: Response) => {
    if (!pool) {
      return res.status(503).json({ message: 'Service unavailable' });
    }

    try {
      const actor = (req as any).actor;
      const custId: number | null = actor?.customer_id ?? null;

      const request = pool.request();
      let custFilter = '';
      if (custId != null) {
        request.input('_custId', sql.Int, custId);
        custFilter = 'AND pay.customer_id = @_custId';
      }

      // Collections grouped by practice -> provider location, using Payment data.
      const result = await request.query(`
        SELECT
          COALESCE(pr.PracticeName, 'All Locations') AS PracticeName,
          COALESCE(pr.PracticeID, 0)                 AS PracticeID,
          pv.Location                                AS LocationName,
          SUM(pay.PayAmt)                            AS TotalCollections
        FROM dbo.Payment pay
        JOIN dbo.patient pt   ON pt.PatNum       = pay.PatNum
        JOIN dbo.provider pv  ON pv.ProviderID   = pt.PriProv
        LEFT JOIN dbo.location loc ON loc.LocationName = pv.Location
        LEFT JOIN dbo.practice pr  ON pr.PracticeID    = loc.PracticeID
        WHERE pay.PayAmt > 0
          AND pv.Location IS NOT NULL
          ${custFilter}
        GROUP BY pr.PracticeName, pr.PracticeID, pv.Location
        ORDER BY pr.PracticeName, pv.Location
      `);

      // Build the IRow[] shape: { id, name, data: [{ name, value }] }
      const practiceMap = new Map<number, { id: number; name: string; data: { name: string; value: number }[] }>();

      for (const row of result.recordset) {
        const pid: number = row.PracticeID ?? 0;
        if (!practiceMap.has(pid)) {
          practiceMap.set(pid, {
            id: pid,
            name: row.PracticeName ?? 'All Locations',
            data: [],
          });
        }
        practiceMap.get(pid)!.data.push({
          name: row.LocationName,
          value: row.TotalCollections ?? 0,
        });
      }

      const viewObject = Array.from(practiceMap.values());

      if (viewObject.length === 0) {
        return res.status(404).json({ message: 'No records found' });
      }

      return res.status(200).json(viewObject);
    } catch (error) {
      console.error('[insightflow/collections] error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

// Section health summary (drives landing-page status badges)
const healthCtrl = new HealthSummaryController();
router.get('/health', requireRole('User'), healthCtrl.getHealth);

// Executive Summary (cross-product KPIs)
const execCtrl = new ExecutiveSummaryController();
router.get('/executive-summary', requireRole('User'), execCtrl.getSummary);
router.get('/executive-summary/narrative', requireRole('User'), execCtrl.getNarrative);

// KPI Summary (collection, denial, first-pass, days-in-ar, year-over-year)
const kpisCtrl = new KpisController();
router.get('/kpis', requireRole('User'), kpisCtrl.getKpis);
router.get('/claim-events', requireRole('User'), kpisCtrl.getClaimEvents);

// Adjustment type categories (for KPI classification)
const adjCtrl = new AdjustmentTypesController();
router.get('/adjustment-types', requireRole('User'), adjCtrl.list);
router.post('/adjustment-types', requireRole('Admin'), adjCtrl.upsert);
router.delete('/adjustment-types/:id', requireRole('Admin'), adjCtrl.delete);

// Denial Management analytics endpoints
const denialCtrl = new DenialManagementController();
router.get('/filter-options', requireRole('User'), denialCtrl.getFilterOptions);
router.get('/denial-management/trend', requireRole('User'), denialCtrl.getTrend);
router.get('/denial-management/kpis', requireRole('User'), denialCtrl.getKpis);
router.get('/denial-management/top-reasons', requireRole('User'), denialCtrl.getTopReasons);
router.get('/denial-management/top-reasons/codes', requireRole('User'), denialCtrl.getCodesForGrouping);
router.get('/denial-management/top-reasons/claims', requireRole('User'), denialCtrl.getClaimsForCode);

// Denial Prediction Engine
const predCtrl = new DenialPredictionController();
router.get('/predictions/risk-summary', requireRole('User'), predCtrl.getRiskSummary);
router.get('/predictions/high-risk-claims', requireRole('User'), predCtrl.getHighRiskClaims);
router.get('/predictions/risk-by-payer', requireRole('User'), predCtrl.getRiskByPayer);
router.get('/predictions/risk-by-reason', requireRole('User'), predCtrl.getRiskByReason);
router.get('/predictions/risk-trend', requireRole('User'), predCtrl.getRiskTrend);
router.get('/predictions/score/:claimId', requireRole('User'), predCtrl.scoreClaimById);

export default router;
