import { Router, Request, Response } from 'express';
import { DatabaseConnectionController } from '../../controllers/database-connection-controller';

class ClearinghouseConnectionsController extends DatabaseConnectionController {
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const { recordset } = await this.pool.request().query(`
        SELECT id, customer_id, connection_name, payer_id, is_active, last_era_fetch_at
        FROM ClearinghouseConnection
        WHERE is_active = 1
          AND sftp_host IS NOT NULL
        ORDER BY connection_name
      `);
      res.json({ rows: recordset });
    } catch {
      res.json({ rows: [] });
    }
  };
}

const router = Router();
const ctrl = new ClearinghouseConnectionsController();
router.get('/', ctrl.list);

export default router;
