import express, { Request, Response, Router } from 'express';
import sql, { Request as MSSQLRequest } from 'mssql';
import { IRemedyStep } from '../../models/remedy-steps/index';
import Database from '../../modules/db';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();
const router = Router();

router.get(
  '/:carc',
  async (req: Request, res: Response): Promise<IRemedyStep[] | void> => {
    try {
      if (pool) {
        const carcNumber: string = req.params.carc;

        const query: string = `
        SELECT * FROM RemedySteps
        WHERE carc_number = @carcNumber
      `;

        const request: MSSQLRequest = pool.request();
        request.input('carcNumber', sql.VarChar(255), carcNumber);

        const result = await request.query<IRemedyStep[]>(query);

        res.status(200).send({ data: result.recordset });
      }
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: 'Is the database on?' + error });
    }
  },
);

export default router;
