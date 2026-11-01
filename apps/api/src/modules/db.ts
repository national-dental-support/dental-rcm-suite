import sql, { ConnectionPool, config } from 'mssql';
import { dbConfig } from '../databaseManager';
import { installRls } from './rls-context';
import os from 'os';
import axios from 'axios';
import chalk from 'chalk'; // Import chalk

// Commenting out the Winston logger configuration
/*
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'database-logs.log' })
  ],
});
*/

// Console log utility function with chalk
const logInfo = (message: string, details: any = {}) => {
  console.log(chalk.green(`[INFO] ${message}`), details);
};

const logError = (message: string, details: any = {}) => {
  console.error(chalk.red(`[ERROR] ${message}`), details);
};

// Extract the FULL mssql/tedious error shape so we can see WHY a connection was rejected.
// SQL error 18456 (Login failed) carries a STATE that is the real diagnosis:
//   8 = bad password, 40/42 = DB paused/unavailable (serverless resume), 7/38 = disabled,
//   5/2 = invalid userid, 146xx = throttling/resource limit. Never logs the password.
const errDetail = (err: any) => ({
  errorMessage: err?.message,
  number: err?.number ?? err?.originalError?.info?.number ?? err?.originalError?.number,
  state: err?.state ?? err?.originalError?.info?.state ?? err?.originalError?.state,
  class: err?.class ?? err?.originalError?.info?.class,
  errCode: err?.code,
  errName: err?.name,
  target: `${dbConfig.server}/${dbConfig.database}`,
});

// A public-IP lookup used to live here: every database connect, and every
// failed connect, called an external address service and logged the host's
// public IP. It is gone. An installation of this suite makes no outbound call
// of its own accord, and the address of a machine handling PHI does not belong
// in a log line. The local interface address below is enough to tell two
// instances apart.

/**
 * Fetches the server's primary non-internal IPv4 address.
 * This is typically the private IP used in the local network.
 * @returns {string} The primary non-internal IPv4 address or 'unknown' if not found.
 */
function getServerIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const netInterface of Object.values(interfaces)) {
    if (netInterface) {
      for (const net of netInterface) {
        if (!net.internal && net.family === 'IPv4') {
          return net.address;
        }
      }
    }
  }
  /* istanbul ignore next */
  return 'unknown';
}

/**
 * Singleton class representing a database connection.
 * Uses Microsoft's SQL Server (MSSQL) through the `mssql` package.
 */
class Database {
  private static instance: Database; // Singleton instance

  private pool: ConnectionPool; // Connection pool to manage SQL connections

  /**
   * Database constructor is private to enforce Singleton pattern.
   * Initializes the connection pool and attempts to connect to the database.
   */
  private constructor() {
    // RLS: wrap so every request() sets SESSION_CONTEXT('customer_id') in the same
    // batch as its query -> DB-enforced fail-closed tenant isolation. Wrapping the
    // singleton pool once (before connect) covers all callers of getPool().
    this.pool = installRls(new sql.ConnectionPool(dbConfig as config));
    // Prevent unhandled 'error' events from crashing the process when a
    // pooled connection drops or a reconnect attempt fails.
    /* istanbul ignore next */
    this.pool.on('error', (err: Error) => {
      logError('Connection pool error (non-fatal)', errDetail(err));
    });
    this.initDb();
    this.startHealthCheck();
  }

  /**
   * Provides access to the Singleton instance of the Database class.
   * @returns {Database} The singleton instance of the Database class.
   */
  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }

    return Database.instance;
  }

  /**
   * Initializes the database connection and logs the outcome.
   * Records connection success or logs detailed error information.
   * @private
   * @throws Will throw an error if the database connection fails.
   */
  private async initDb(): Promise<void> {
    try {
      await this.pool.connect();

      const serverIpAddress = getServerIpAddress();

      logInfo('Successful connection to MSSQL', {
        timestamp: new Date().toISOString(),
        service: 'db.ts',
        serverIpAddress,
      });

      /* istanbul ignore next */
      logInfo('Database health check', {
        healthStatus: this.pool.healthy ? 'NORMAL' : 'UNHEALTHY',
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const err = error as Error;

      const serverIpAddress = getServerIpAddress();

      logError('Database connection failed (will retry on first request)', {
        ipAddress: serverIpAddress,
        ...errDetail(err),
        time: new Date().toISOString(),
      });
    }
  }

  /**
   * Retrieves the database connection pool.
   * If the pool is not connected, attempts to reconnect automatically.
   * @returns {ConnectionPool} The mssql ConnectionPool instance.
   */
  public getPool(): ConnectionPool {
    // Do NOT trigger a reconnect here. This used to fire on EVERY query when the pool was
    // briefly not-connected; with concurrent callers that produced a thundering herd of
    // pool.close()+connect() on the shared pool - turning any transient blip into a
    // self-sustaining "Login failed" storm. The 30s health check (single-flight, below) is
    // the sole reconnect driver; the mssql pool also self-heals individual connections.
    return this.pool;
  }

  private _reconnecting: Promise<void> | null = null;
  private _lastReconnectAt = 0;

  /**
   * Reconnects by closing and re-opening the SAME pool object.
   * All callers that captured `getPool()` at module load keep their reference valid.
   * SINGLE-FLIGHT + cooldown: at most one reconnect runs at a time (concurrent callers are
   * no-ops that share the in-flight attempt), and reconnects cannot fire faster than every
   * 5s. This is what stops the thundering-herd storm - a transient blip triggers ONE
   * controlled reconnect, not hundreds of racing close()/connect() calls on the shared pool.
   */
  private reconnect(): void {
    if (this._reconnecting) return;                       // already reconnecting - share it
    const now = Date.now();
    if (now - this._lastReconnectAt < 5000) return;       // cooldown - never busy-loop
    this._lastReconnectAt = now;
    this._reconnecting = (async () => {
      try { await this.pool.close().catch(() => {}); await this.connectWithRetry(); }
      finally { this._reconnecting = null; }
    })();
  }

  /**
   * Attempts to connect with exponential backoff (3 retries, 2s/4s/8s delays).
   */
  private async connectWithRetry(maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.pool.connect();
        logInfo('Pool reconnected successfully.');
        this._healthCheckFailures = 0;
        return;
      } catch (err: any) {
        if (attempt === maxRetries) {
          logError(`Pool reconnect failed after ${maxRetries + 1} attempts`, errDetail(err));
          return;
        }
        // Exponential backoff with jitter so parallel workers do not resynchronize.
        const base = Math.min(2000 * Math.pow(2, attempt), 10000);
        const delay = base + Math.floor(Math.random() * 1000);
        logError(`Pool reconnect attempt ${attempt + 1} failed - retrying in ${delay}ms`, errDetail(err));
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  private _healthCheckFailures = 0;

  /**
   * Starts a proactive health-check every 30 seconds.
   * Requires 2 consecutive failures before reconnecting - prevents a single
   * transient Azure SQL blip from destroying the pool and causing a cascade
   * of "Connection is closed" errors for all in-flight requests.
   */
  private startHealthCheck(): void {
    /* istanbul ignore next */
    setInterval(async () => {
      try {
        await this.pool.request().query('SELECT 1 AS ping');
        this._healthCheckFailures = 0;
      } catch (err: any) {
        this._healthCheckFailures++;
        if (this._healthCheckFailures >= 2 && !this.pool.connecting) {
          logError(`[DB] Health check failed ${this._healthCheckFailures}x - triggering reconnect`, errDetail(err));
          this._healthCheckFailures = 0;
          this.reconnect();
        } else {
          logError(`[DB] Health check failed (${this._healthCheckFailures}/2) - will reconnect on next failure`, errDetail(err));
        }
      }
    }, 30_000);
  }
}

export const databaseInstance = Database.getInstance();
export default Database;
