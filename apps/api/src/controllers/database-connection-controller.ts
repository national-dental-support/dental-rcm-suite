import { ConnectionPool, RequestError, Request as SqlRequest } from 'mssql';
import sql from 'mssql';
import { Request as ExpressRequest } from 'express';
import Database from '../modules/db';
import logger from '../utils/logger';
import { databases } from '../shared/databases';
import { resolveToReconKeys } from '../utils/resolve-location-keys';
/**
 * DatabaseConnectionController class responsible for setting up and managing a 
 * SQL Server database connection pool using the mssql library
 * 
 * This is used in any sub classes that requires database connections. Also prevents more than one 
 * pool from opening at a time per application
 * 
 * Extending this controller will eliminate the need to initialize a new connection
 * reducing the amount of maintainence required in the future.
 * 
 * Time saved = $ saved :D
 * 
 * 
 * Singleton Design Pattern: https://refactoring.guru/design-patterns/singleton
 */
export interface IDatabaseProvider {
  getPool(): ConnectionPool;
}

export interface ILogger {
  info(message: string): void;
  error(message: string): void;
  warn(message: string): void;
}

export class DatabaseConnectionController {
  protected databases: typeof databases;
  private readonly _dbInstance: Database;
  private _poolOverride?: ConnectionPool;

  protected get pool(): ConnectionPool {
    return this._poolOverride ?? this._dbInstance.getPool();
  }

  protected set pool(p: ConnectionPool) {
    this._poolOverride = p;
  }

  constructor() {
    try {
      this._dbInstance = Database.getInstance();
      this.databases = databases;
      logger.info('Database connection pool initialized successfully.');
    }
    catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`Failed to initialize database connection pool: ${error.message}`);
      } else {
        logger.error('Failed to initialize database connection pool: Unknown error');
      }
      throw new Error('Database connection error');
    }
  }

  /**
   * Returns a SQL WHERE fragment + input-binder that restricts rows to the
   * caller's tenant. Reads customer_id from req.actor (set by resolveActor /
   * requireRole middleware). When customer_id is null the filter is a no-op.
   *
   * Usage:
   *   const { where, bind } = this.custFilter(req);
   *   const r = this.pool.request();
   *   bind(r);
   *   r.query(`SELECT ... FROM dbo.recon_report WHERE ... ${where}`);
   */
  protected custFilter(req: ExpressRequest): { where: string; bind: (r: SqlRequest) => void } {
    const custId: number | null = (req as any).actor?.customer_id ?? null;
    if (custId == null) return { where: '', bind: () => {} };
    return {
      where: 'AND customer_id = @_custId',
      bind: (r: SqlRequest) => { r.input('_custId', sql.Int, custId); },
    };
  }

  /**
   * Returns a SQL WHERE fragment + input-binder built from req.body.filters.
   * Handles: practice_groups (-> Operations), location (-> Location),
   *          provider (-> ProviderName), payer (-> InsuranceName).
   *
   * ignoreDates is reserved for future date-clause support; currently a no-op.
   *
   * Usage:
   *   const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);
   *   const r = this.pool.request();
   *   bindBody(r);
   *   r.query(`SELECT ... FROM dbo.recon_report WHERE ... ${custWhere} ${bodyWhere}`);
   */
  protected bodyFilter(
    req: ExpressRequest,
    { ignoreDates = false }: { ignoreDates?: boolean } = {},
  ): { where: string; bind: (r: SqlRequest) => void } {
    const filters = (req as any).body?.filters ?? {};
    const clauses: string[] = [];
    const binders: Array<(r: SqlRequest) => void> = [];

    const toArr = (v: any): string[] => {
      if (!v || v === 'all') return [];
      if (Array.isArray(v)) return (v as any[]).filter((x) => x && x !== 'all') as string[];
      return [];
    };

    // practice_groups -> Operations column
    const pgs = toArr(filters.practice_groups);
    if (pgs.length) {
      const params = pgs.map((_, i) => `@_bf_pg${i}`);
      clauses.push(`AND Operations IN (${params.join(',')})`);
      binders.push((r) => pgs.forEach((v, i) => r.input(`_bf_pg${i}`, sql.NVarChar(255), v)));
    }

    // location -> Location column
    const locs = toArr(filters.location);
    if (locs.length) {
      const params = locs.map((_, i) => `@_bf_loc${i}`);
      clauses.push(`AND Location IN (${params.join(',')})`);
      binders.push((r) => locs.forEach((v, i) => r.input(`_bf_loc${i}`, sql.NVarChar(255), v)));
    }

    // provider -> claim-based: find claims where the provider has charges
    const provs = toArr(filters.provider);
    if (provs.length) {
      const params = provs.map((_, i) => `@_bf_prov${i}`);
      clauses.push(`AND ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType='Charge' AND ProviderName IN (${params.join(',')}))`);
      binders.push((r) => provs.forEach((v, i) => r.input(`_bf_prov${i}`, sql.NVarChar(255), v)));
    }

    // payer -> InsuranceName column
    const payers = toArr(filters.payer);
    if (payers.length) {
      const params = payers.map((_, i) => `@_bf_payer${i}`);
      clauses.push(`AND InsuranceName IN (${params.join(',')})`);
      binders.push((r) => payers.forEach((v, i) => r.input(`_bf_payer${i}`, sql.NVarChar(255), v)));
    }

    if (!clauses.length) return { where: '', bind: () => {} };
    return {
      where: clauses.join(' '),
      bind: (r) => binders.forEach((b) => b(r)),
    };
  }

  /**
   * Async variant of bodyFilter that resolves org hierarchy names
   * (OrgPractice / OrgLocation) to the raw recon_report key values via
   * LocationNameMapping before building the WHERE clause.
   *
   * Use this in analytics controllers instead of bodyFilter() so that filter
   * selections from the global filter (which use org display names) correctly
   * match recon_report.Operations and recon_report.Location.
   */
  protected async bodyFilterResolved(
    req: ExpressRequest,
  ): Promise<{ where: string; bind: (r: SqlRequest) => void }> {
    const filters = (req as any).body?.filters ?? {};
    const customerId: number | null = (req as any).actor?.customer_id ?? null;

    const toArr = (v: any): string[] => {
      if (!v || v === 'all') return [];
      if (Array.isArray(v)) return (v as any[]).filter((x) => x && x !== 'all') as string[];
      return [];
    };

    const clauses: string[] = [];
    const binders: Array<(r: SqlRequest) => void> = [];

    // practice_groups -> resolve OrgPractice names -> Operations values
    const pgs = toArr(filters.practice_groups);
    if (pgs.length) {
      const resolved = customerId
        ? await resolveToReconKeys(this.pool, customerId, pgs, 'practice')
        : pgs;
      if (resolved.length) {
        const params = resolved.map((_, i) => `@_bfr_pg${i}`);
        clauses.push(`AND Operations IN (${params.join(',')})`);
        binders.push((r) => resolved.forEach((v, i) => r.input(`_bfr_pg${i}`, sql.NVarChar(255), v)));
      }
    }

    // location -> resolve OrgLocation names -> Location values
    const locs = toArr(filters.location);
    if (locs.length) {
      const resolved = customerId
        ? await resolveToReconKeys(this.pool, customerId, locs, 'location')
        : locs;
      if (resolved.length) {
        const params = resolved.map((_, i) => `@_bfr_loc${i}`);
        clauses.push(`AND Location IN (${params.join(',')})`);
        binders.push((r) => resolved.forEach((v, i) => r.input(`_bfr_loc${i}`, sql.NVarChar(255), v)));
      }
    }

    // provider -> claim-based subquery (no mapping needed)
    const provs = toArr(filters.provider);
    if (provs.length) {
      const params = provs.map((_, i) => `@_bfr_prov${i}`);
      clauses.push(`AND ClaimID IN (SELECT DISTINCT ClaimID FROM dbo.recon_report WHERE TrxType='Charge' AND ProviderName IN (${params.join(',')}))`);
      binders.push((r) => provs.forEach((v, i) => r.input(`_bfr_prov${i}`, sql.NVarChar(255), v)));
    }

    // payer -> InsuranceName (no mapping needed)
    const payers = toArr(filters.payer);
    if (payers.length) {
      const params = payers.map((_, i) => `@_bfr_payer${i}`);
      clauses.push(`AND InsuranceName IN (${params.join(',')})`);
      binders.push((r) => payers.forEach((v, i) => r.input(`_bfr_payer${i}`, sql.NVarChar(255), v)));
    }

    if (!clauses.length) return { where: '', bind: () => {} };
    return {
      where: clauses.join(' '),
      bind: (r) => binders.forEach((b) => b(r)),
    };
  }

  /**
   * Extract date range from req.body.filters.date_of_service.
   * - If end_date is missing -> defaults to today.
   * - If start_date is missing -> defaults to 1 year before end.
   * Binds @_dos_start and @_dos_end as NVarChar params.
   */
  protected dosRange(req: ExpressRequest): {
    start: string;
    end: string;
    bind: (r: SqlRequest) => void;
  } {
    const dos = (req as any).body?.filters?.date_of_service ?? (req as any).body?.filters?.payment_received ?? {};
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const end = (dos.end_date && dos.end_date !== '') ? dos.end_date : todayStr;
    const defaultStart = new Date(today);
    defaultStart.setFullYear(defaultStart.getFullYear() - 1);
    const start = (dos.start_date && dos.start_date !== '') ? dos.start_date : defaultStart.toISOString().slice(0, 10);
    return {
      start,
      end,
      bind: (r: SqlRequest) => {
        r.input('_dos_start', sql.NVarChar, start);
        r.input('_dos_end',   sql.NVarChar, end);
      },
    };
  }

  public closePool(): void {
    if (this.pool) {
      this.pool.close()
        .then(() => {
          logger.info('Database pool closed successfully.');
        })
        .catch((err: RequestError) => {
          logger.error(`Error closing the database pool: ${err.message}`);
        });
    } else {
      logger.warn('Database pool is not initialized, cannot close.');
    }
  }
}
