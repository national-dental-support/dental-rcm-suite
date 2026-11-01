import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

interface DenialCodeMappingRow {
  id: number;
  carc_payer: string | null;
  carc_x12: string | null;
  rarc: string | null;
  definition: string | null;
  grouping: string;
  insurance_actionable: boolean | null;
  patient_responsible: boolean | null;
  no_action_needed: boolean | null;
  customer_id: number | null;
  created_at: string;
  updated_at: string;
}

export class DenialCodeMappingController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  // ---------------------------------------------------------------------------
  // GET /api/admin/denial-code-mapping
  // Query: q (search), grouping, limit, offset
  // Tenant-scoped: returns rows where customer_id = caller's OR IS NULL (global).
  // ---------------------------------------------------------------------------
  public list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { q, grouping, limit, offset } = req.query as Record<string, string>;
      const top = Math.min(Number(limit) || 100, 2000);
      const skip = Math.max(Number(offset) || 0, 0);

      const request = this.pool.request();
      const xenCustId = extractCustomerId(req);

      const conditions: string[] = [];
      if (xenCustId != null) {
        request.input('_custId', sql.Int, xenCustId);
        conditions.push('(customer_id = @_custId OR customer_id IS NULL)');
      }
      if (q) {
        request.input('q', sql.NVarChar(100), `%${q}%`);
        conditions.push(
          '(carc_payer LIKE @q OR carc_x12 LIKE @q OR rarc LIKE @q OR definition LIKE @q OR grouping LIKE @q)'
        );
      }
      if (grouping) {
        request.input('grouping', sql.NVarChar(100), grouping);
        conditions.push('grouping = @grouping');
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count and page in one round-trip
      request.input('_top', sql.Int, top);
      request.input('_skip', sql.Int, skip);

      const result = await request.query(`
        SELECT COUNT(*) AS total FROM dbo.DenialCodeMapping ${where};

        SELECT id, carc_payer, carc_x12, rarc, definition, grouping,
               insurance_actionable, patient_responsible, no_action_needed,
               customer_id, created_at, updated_at
        FROM dbo.DenialCodeMapping
        ${where}
        ORDER BY grouping, carc_x12, rarc, carc_payer
        OFFSET @_skip ROWS FETCH NEXT @_top ROWS ONLY;
      `);

      const recordsets = result.recordsets as unknown as Array<Array<Record<string, unknown>>>;
      const total = Number(recordsets[0]?.[0]?.total ?? 0);
      const rows: DenialCodeMappingRow[] = (recordsets[1] ?? []) as unknown as DenialCodeMappingRow[];

      return res.status(200).json({ data: rows, total });
    } catch (error: unknown) {
      logger.error('DenialCodeMapping.list', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // ---------------------------------------------------------------------------
  // GET /api/admin/denial-code-mapping/groupings
  // Distinct groupings (for dropdown).
  // ---------------------------------------------------------------------------
  public listGroupings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const request = this.pool.request();
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null
        ? 'WHERE customer_id = @_custId OR customer_id IS NULL'
        : '';
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(`
        SELECT DISTINCT grouping
        FROM dbo.DenialCodeMapping
        ${custFilter}
        ORDER BY grouping
      `);

      return res.status(200).json({
        data: (result.recordset ?? []).map((r) => r.grouping),
      });
    } catch (error: unknown) {
      logger.error('DenialCodeMapping.listGroupings', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // ---------------------------------------------------------------------------
  // POST /api/admin/denial-code-mapping
  // ---------------------------------------------------------------------------
  public create = async (req: Request, res: Response): Promise<Response> => {
    const {
      carc_payer, carc_x12, rarc, definition, grouping,
      insurance_actionable, patient_responsible, no_action_needed,
    } = req.body as Partial<DenialCodeMappingRow>;

    if (!grouping || String(grouping).trim() === '') {
      return res.status(400).json({ message: 'grouping is required' });
    }
    if (!carc_payer && !carc_x12 && !rarc) {
      return res
        .status(400)
        .json({ message: 'At least one of carc_payer, carc_x12, or rarc must be provided' });
    }

    try {
      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('carc_payer', sql.NVarChar(50), carc_payer ?? null);
      request.input('carc_x12', sql.NVarChar(50), carc_x12 ?? null);
      request.input('rarc', sql.NVarChar(50), rarc ?? null);
      request.input('definition', sql.NVarChar(1000), definition ?? null);
      request.input('grouping', sql.NVarChar(100), grouping);
      request.input('insurance_actionable', sql.Bit, boolToBit(insurance_actionable));
      request.input('patient_responsible', sql.Bit, boolToBit(patient_responsible));
      request.input('no_action_needed', sql.Bit, boolToBit(no_action_needed));
      request.input('customer_id', sql.Int, xenCustId ?? null);

      const result = await request.query(`
        INSERT INTO dbo.DenialCodeMapping
          (carc_payer, carc_x12, rarc, definition, grouping,
           insurance_actionable, patient_responsible, no_action_needed, customer_id)
        OUTPUT INSERTED.*
        VALUES
          (@carc_payer, @carc_x12, @rarc, @definition, @grouping,
           @insurance_actionable, @patient_responsible, @no_action_needed, @customer_id);
      `);

      return res.status(201).json({ data: result.recordset[0] });
    } catch (error: unknown) {
      logger.error('DenialCodeMapping.create', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // ---------------------------------------------------------------------------
  // PUT /api/admin/denial-code-mapping/:id
  // ---------------------------------------------------------------------------
  public update = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id is required' });

    const {
      carc_payer, carc_x12, rarc, definition, grouping,
      insurance_actionable, patient_responsible, no_action_needed,
    } = req.body as Partial<DenialCodeMappingRow>;

    try {
      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('id', sql.Int, id);
      request.input('carc_payer', sql.NVarChar(50), carc_payer ?? null);
      request.input('carc_x12', sql.NVarChar(50), carc_x12 ?? null);
      request.input('rarc', sql.NVarChar(50), rarc ?? null);
      request.input('definition', sql.NVarChar(1000), definition ?? null);
      request.input('grouping', sql.NVarChar(100), grouping ?? null);
      request.input('insurance_actionable', sql.Bit, boolToBit(insurance_actionable));
      request.input('patient_responsible', sql.Bit, boolToBit(patient_responsible));
      request.input('no_action_needed', sql.Bit, boolToBit(no_action_needed));

      const tenantGuard =
        xenCustId != null
          ? 'AND (customer_id = @_custId OR customer_id IS NULL)'
          : '';
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(`
        UPDATE dbo.DenialCodeMapping
        SET carc_payer             = @carc_payer,
            carc_x12               = @carc_x12,
            rarc                   = @rarc,
            definition             = @definition,
            grouping               = COALESCE(@grouping, grouping),
            insurance_actionable   = @insurance_actionable,
            patient_responsible    = @patient_responsible,
            no_action_needed       = @no_action_needed,
            updated_at             = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id ${tenantGuard};
      `);

      if (!result.recordset.length) {
        return res.status(404).json({ message: 'Mapping not found' });
      }
      return res.status(200).json({ data: result.recordset[0] });
    } catch (error: unknown) {
      logger.error('DenialCodeMapping.update', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // ---------------------------------------------------------------------------
  // DELETE /api/admin/denial-code-mapping/:id
  // ---------------------------------------------------------------------------
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
        DELETE FROM dbo.DenialCodeMapping
        WHERE id = @id ${tenantGuard};
        SELECT @@ROWCOUNT AS affected;
      `);

      const affected = result.recordset?.[0]?.affected ?? 0;
      if (!affected) return res.status(404).json({ message: 'Mapping not found' });
      return res.status(200).json({ data: { id, deleted: affected } });
    } catch (error: unknown) {
      logger.error('DenialCodeMapping.delete', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

function boolToBit(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  const s = String(v).toLowerCase().trim();
  if (s === '' || s === 'null') return null;
  if (s === 'true' || s === '1' || s === 'yes') return 1;
  return 0;
}
