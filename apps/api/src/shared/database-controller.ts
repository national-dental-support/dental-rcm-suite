import { Request, Response } from 'express';
import sql, { ConnectionPool } from 'mssql';
import Database from '../modules/db';

/**
 * Abstract base controller class providing a standard structure for all controllers.
 * It initializes a connection pool that derived classes can use to interact with the database.
 *
 * @abstract
 * @class BaseController
 */
export abstract class BaseController {
  /**
   * @protected
   * @type {ConnectionPool}
   * @description The connection pool for database operations.
   */
  protected pool: ConnectionPool;

  /**
   * Creates an instance of the BaseController.
   * Initializes the database connection pool using a singleton instance of the Database module.
   *
   * @constructor
   * @throws Will throw an error if the connection pool fails to initialize.
   */
  constructor() {
    // Get the singleton instance of the database
    const databaseInstance = Database.getInstance();
    // Set the connection pool; if the pool is not available, it will throw an error
    this.pool = databaseInstance.getPool();
  }
}
