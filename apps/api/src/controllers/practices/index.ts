import { Request, Response } from 'express';
import sql, { IResult, ConnectionPool } from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';

/**
 * Controller class to handle fetching unique practices.
 */
export class PracticesController {
  private pool: ConnectionPool;

  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
  }

  /**
   * Fetches a unique list of practices from the Operations column in alphabetical order.
   */
  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      console.log(
        chalk.greenBright('PracticesController; get; Fetching unique practices.'),
      );

      const custId = (req as any).actor?.customer_id ?? null;
      const request = this.pool.request();
      let custFilter = '';
      let claimsFilter = '';
      if (custId) {
        request.input('cid', sql.Int, custId);
        custFilter = 'AND pg.customer_id = @cid';
        claimsFilter = 'AND c.customer_id = @cid';
      }

      // Return city-name values from GroupLocation - these match recon_report.Location
      // exactly, so the practice filter actually returns data. OrgPractice display names
      // (e.g. "Apple Valley Dental") are internal labels that don't exist in claim data.
      const result: IResult<{ practice: string }> = await request
        .query(`
          SELECT DISTINCT gl.location_name AS practice
          FROM dbo.GroupLocation gl
          JOIN dbo.PracticeGroup pg ON pg.id = gl.group_id
          WHERE ISNULL(pg.is_active, 1) = 1
            ${custFilter}
            AND EXISTS (
              SELECT 1 FROM dbo.recon_report rr
              JOIN dbo.claims c ON c.ClaimID = rr.ClaimID ${claimsFilter}
              WHERE rr.Location = gl.location_name
            )
          ORDER BY gl.location_name ASC
        `);

      const uniquePractices = result.recordset.map((record) => record.practice);

      console.log(
        chalk.greenBright(
          `PracticesController; get; Retrieved ${uniquePractices.length} unique practices.`,
        ),
      );

      return res.status(200).json({
        data: uniquePractices,
      });
    } catch (err) {
      console.error(
        chalk.bgRed.white('PracticesController; get; Error fetching practices:'),
        err,
      );

      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export const practicesController = new PracticesController();
