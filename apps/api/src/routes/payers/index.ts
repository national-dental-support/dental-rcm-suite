import express, { Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';
import { payersController } from '../../controllers/payers';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();

const router = express.Router();

// GET /api/payers - return all payer names
router.get('/', payersController.get);

export default router;
