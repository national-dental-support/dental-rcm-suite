import { Request, Response, Router } from 'express';
import sql from 'mssql';
import Database from '../../../modules/db';
import rateLimit from 'express-rate-limit';
import { sourceDataController } from '../../../controllers/analytics/source-data';
import { csvController } from '../../../controllers/csv';

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
// });

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();

const router = Router();

router.post('/', sourceDataController.get);
router.post('/export', csvController.export);

export default router;
