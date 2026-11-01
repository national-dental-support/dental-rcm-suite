import { Request, Response } from 'express';
import { IResult, ConnectionPool } from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';

/**
 * Controller class to handle fetching unique payers.
 */
export class PayersController {
  private pool: ConnectionPool;

  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
  }

  /**
   * Fetches a unique list of payers from the payer_837 column in alphabetical order.
   */
  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      console.log(
        chalk.greenBright('PayersController; get; Fetching unique payers.'),
      );

      const request = this.pool.request();

      const result: IResult<{ payer: string }> = await request.query(`
        SELECT name AS payer
        FROM dbo.PayerCatalog
        WHERE status = 'active'
        ORDER BY name ASC;
      `);

      const uniquePayers = result.recordset.map((record) => record.payer);

      console.log(
        chalk.greenBright(
          `PayersController; get; Retrieved ${uniquePayers.length} unique payers.`,
        ),
      );

      return res.status(200).json({
        data: uniquePayers,
      });
    } catch (err) {
      console.error(
        chalk.bgRed.white('PayersController; get; Error fetching payers:'),
        err,
      );

      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export const payersController = new PayersController();
