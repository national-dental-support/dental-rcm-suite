import { Request, Response, Router } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import rateLimit from 'express-rate-limit';
import { claimAssignmentsController } from '../../controllers/claim-assignments';

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();

const router = Router();

router.patch(
  '/update',
  limiter,
  claimAssignmentsController.update,
);

export default router;
