import { Request, Response } from 'express';
import { IResult } from 'mssql';
import chalk from 'chalk';
import { DatabaseConnectionController } from '../database-connection-controller';

export class LocationsController extends DatabaseConnectionController {
  constructor() {
    super()
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    console.log(chalk.blueBright('LocationsController; get; Received request.'));

    try {
      const locationResult: IResult<{ Name: string }> = await this.pool.request().query(`
        SELECT name AS Name
        FROM dbo.LocationCatalog
        WHERE status = 'active'
        ORDER BY name ASC;
      `);
      const locationNames = locationResult.recordset.map((record) => record.Name);

      return res.status(200).json({
        success: true,
        count: locationNames.length,
        data: locationNames,
      });
    } catch (err) {
      console.error(
        chalk.bgRed.white('LocationsController; get; Error fetching location names:'),
        err
      );

      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}

export const locationsController = new LocationsController();
