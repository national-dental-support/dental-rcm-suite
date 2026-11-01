import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

interface ReferenceEntry {
  id: number;
  term: string;
  definition: string;
  category: string | null;
  customer_id: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export class ReferenceLibraryController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/admin/reference-library?q=&category=&limit=&offset=
   * Returns rows visible to caller (own tenant + global rows).
   */
  public list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { q, category, limit, offset } = req.query as Record<string, string>;
      const top = Math.min(Number(limit) || 100, 1000);
      const skip = Math.max(Number(offset) || 0, 0);

      const request = this.pool.request();
      const xenCustId = extractCustomerId(req);

      const conditions: string[] = [];
      if (xenCustId != null) {
        request.input('_custId', sql.Int, xenCustId);
        conditions.push('(customer_id = @_custId OR customer_id IS NULL)');
      }
      if (q) {
        request.input('q', sql.NVarChar(200), `%${q}%`);
        conditions.push('(term LIKE @q OR definition LIKE @q OR category LIKE @q)');
      }
      if (category) {
        request.input('category', sql.NVarChar(100), category);
        conditions.push('category = @category');
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      request.input('_top', sql.Int, top);
      request.input('_skip', sql.Int, skip);

      const result = await request.query(`
        SELECT COUNT(*) AS total FROM dbo.ReferenceLibrary ${where};
        SELECT id, term, definition, category, customer_id,
               created_at, updated_at, created_by, updated_by
        FROM dbo.ReferenceLibrary
        ${where}
        ORDER BY term
        OFFSET @_skip ROWS FETCH NEXT @_top ROWS ONLY;
      `);

      const recordsets = result.recordsets as unknown as Array<Array<Record<string, unknown>>>;
      const total = Number(recordsets[0]?.[0]?.total ?? 0);
      const rows: ReferenceEntry[] = (recordsets[1] ?? []) as unknown as ReferenceEntry[];

      return res.status(200).json({ data: rows, total });
    } catch (error: unknown) {
      logger.error('ReferenceLibrary.list', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/reference-library/categories - distinct category values for filter dropdown */
  public listCategories = async (req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      const filter = xenCustId != null
        ? (request.input('_custId', sql.Int, xenCustId), 'WHERE customer_id = @_custId OR customer_id IS NULL')
        : '';
      const result = await request.query(`
        SELECT DISTINCT category FROM dbo.ReferenceLibrary
        ${filter}
        ${filter ? 'AND' : 'WHERE'} category IS NOT NULL AND category <> ''
        ORDER BY category
      `);
      return res.status(200).json({
        data: (result.recordset ?? []).map((r) => r.category),
      });
    } catch (error: unknown) {
      logger.error('ReferenceLibrary.listCategories', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/admin/reference-library */
  public create = async (req: Request, res: Response): Promise<Response> => {
    const { term, definition, category } = req.body as Partial<ReferenceEntry>;
    if (!term || !definition || !String(term).trim() || !String(definition).trim()) {
      return res.status(400).json({ message: 'term and definition are required' });
    }

    try {
      const xenCustId = extractCustomerId(req);
      const actor = (req as any).actor?.email ?? null;
      const request = this.pool.request();
      request.input('term', sql.NVarChar(200), term);
      request.input('definition', sql.NVarChar(sql.MAX), definition);
      request.input('category', sql.NVarChar(100), category ?? null);
      request.input('customer_id', sql.Int, xenCustId ?? null);
      request.input('actor', sql.NVarChar(255), actor);

      const result = await request.query(`
        INSERT INTO dbo.ReferenceLibrary (term, definition, category, customer_id, created_by, updated_by)
        OUTPUT INSERTED.*
        VALUES (@term, @definition, @category, @customer_id, @actor, @actor);
      `);

      return res.status(201).json({ data: result.recordset[0] });
    } catch (error: unknown) {
      logger.error('ReferenceLibrary.create', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/admin/reference-library/:id */
  public update = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id is required' });

    const { term, definition, category } = req.body as Partial<ReferenceEntry>;

    try {
      const xenCustId = extractCustomerId(req);
      const actor = (req as any).actor?.email ?? null;
      const request = this.pool.request();
      request.input('id', sql.Int, id);
      request.input('term', sql.NVarChar(200), term ?? null);
      request.input('definition', sql.NVarChar(sql.MAX), definition ?? null);
      request.input('category', sql.NVarChar(100), category ?? null);
      request.input('actor', sql.NVarChar(255), actor);

      const tenantGuard =
        xenCustId != null
          ? 'AND (customer_id = @_custId OR customer_id IS NULL)'
          : '';
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(`
        UPDATE dbo.ReferenceLibrary
        SET term       = COALESCE(@term, term),
            definition = COALESCE(@definition, definition),
            category   = @category,
            updated_at = SYSUTCDATETIME(),
            updated_by = @actor
        OUTPUT INSERTED.*
        WHERE id = @id ${tenantGuard};
      `);

      if (!result.recordset.length) {
        return res.status(404).json({ message: 'Entry not found' });
      }
      return res.status(200).json({ data: result.recordset[0] });
    } catch (error: unknown) {
      logger.error('ReferenceLibrary.update', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/admin/reference-library/:id */
  public delete = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id is required' });

    try {
      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('id', sql.Int, id);

      const tenantGuard =
        xenCustId != null
          ? 'AND (customer_id = @_custId OR customer_id IS NULL)'
          : '';
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(`
        DELETE FROM dbo.ReferenceLibrary
        WHERE id = @id ${tenantGuard};
        SELECT @@ROWCOUNT AS affected;
      `);

      const affected = result.recordset?.[0]?.affected ?? 0;
      if (!affected) return res.status(404).json({ message: 'Entry not found' });
      return res.status(200).json({ data: { id, deleted: affected } });
    } catch (error: unknown) {
      logger.error('ReferenceLibrary.delete', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
