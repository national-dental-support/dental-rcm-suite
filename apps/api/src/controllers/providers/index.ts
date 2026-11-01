import { Request, Response } from 'express';
import { IResult, ConnectionPool } from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';

/**
 * Controller class to handle fetching unique providers.
 */
export class ProvidersController {
  private pool: ConnectionPool;

  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
  }

  /**
   * Fetches a unique list of providers from the ProviderName column in alphabetical order.
   */
  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      console.log(
        chalk.greenBright('ProvidersController; get; Fetching unique providers.'),
      );

      const request = this.pool.request();

      const result: IResult<{ provider: string }> = await request.query(`
        SELECT name AS provider
        FROM dbo.ProviderCatalog
        WHERE status = 'active'
        ORDER BY name ASC;
      `);

      const uniqueProviders = result.recordset.map((record) => record.provider);

      console.log(
        chalk.greenBright(
          `ProvidersController; get; Retrieved ${uniqueProviders.length} unique providers.`,
        ),
      );

      return res.status(200).json({
        data: uniqueProviders,
      });
    } catch (err) {
      console.error(
        chalk.bgRed.white('ProvidersController; get; Error fetching providers:'),
        err,
      );

      return res.status(500).json({
        message: 'Internal server error',
        
      });
    }
  };
}

export const providersController = new ProvidersController();
