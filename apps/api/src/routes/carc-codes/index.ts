import { Request, Response, Router } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import rateLimit from 'express-rate-limit';
import { carcCodeController } from '../../controllers/carc-codes';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();

const router = Router();

router.get('/all', limiter, carcCodeController.getAllCarcCodes);
router.get(
  '/:carc',
  limiter,
  carcCodeController.getCarcCodeByCode,
);

export default router;
