import { Request, Response, Router } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';

const databaseInstance = Database.getInstance();

const pool = databaseInstance.getPool();

const router = Router();

// GetRoles (Admin)
router.post('/', async (req: Request, res: Response) => {
  console.log('/roles');
  try {
    if (pool) {
      const result = await pool.request().query(`SELECT * FROM Roles`);

      res.status(200).send({
        message: 'Connected successfully.',
        data: result.recordset,
      });
    }
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: 'Is the database on? ' + error,
    });
  }
});

router.post('/id', async (req: Request, res: Response) => {
  console.log('/policies/id');

  const id: string | undefined = req.body.id;

  try {
    if (pool) {
      const result = await pool
        .request()
        .input('id', sql.NVarChar, id)
        .query(`SELECT * FROM Roles WHERE uid = @id`);

      res.status(200).send({
        message: 'Connected successfully.',
        data: result.recordset,
      });
    }
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: 'Is the database on? ' + error,
    });
  }
});

export default router;
