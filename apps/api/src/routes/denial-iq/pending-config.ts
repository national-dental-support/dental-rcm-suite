import express from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../controllers/database-connection-controller';
import logger from '../../utils/logger';
import { requireRole } from '../../middleware/require-role';

const router = express.Router();

class PendingConfigController extends DatabaseConnectionController {
  constructor() { super(); }

  public get = async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const result = await this.pool.request().query(`
        SELECT customer_id, pending_days, updated_by, updated_at
        FROM dbo.ClaimPendingConfig
        ORDER BY customer_id
      `);
      res.json({ data: result.recordset });
    } catch (err) {
      logger.error('PendingConfig.get error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public patch = async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { customer_id, pending_days } = req.body;
      if (!customer_id || pending_days == null) {
        res.status(400).json({ message: 'customer_id and pending_days are required' });
        return;
      }
      const days = Math.max(1, Math.min(365, Number(pending_days)));
      const actorEmail = (req as any).user?.email ?? 'unknown';

      const request = this.pool.request();
      request.input('CustId',      sql.SmallInt,    customer_id);
      request.input('Days',        sql.Int,          days);
      request.input('UpdatedBy',   sql.NVarChar(255), actorEmail);
      await request.query(`
        IF EXISTS (SELECT 1 FROM dbo.ClaimPendingConfig WHERE customer_id = @CustId)
          UPDATE dbo.ClaimPendingConfig
          SET pending_days = @Days, updated_by = @UpdatedBy, updated_at = GETDATE()
          WHERE customer_id = @CustId
        ELSE
          INSERT INTO dbo.ClaimPendingConfig (customer_id, pending_days, updated_by)
          VALUES (@CustId, @Days, @UpdatedBy)
      `);

      res.json({ message: 'Pending config updated', customer_id, pending_days: days });
    } catch (err) {
      logger.error('PendingConfig.patch error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

const ctrl = new PendingConfigController();
router.get('/', ctrl.get);
router.patch('/', requireRole('Admin'), ctrl.patch);

export default router;
