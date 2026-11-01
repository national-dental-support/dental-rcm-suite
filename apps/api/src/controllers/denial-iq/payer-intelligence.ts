import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { trackEvent } from '../../utils/telemetry';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class PayerIntelligenceController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** GET /api/denial-iq/payer-intelligence/carc/:code?payerName= */
  getCarcDetail = async (req: Request, res: Response): Promise<Response> => {
    try {
      const code = (req.params.code ?? '').trim();
      const payerName = (req.query.payerName as string | undefined) ?? null;

      if (!code) {
        return res.status(400).json({ message: 'Missing CARC code' });
      }

      // Normalise: strip hyphens so 'CO-50' -> 'CO50' (legacy seed format)
      const normalisedCode = code.replace(/-/g, '');

      const request = this.pool.request();
      request.input('Code', sql.NVarChar(20), normalisedCode);
      request.input('PayerName', sql.NVarChar(255), payerName);

      const result = await request.query(`
        SELECT TOP 1
          c.code,
          CAST(c.description AS NVARCHAR(MAX)) AS description,
          COALESCE(g.category, c.category, 'Other') AS category,
          g.common_cause,
          g.resolution,
          g.prevention,
          CASE WHEN g.payer_name IS NOT NULL THEN 1 ELSE 0 END AS payer_specific,
          pfd.deadline_days AS filing_deadline_days,
          pfd.appeal_days
        FROM dbo.Carcs c
        LEFT JOIN dbo.CarcPayerGuidance g
          ON g.carc_code = c.code
          AND (
            g.payer_name IS NULL
            OR (@PayerName IS NOT NULL AND g.payer_name LIKE '%' + @PayerName + '%')
          )
        LEFT JOIN dbo.PayerFilingDeadlines pfd
          ON @PayerName IS NOT NULL AND pfd.payer_name LIKE '%' + @PayerName + '%'
        WHERE c.code = @Code
           OR c.code = REPLACE(@Code, 'CO', '')
        ORDER BY
          CASE WHEN c.code = @Code THEN 0 ELSE 1 END,  -- prefer exact match over numeric fallback
          CASE WHEN g.payer_name IS NOT NULL THEN 0 ELSE 1 END,
          g.id
      `);

      if (!result.recordset.length) {
        // Try guidance table directly even if base CARC not seeded
        const guidanceReq = this.pool.request();
        guidanceReq.input('Code', sql.NVarChar(20), code);
        guidanceReq.input('PayerName', sql.NVarChar(255), payerName);
        const gResult = await guidanceReq.query(`
          SELECT TOP 1
            carc_code AS code,
            NULL AS description,
            category,
            common_cause,
            resolution,
            prevention,
            CASE WHEN payer_name IS NOT NULL THEN 1 ELSE 0 END AS payer_specific,
            NULL AS filing_deadline_days,
            NULL AS appeal_days
          FROM dbo.CarcPayerGuidance
          WHERE carc_code = @Code
          ORDER BY CASE WHEN payer_name IS NOT NULL THEN 0 ELSE 1 END
        `);

        if (!gResult.recordset.length) {
          return res.status(404).json({ message: 'CARC code not found' });
        }
        return res.status(200).json({ data: gResult.recordset[0] });
      }

      trackEvent(this.pool, { event: 'payer_strategy_viewed', feature: 'denial_iq', metadata: { carcCode: code, payerName } });
      return res.status(200).json({ data: result.recordset[0] });
    } catch (error: unknown) {
      logger.error('[PayerIntelligence] getCarcDetail error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/denial-iq/payer-intelligence/carc-library?search=&category=&page= */
  listCarcLibrary = async (req: Request, res: Response): Promise<Response> => {
    try {
      const search = (req.query.search as string | undefined) ?? '';
      const category = (req.query.category as string | undefined) ?? '';
      const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
      const pageSize = 50;
      const offset = (page - 1) * pageSize;

      const request = this.pool.request();
      request.input('Search', sql.NVarChar(200), `%${search}%`);
      request.input('Category', sql.NVarChar(100), category ? `%${category}%` : '%');
      request.input('Offset', sql.Int, offset);
      request.input('PageSize', sql.Int, pageSize);

      const result = await request.query(`
        SELECT
          g.carc_code AS code,
          CAST(c.description AS NVARCHAR(MAX)) AS description,
          g.category,
          g.common_cause,
          g.resolution,
          g.prevention
        FROM dbo.CarcPayerGuidance g
        LEFT JOIN dbo.Carcs c ON c.code = g.carc_code
        WHERE g.payer_name IS NULL
          AND (
            g.carc_code LIKE @Search
            OR CAST(c.description AS NVARCHAR(MAX)) LIKE @Search
            OR g.category LIKE @Search
          )
          AND g.category LIKE @Category
        ORDER BY g.carc_code
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

        SELECT COUNT(*) AS total
        FROM dbo.CarcPayerGuidance g
        LEFT JOIN dbo.Carcs c ON c.code = g.carc_code
        WHERE g.payer_name IS NULL
          AND (
            g.carc_code LIKE @Search
            OR CAST(c.description AS NVARCHAR(MAX)) LIKE @Search
            OR g.category LIKE @Search
          )
          AND g.category LIKE @Category;
      `);

      const sets = result.recordsets as any[];
      const data = sets[0] ?? [];
      const total = (sets[1]?.[0]?.total as number) ?? 0;

      return res.status(200).json({ data, total, page, pageSize });
    } catch (error: unknown) {
      logger.error('[PayerIntelligence] listCarcLibrary error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/denial-iq/payer-intelligence/carc-descriptions - all codes + short description for tooltips */
  listCarcDescriptions = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const result = await this.pool.request().query(`
        SELECT code, CAST(description AS NVARCHAR(500)) AS description
        FROM dbo.Carcs
        ORDER BY code
      `);
      return res.status(200).json({ data: result.recordset });
    } catch (error: unknown) {
      logger.error('[PayerIntelligence] listCarcDescriptions error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/denial-iq/payer-intelligence/deadlines?payerName= */
  getDeadline = async (req: Request, res: Response): Promise<Response> => {
    try {
      const payerName = (req.query.payerName as string | undefined) ?? '';
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? 'AND customer_id = @_custId' : '';

      const request = this.pool.request();
      request.input('PayerName', sql.NVarChar(255), payerName);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(`
        SELECT TOP 1
          id,
          payer_name,
          deadline_days,
          appeal_days,
          notes
        FROM dbo.PayerFilingDeadlines
        WHERE payer_name LIKE '%' + @PayerName + '%'
          ${custFilter}
        ORDER BY LEN(payer_name)  -- shortest match = most specific
      `);

      if (!result.recordset.length) {
        return res.status(200).json({
          data: { payer_name: payerName || 'Generic', deadline_days: 180, appeal_days: 60, notes: null }
        });
      }

      return res.status(200).json({ data: result.recordset[0] });
    } catch (error: unknown) {
      logger.error('[PayerIntelligence] getDeadline error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/denial-iq/payer-intelligence/deadlines/all */
  listDeadlines = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const xenCustId = extractCustomerId(_req);
      const custFilter = xenCustId != null ? 'WHERE customer_id = @_custId' : '';
      const r = this.pool.request();
      if (xenCustId != null) r.input('_custId', sql.Int, xenCustId);
      const result = await r.query(`
        SELECT id, payer_name, deadline_days, appeal_days, notes, updated_at
        FROM dbo.PayerFilingDeadlines
        ${custFilter}
        ORDER BY payer_name
      `);
      return res.status(200).json({ data: result.recordset });
    } catch (error: unknown) {
      logger.error('[PayerIntelligence] listDeadlines error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/payer-intelligence/deadlines - Admin upsert */
  upsertDeadline = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { payer_name, deadline_days, appeal_days, notes } = req.body as {
        payer_name: string;
        deadline_days: number;
        appeal_days: number;
        notes?: string;
      };

      if (!payer_name || !deadline_days) {
        return res.status(400).json({ message: 'payer_name and deadline_days are required' });
      }

      const request = this.pool.request();
      request.input('PayerName', sql.NVarChar(255), payer_name);
      request.input('DeadlineDays', sql.Int, deadline_days);
      request.input('AppealDays', sql.Int, appeal_days ?? 60);
      request.input('Notes', sql.NVarChar(sql.MAX), notes ?? null);

      const xenCustId = extractCustomerId(req);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);
      const custMatch = xenCustId != null ? 'AND target.customer_id = @_custId' : '';

      await request.query(`
        MERGE dbo.PayerFilingDeadlines AS target
        USING (SELECT @PayerName AS payer_name) AS source
          ON LOWER(target.payer_name) = LOWER(source.payer_name) ${custMatch}
        WHEN MATCHED THEN
          UPDATE SET
            deadline_days = @DeadlineDays,
            appeal_days   = @AppealDays,
            notes         = @Notes,
            updated_at    = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT (payer_name, deadline_days, appeal_days, notes, customer_id)
          VALUES (@PayerName, @DeadlineDays, @AppealDays, @Notes, ${xenCustId != null ? '@_custId' : 'NULL'});
      `);

      return res.status(200).json({ ok: true });
    } catch (error: unknown) {
      logger.error('[PayerIntelligence] upsertDeadline error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
