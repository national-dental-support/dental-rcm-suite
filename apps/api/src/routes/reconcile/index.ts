import { Request, Response, Router } from 'express';
import sql from 'mssql';
import { IProcedureLineItem } from '../../models/claims-tracking/index';
import Database from '../../modules/db';
import { dbConfig } from '../../databaseManager';
import { IBankDeposit } from '../../models/reconcile';
import logger from '../../utils/logger';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();
const router = Router();

// Base route used to get all bank deposits for all location assignments
router.post(
  '/deposits',
  async (req: Request, res: Response) => {
    try {
      if (pool) {
        // @ts-ignore
        const locationIds: number[] = req.body.data.location_ids || [];

        const request = pool.request();

        if (Array.isArray(locationIds) && locationIds.length > 0) {
          request.input('locationIds', sql.NVarChar, locationIds.join(','));

          const query = `
          SELECT *
          FROM BankDeposits
          WHERE location_id IN (SELECT value FROM STRING_SPLIT(@locationIds, ','))
        `;
          const result = await request.query(query);

          res.status(200).send({
            message: 'Bank deposists retrieved successfully.',
            data: result.recordset as IBankDeposit[],
          });
        } else {
          res.status(400).send({
            message: 'Invalid or missing location_ids parameter.',
          });
        }
      }
    } catch (error) {
      logger.error('[Reconcile] deposits error:', error);

      res.status(500).send({
        message: 'Internal server error',
      });
    }
  },
);

router.get(
  '/payments/:id',
  async (req: Request, res: Response) => {
    try {
      if (pool) {
        // @ts-ignore
        const pId = parseInt(req.params.id);

        const request = pool.request();

        if (pId) {
          request.input('reference_id', sql.Int, pId);

          const query = `
          SELECT *
          FROM Payments
          WHERE
          reference_id = @reference_id
        `;
          const result = await request.query(query);

          res.status(200).send({
            message: 'Payments retrieved successfully.',
            data: result.recordset as IBankDeposit[],
          });
        } else {
          res.status(400).send({
            message: 'Invalid or missing location_ids parameter.',
          });
        }
      }
    } catch (error) {
      logger.error('[Reconcile] payments error:', error);

      res.status(500).send({
        message: 'Internal server error',
      });
    }
  },
);

export default router;
