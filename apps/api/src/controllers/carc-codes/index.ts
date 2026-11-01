import { Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';

/**
 * Represents a controller for managing CARC codes.
 *
 * CARC codes, or "Claims Adjustment Reason Codes," are used in the healthcare industry
 * to explain adjustments or denials on insurance claims. Each CARC code provides a reason
 * for why a claim was adjusted or denied, helping in the claim adjudication process.
 */
export class CarcCodeController {
  private pool: sql.ConnectionPool;

  /**
   * Initializes a new instance of the CarcCodeController class.
   *
   * The constructor gets the database instance and assigns the connection pool to the class property.
   */
  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
  }

  /**
   * Retrieves a list of all CARC codes from the database.
   *
   * This method handles GET requests to the `/all` route. It queries the database to fetch
   * all CARC codes available and sends them in the response. If no CARC codes are found,
   * it responds with a 404 status code and an appropriate message.
   * In case of a database error, it responds with a 500 status code and an error message.
   *
   * @param req - The request object, which contains information about the HTTP request.
   * @param res - The response object, which is used to send a response to the client.
   */
  public getAllCarcCodes = async (req: Request, res: Response) => {
    try {
      if (this.pool) {
        const result = await this.pool.request().query('SELECT * FROM CARCs');
        if (result.recordset.length > 0) {
          console.log('CARC codes retrieved successfully');
          res.status(200).send(result.recordset);
        } else {
          res.status(404).send({ message: 'Unable to retrieve CARC codes' });
        }
      }
    } catch (error) {
      res.status(500).send({
        message: 'Is the database on? ' + error,
      });
    }
  };

  /**
   * Retrieves a specific CARC code by its code from the database.
   *
   * This method handles GET requests to the `/:carc` route, where `:carc` is a path parameter
   * representing the CARC code to be retrieved. It queries the database to fetch the CARC code
   * that matches the provided code. If the code is found, it returns the details of the code
   * in the response with a 200 status code. If the code is not found, it responds with a 404
   * status code and an appropriate message. In case of a database error, it responds with a 500
   * status code and an error message.
   *
   * @param req - The request object, which contains information about the HTTP request.
   * @param res - The response object, which is used to send a response to the client.
   */
  public getCarcCodeByCode = async (req: Request, res: Response) => {
    console.log('/:carc');

    try {
      const carcCode = req.params.carc;

      if (this.pool) {
        const result = await this.pool
          .request()
          .input('carcCode', sql.VarChar, carcCode)
          .query('SELECT * FROM CARCs WHERE code = @carcCode');

        if (result.recordset.length > 0) {
          res.status(200).send(result.recordset[0]);
        } else {
          res.status(404).send({ message: 'CARC code not found.' });
        }
      }
    } catch (error) {
      res.status(500).send({
        message: 'Is the database on? ' + error,
      });
    }
  };
}

export const carcCodeController = new CarcCodeController();
