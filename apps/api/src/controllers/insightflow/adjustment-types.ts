import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class AdjustmentTypesController extends DatabaseConnectionController {
  constructor() { super(); }

  public list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = extractCustomerId(req) ?? (req as any).actor?.customer_id ?? null;
      const pool = this.pool;
      const r = pool.request();
      const where: string[] = [];
      if (customerId != null) {
        r.input('customerId', sql.Int, customerId);
        where.push('customer_id = @customerId');
      }

      const result = await r.query(`
        SELECT id, customer_id, adj_type, category, description, created_at
        FROM dbo.AdjustmentTypeCategory
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY adj_type
      `);
      return res.json({ data: result.recordset });
    } catch (err: any) {
      logger.error('AdjustmentTypes.list error', { error: err });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  public upsert = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = extractCustomerId(req) ?? (req as any).actor?.customer_id ?? null;
      const { adjType, category, description } = req.body;
      if (!adjType) return res.status(400).json({ message: 'adjType is required' });
      if (!category) return res.status(400).json({ message: 'category is required' });

      const pool = this.pool;
      const r = pool.request()
        .input('customerId', sql.Int, customerId ?? null)
        .input('adjType', sql.NVarChar(128), adjType)
        .input('category', sql.NVarChar(50), category)
        .input('description', sql.NVarChar(500), description ?? null);

      // Upsert based on unique constraint (customer_id, adj_type)
      const result = await r.query(`
        MERGE dbo.AdjustmentTypeCategory AS target
        USING (SELECT @customerId AS customer_id, @adjType AS adj_type) AS source
          ON target.customer_id = source.customer_id AND target.adj_type = source.adj_type
        WHEN MATCHED THEN
          UPDATE SET category=@category, description=@description
        WHEN NOT MATCHED THEN
          INSERT (customer_id, adj_type, category, description)
          VALUES (@customerId, @adjType, @category, @description)
        OUTPUT INSERTED.*;
      `);

      return res.json({ data: result.recordset[0] });
    } catch (err: any) {
      logger.error('AdjustmentTypes.upsert error', { error: err });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  public delete = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params['id']);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });

      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? 'AND customer_id = @_custId' : '';
      const r = this.pool.request().input('id', sql.Int, id);
      if (xenCustId != null) r.input('_custId', sql.Int, xenCustId);

      await r.query(`DELETE FROM dbo.AdjustmentTypeCategory WHERE id=@id ${custFilter}`);
      return res.json({ deleted: true });
    } catch (err: any) {
      logger.error('AdjustmentTypes.delete error', { error: err });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
