import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../database-connection-controller';
import logger from '../../utils/logger';
import chalk from 'chalk';
/**
 * Controller class to handle fetching all practice location data (also known as facilities).
 * 
 * This returns both the practice groups and the individual locations
 */

/**
 * Controller class to handle fetching all practice location data (also known as facilities).
 * Returns both the practice groups and the individual locations.
 */
export class PracticeGroupsController extends DatabaseConnectionController {
    constructor() {
      super();
    }
  
    /**
     * Fetches a unique, case-insensitive, alphabetically sorted list of PayableTo values across all databases.
     */
    public get = async (_req: Request, res: Response): Promise<Response> => {
      logger.info('PracticeGroupsController');
  
      try {
        const unionQuery = this.databases
          .map(
            (db) => `
            SELECT LTRIM(RTRIM(f.PayableTo)) AS PayableTo
            FROM dbo.edi_facilities f
            WHERE f.PayableTo IS NOT NULL AND LTRIM(RTRIM(f.PayableTo)) <> ''
          `
          )
          .join('\nUNION ALL\n');
  
        const finalQuery = `
          WITH AllPayableTo AS (
            ${unionQuery}
          ),
          Ranked AS (
            SELECT 
              PayableTo,
              ROW_NUMBER() OVER (PARTITION BY LOWER(PayableTo) ORDER BY PayableTo ASC) AS rn
            FROM AllPayableTo
          )
          SELECT PayableTo
          FROM Ranked
          WHERE rn = 1
          ORDER BY PayableTo ASC
        `;
  
        const result = await this.pool.request().query(finalQuery);
        const payableToArray = result.recordset.map((row) => row.PayableTo);
  
        return res.status(200).json(payableToArray);
      } catch (err) {
        console.error(
          chalk.bgRed.white('PracticeGroupsController; get; Error fetching PayableTo list:'),
          err
        );
  
        return res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    };
  }
  
  export const practiceGroupsController = new PracticeGroupsController();