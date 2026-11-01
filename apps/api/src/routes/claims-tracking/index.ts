import { Request, Response, Router } from 'express';
import sql, { IResult, ConnectionPool } from 'mssql';
import { IProcedureLineItem } from '../../models/claims-tracking/index';
import Database from '../../modules/db';
import { dbConfig } from '../../databaseManager';
import chalk from 'chalk';
import { claimsController } from '../../controllers/claims/index';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();
const router = Router();

router.post('/', claimsController.get);
router.post(
  '/status/update',
  claimsController.updateClaimStatusOverAPI,
);

router.get('/archives', async (req: Request, res: Response) => {
  try {
    if (pool) {
      //@ts-expect-error - not an error will deal with this later (tech debt)
      const locationIds = req.query.data.location_ids || [];

      const request = pool.request();

      if (Array.isArray(locationIds) && locationIds.length > 0) {
        request.input('locationIds', sql.NVarChar, locationIds.join(','));

        const query = `
          SELECT TOP 1000 *
          FROM ClaimsArchive
          WHERE location_id IN (SELECT value FROM STRING_SPLIT(@locationIds, ','))
        `;

        const result = await request.query(query);

        res.status(200).send({
          message: 'Connected successfully.',
          data: result.recordset,
        });
      } else {
        const queryAll = `SELECT TOP 1000 * FROM ClaimsArchive`;
        const resultAll = await request.query(queryAll);

        res.status(200).send({
          message: 'Connected successfully.',
          data: resultAll.recordset,
        });
      }
    } else {
      return res.status(503).json({ message: 'Service unavailable' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

router.post(
  '/archives/add',
  async (req: Request, res: Response) => {
    try {
      const { date_completed, location_id, claim_id } = req.body;
      // Check if any of the required parameters are missing
      if (!date_completed || !location_id || !claim_id) {
        return res.status(400).send({
          message:
            'Incomplete or invalid body parameters. Please provide all required parameters.',
        });
      }

      // const pool: ConnectionPool = await sql.connect(dbConfig)

      if (!pool) {
        return res.status(500).send({
          message: 'Unable to connect to the database pool.',
        });
      }

      // Check if a row with the same claim_id and location_id already exists
      const checkResult = await pool
        .request()
        .input('location_id', sql.Int, location_id)
        .input('claim_id', sql.VarChar, claim_id).query(`
        SELECT COUNT(*) AS count
        FROM [${dbConfig.database}].[dbo].[ClaimsArchive]
        WHERE
          [location_id] = @location_id
          AND [claim_id] = @claim_id
      `);

      const rowCount = checkResult.recordset[0].count;

      if (rowCount > 0) {
        // Row already exists, return a message or handle accordingly
        return res.status(400).send({
          message:
            'Row with the same location_id and claim_id already exists in the database.',
        });
      }

      // Insert the data into the ClaimsArchives table
      const insertResult = await pool
        .request()
        .input('date_completed', sql.Date, date_completed)
        .input('location_id', sql.Int, location_id)
        .input('claim_id', sql.VarChar, claim_id).query(`
        INSERT INTO [${dbConfig.database}].[dbo].[ClaimsArchive]
        ([date_completed], [location_id], [claim_id])
        VALUES
        (@date_completed, @location_id, @claim_id)
      `);

      res.status(201).json({ message: 'Archive added successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        message: 'Internal Server Error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
);
/**
 * Get procedures by claim ID
 * from the original claim
 */
router.get('/denials', async (req: Request, res: Response) => {
  try {
    if (pool) {
      // @ts-ignore
      const locationIds = req.query.data.location_ids || [];

      const request = pool.request();

      if (Array.isArray(locationIds) && locationIds.length > 0) {
        request.input('locationIds', sql.NVarChar, locationIds.join(','));

        const query = `
          SELECT P.*
          FROM Procedures P
          JOIN ClaimsTracking CT ON P.claim_id = CT.uid
          WHERE CT.location_id IN (SELECT value FROM STRING_SPLIT(@locationIds, ','))
        `;

        const result = await request.query(query);

        res
          .status(200)
          .send({ message: 'Connected successfully.', data: result.recordset });
      } else {
        res
          .status(400)
          .send({ message: 'Invalid or missing location_ids parameter.' });
      }
    } else {
      return res.status(503).json({ message: 'Service unavailable' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

router.get(
  '/:id/procedures',
  async (req: Request, res: Response) => {
    try {
      if (pool) {
        const claimId = req.params.id;

        const request = pool.request();
        request.input('claimId', sql.VarChar, claimId);

        const query = `
        SELECT *
        FROM Procedures
        WHERE claim_id = @claimId
      `;

        const result = await request.query(query);

        res.status(200).send({
          message: 'Procedures retrieved successfully.',
          data: result.recordset,
        });
      } else {
        res.status(400).send({ message: 'Error connecting to the database.' });
      }
    } catch (error) {
      console.error(chalk.white.bgRedBright(error));
      res.status(500).send({ message: 'Error processing the request.' });
    }
  },
);

/**
 * Claim Archives
 */

/**
 *
 * Update claim archive status by claim id
 */

router.patch(
  '/:id/update',
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { archived } = req.body;

    try {
      if (pool) {
        const request = pool.request();

        const query = `
        UPDATE ClaimsTracking
        SET archived = @archived
        WHERE uid = @id
      `;

        const result = await request
          .input('archived', sql.Bit, archived)
          .input('id', sql.VarChar, id)
          .query(query);

        if (result.rowsAffected[0] > 0) {
          res.status(200).send({ message: 'Claim updated successfully.' });
        } else {
          res.status(404).send({ message: 'Claim not found.' });
        }
      } else {
        return res.status(503).json({ message: 'Service unavailable' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: 'Internal server error' });
    }
  },
);

router.get(
  '/:id/procedures',
  async (req: Request, res: Response) => {
    try {
      if (pool) {
        const claimId = parseInt(req.params.id);

        const request = pool.request();
        request.input('claimId', sql.VarChar, claimId);

        const query = `
        SELECT *
        FROM Procedures
        WHERE claim_id = @claimId
      `;

        const result = await request.query(query);

        res.status(200).send({
          message: 'Procedures retrieved successfully.',
          data: result.recordset,
        });
      } else {
        res.status(400).send({ message: 'Error connecting to the database.' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: 'Error processing the request.' });
    }
  },
);

/**
 * Queue
 *
 *  @queue/procedure
 *
 * This endpoint is used to pull in procedure line items in
 * the queue so the checkbox state gets updated on the UI.
 *
 * This will also return an empty array to allow frontend to use the post point to
 * add procedure line item to the queue.
 *
 *
 */
router.get(
  '/queue/procedure',
  async (req: Request, res: Response) => {
    try {
      const { id, step } = req.query;

      if (!id)
        return res
          .status(400)
          .send({ message: 'Absent or invalid procedure ID' });

      if (!pool)
        return res
          .status(400)
          .send({ message: 'Unable to connect to the database pool.' });

      const result = await pool
        .request()
        .input('id', sql.Int, id)
        .input('step', sql.Int, step)
        .query(
          'SELECT claim_id, procedure_id, carc, step, completed FROM ClaimsQueue WHERE procedure_id = @id AND step = @step',
        );

      const procedureLineItems: IProcedureLineItem[] = result.recordset;

      res.status(200).json(procedureLineItems);
    } catch (error) {
      res.status(500).send({
        message: 'Internal Server Error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
);

router.get(
  '/queue/procedure-line-items',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.query;

      if (!id)
        return res
          .status(400)
          .send({ message: 'Absent or invalid procedure ID' });

      if (!pool)
        return res
          .status(400)
          .send({ message: 'Unable to connect to the database pool.' });

      const result = await pool
        .request()
        .input('id', sql.Int, id)
        .query(
          'SELECT claim_id, procedure_id, carc, step, completed FROM ClaimsQueue WHERE procedure_id = @id',
        );

      const procedureLineItems: IProcedureLineItem[] = result.recordset;

      res.status(200).json(procedureLineItems);
    } catch (error) {
      res.status(500).send({
        message: 'Internal Server Error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
);
/** Gets procedure line items from claim queue */
router.post(
  '/queue/add',
  async (req: Request, res: Response) => {
    try {
      const { carc, claim_id, completed, procedure_id, step, progress } =
        req.query;

      console.log('Adding new queue record for claim', claim_id);

      console.log('Progress for claim ' + claim_id + ': ' + progress);

      if (!carc || !claim_id || !procedure_id || !step)
        return res.status(400).send({
          message:
            'Incomplete or invalid query parameters. Please provide all required parameters.',
        });

      if (!pool)
        return res
          .status(400)
          .send({ message: 'Unable to connect to the database pool.' });

      // Checks to see if the specified queue record exists in the database
      const checkResult = await pool
        .request()
        .input('claim_id', sql.VarChar, claim_id)
        .input('procedure_id', sql.Int, procedure_id)
        .input('step', sql.Int, step)
        .input('carc', sql.NVarChar(255), carc)
        .input('completed', sql.Int, completed).query(`
        SELECT COUNT(*) AS count
        FROM [${dbConfig.database}].[dbo].[ClaimsQueue]
        WHERE
          [claim_id] = @claim_id
          AND [procedure_id] = @procedure_id
          AND [step] = @step
          AND [carc] = @carc
      `);

      const rowCount = checkResult.recordset[0].count;

      // Rejects insert if record exists. This will be used to tell the component using this function to call update function instead
      if (rowCount > 0) {
        console.log(
          'Record already existing, aborting insert for claim; ' +
            claim_id +
            ': ' +
            progress,
        );

        return res.status(400).send({
          message:
            'Row with the same parameters already exists in the database.',
        });
      }
      // insert queue record
      await pool
        .request()
        .input('claim_id', sql.VarChar, claim_id)
        .input('procedure_id', sql.Int, procedure_id)
        .input('step', sql.Int, step)
        .input('carc', sql.NVarChar(255), carc)
        .input('completed', sql.Int, completed).query(`
      INSERT INTO [${dbConfig.database}].[dbo].[ClaimsQueue]
      ([claim_id], [procedure_id], [carc], [completed], [step])
      VALUES
      (@claim_id, @procedure_id, @carc, @completed, @step)
    `);

      //record claim progress

      await pool
        .request()
        .input('claim_id', sql.VarChar, claim_id) // Assuming claim_id is used to identify the specific claim
        .input('progress', sql.Int, progress).query(`
      UPDATE [${dbConfig.database}].[dbo].[ClaimsTracking]
      SET [progress] = @progress
      WHERE [uid] = @claim_id  
    `);

      res.status(200).json({ message: 'Data added successfully' });
    } catch (error) {
      console.log('Unable to add claim queue record', error);

      res.status(500).send({
        message: 'Internal Server Error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
);

/**
 * Updated procedure line
 * item completion status
 */

router.patch(
  '/queue/update/:id',
  async (req: Request, res: Response) => {
    try {
      const { claim_id, procedure_id, step, completed, progress } = req.query;

      // Check if any of the required parameters are missing
      if (!claim_id || !procedure_id || !step || completed === undefined) {
        return res.status(400).send({
          message:
            'Incomplete or invalid query parameters. Please provide all required parameters.',
        });
      }

      if (!pool) {
        return res.status(400).send({
          message: 'Unable to connect to the database pool.',
        });
      }

      // Check if a row with the specified parameters exists
      const checkResult = await pool
        .request()
        .input('claim_id', sql.VarChar, claim_id)
        .input('procedure_id', sql.Int, procedure_id)
        .input('step', sql.Int, step).query(`
        SELECT COUNT(*) AS count
        FROM [${dbConfig.database}].[dbo].[ClaimsQueue]
        WHERE
          [claim_id] = @claim_id
          AND [procedure_id] = @procedure_id
          AND [step] = @step
      `);

      const rowCount = checkResult.recordset[0].count;

      if (rowCount === 0) {
        // Row does not exist, return a message or handle accordingly
        return res.status(400).send({
          message: 'No matching row found in the database.',
        });
      }

      // Update the completed value in the ClaimsQueue table
      await pool
        .request()
        .input('claim_id', sql.VarChar, claim_id)
        .input('procedure_id', sql.Int, procedure_id)
        .input('step', sql.Int, step)
        .input('completed', sql.Int, completed).query(`
        UPDATE [${dbConfig.database}].[dbo].[ClaimsQueue]
        SET [completed] = @completed
        WHERE
          [claim_id] = @claim_id
          AND [procedure_id] = @procedure_id
          AND [step] = @step
      `);

      await pool
        .request()
        .input('claim_id', sql.VarChar, claim_id) // Assuming claim_id is used to identify the specific claim
        .input('progress', sql.Int, progress).query(`
        UPDATE [${dbConfig.database}].[dbo].[ClaimsTracking]
        SET [progress] = @progress
        WHERE [uid] = @claim_id  
      `);

      res.status(200).json({ message: 'Completed value updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        message: 'Internal Server Error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
);

router.get(
  '/queue/claim/procedure-line-items',
  async (req: Request, res: Response) => {
    console.log('claims/queue/claim/procedure-line-items');

    try {
      const { id } = req.query;

      if (!id)
        return res.status(400).send({ message: 'Absent or invalid claim ID' });
      if (!pool)
        return res
          .status(400)
          .send({ message: 'Unable to connect to the database pool.' });

      const result = await pool
        .request()
        .input('id', sql.Int, id)
        .query(
          'SELECT claim_id, procedure_id, carc, step, completed FROM ClaimsQueue WHERE claim_id = @id',
        );

      const procedureLineItems: IProcedureLineItem[] = result.recordset;

      res.status(200).json(procedureLineItems);
    } catch (error) {
      res.status(500).send({
        message: 'Internal Server Error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
);

router.patch(
  '/queue/progress/update/:id',
  async (req: Request, res: Response) => {
    try {
      const { claim_id, progress } = req.query;

      console.log('Updating claim progress for claim; ', claim_id);

      // Check if any of the required parameters are missing
      if (!claim_id || !progress) {
        return res.status(400).send({
          message:
            'Incomplete or invalid query parameters. Please provide all required parameters to update claim progress.',
        });
      }

      if (!pool) {
        return res.status(400).send({
          message: 'Unable to connect to the database pool.',
        });
      }

      await pool
        .request()
        .input('claim_id', sql.VarChar, claim_id) // Assuming claim_id is used to identify the specific claim
        .input('progress', sql.Int, progress).query(`
      UPDATE [${dbConfig.database}].[dbo].[ClaimsTracking]
      SET [progress] = @progress
      WHERE [uid] = @claim_id  
    `);

      res.status(200).json({ message: 'Claim progress updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        message: 'Internal Server Error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
);

router.post(
  '/claim-counts-dos',
  async (req: Request, res: Response) => {
    if (!pool)
      return res
        .status(400)
        .send({ message: 'Unable to connect to the database pool.' });

    try {
      const { customer_id, months_ago } = req.body;

      if (!customer_id)
        return res
          .status(400)
          .send({ message: 'Absent or invalid customer_id' });

      if (months_ago == null || isNaN(months_ago)) {
        return res
          .status(400)
          .send({ message: 'Absent or invalid months_ago value' });
      }

      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - months_ago);
      const formattedDateThreshold = dateThreshold.toISOString().split('T')[0];

      // Optimized query to fetch procedures and join claims and locations in a single call
      const proceduresResult = await pool
        .request()
        .input('customer_id', sql.VarChar, customer_id)
        .input('dateThreshold', sql.Date, formattedDateThreshold).query(`
          SELECT 
              p.*,
              c.payer_837 AS payer,
              c.uid AS claim_id
          FROM Procedures p
          INNER JOIN ClaimsTracking c ON p.claim_id = c.uid
          INNER JOIN Locations l ON c.location_id = l.uid
          WHERE l.customer_id = @customer_id
            AND p.date_of_service >= @dateThreshold
            AND p.claim_id IS NOT NULL
            AND c.location_id IS NOT NULL
      `);

      const proceduresData = proceduresResult.recordset;

      res.status(200).json(proceduresData);
    } catch (error) {
      console.error('Error processing claim-counts-dos:', error);
      res.status(500).send({
        message: 'Internal Server Error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
);

/**
 * Posts a procedure line item
 * to the database using claim_id,
 * procedure_id, step number, carc
 * code and completed status.
 */
export default router;
