import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

export class BankEscalationsController extends DatabaseConnectionController {
  constructor() { super(); }

  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const { status, priority, from, to } = req.query as Record<string, string>;
      const page     = Math.max(parseInt(String(req.query.page))     || 1, 1);
      const pageSize = Math.min(parseInt(String(req.query.pageSize)) || 25, 100);
      const offset   = (page - 1) * pageSize;

      const conditions: string[] = [];
      if (xenCustId != null) conditions.push('customer_id = @CustId');
      if (status)   conditions.push("status = @Status");
      if (priority) conditions.push("priority = @Priority");
      if (from)     conditions.push("created_at >= @From");
      if (to)       conditions.push("created_at <= @To");

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const r = this.pool.request();
      if (xenCustId != null) r.input('CustId',   sql.Int, xenCustId);
      if (status)   r.input('Status',   sql.NVarChar(20), status);
      if (priority) r.input('Priority', sql.NVarChar(10), priority);
      if (from)     r.input('From',     sql.DateTime, new Date(from));
      if (to)       r.input('To',       sql.DateTime, new Date(to));
      r.input('Offset',   sql.Int, offset);
      r.input('PageSize', sql.Int, pageSize);

      const countReq = this.pool.request();
      if (xenCustId != null) countReq.input('CustId',   sql.Int, xenCustId);
      if (status)   countReq.input('Status',   sql.NVarChar(20), status);
      if (priority) countReq.input('Priority', sql.NVarChar(10), priority);
      if (from)     countReq.input('From',     sql.DateTime, new Date(from));
      if (to)       countReq.input('To',       sql.DateTime, new Date(to));

      const [dataRes, countRes] = await Promise.all([
        r.query(`
          SELECT id, bank_deposit_id, issue_type, description, status, priority,
                 assigned_to, resolution_notes, resolved_by, resolved_at,
                 created_by, created_at, updated_at,
                 DATEDIFF(day, created_at, GETDATE()) AS days_open
          FROM dbo.BankIssueEscalation
          ${where}
          ORDER BY created_at DESC
          OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        `),
        countReq.query(`
          SELECT COUNT(*) AS total FROM dbo.BankIssueEscalation ${where}
        `),
      ]);

      const total = countRes.recordset[0]?.total ?? 0;

      res.json({
        rows: dataRes.recordset.map((row: any) => ({
          id:              row.id,
          bankDepositId:   row.bank_deposit_id,
          issueType:       row.issue_type,
          description:     row.description,
          status:          row.status,
          priority:        row.priority,
          assignedTo:      row.assigned_to,
          resolutionNotes: row.resolution_notes,
          resolvedBy:      row.resolved_by,
          resolvedAt:      row.resolved_at,
          createdBy:       row.created_by,
          createdAt:       row.created_at,
          updatedAt:       row.updated_at,
          daysOpen:        row.days_open,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err: any) {
      logger.error('[BankEscalations] list error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  stats = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const custSql = xenCustId != null ? 'WHERE customer_id = @CustId' : '';
      const r = this.pool.request();
      if (xenCustId != null) r.input('CustId', sql.Int, xenCustId);

      const result = await r.query(`
        SELECT status, COUNT(*) AS cnt
        FROM dbo.BankIssueEscalation
        ${custSql}
        GROUP BY status
      `);

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of result.recordset) {
        byStatus[row.status] = row.cnt;
        total += row.cnt;
      }
      res.json({ total, open: byStatus['open'] ?? 0, investigating: byStatus['investigating'] ?? 0, resolved: byStatus['resolved'] ?? 0 });
    } catch (err: any) {
      logger.error('[BankEscalations] stats error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const { bankDepositId, issueType, description, priority } = req.body as {
        bankDepositId?: string; issueType: string; description?: string; priority?: string;
      };
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';

      if (!issueType) { res.status(400).json({ message: 'issueType is required' }); return; }

      const r = this.pool.request();
      r.input('CustId',        sql.Int,          xenCustId ?? 0);
      r.input('BankDepositId', sql.NVarChar(50),  bankDepositId ?? null);
      r.input('IssueType',     sql.NVarChar(50),  issueType);
      r.input('Description',   sql.NVarChar(2000), description ?? null);
      r.input('Priority',      sql.NVarChar(10),  priority ?? 'medium');
      r.input('CreatedBy',     sql.NVarChar(100), actor);

      const result = await r.query(`
        INSERT INTO dbo.BankIssueEscalation
          (customer_id, bank_deposit_id, issue_type, description, priority, created_by)
        OUTPUT INSERTED.id
        VALUES (@CustId, @BankDepositId, @IssueType, @Description, @Priority, @CreatedBy)
      `);

      res.status(201).json({ id: result.recordset[0].id });
    } catch (err: any) {
      logger.error('[BankEscalations] create error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const xenCustId = extractCustomerId(req);
      const { status, assignedTo, resolutionNotes, priority } = req.body as {
        status?: string; assignedTo?: string; resolutionNotes?: string; priority?: string;
      };
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';

      const custSql = xenCustId != null ? 'AND customer_id = @CustId' : '';

      const setClauses: string[] = ['updated_at = GETDATE()'];
      if (status !== undefined)          setClauses.push("status = @Status");
      if (assignedTo !== undefined)      setClauses.push("assigned_to = @AssignedTo");
      if (resolutionNotes !== undefined) setClauses.push("resolution_notes = @ResNotes");
      if (priority !== undefined)        setClauses.push("priority = @Priority");

      if (status === 'resolved') {
        setClauses.push("resolved_by = @Actor", "resolved_at = GETDATE()");
      }

      const r = this.pool.request();
      r.input('Id',   sql.Int, parseInt(id));
      if (xenCustId != null) r.input('CustId', sql.Int, xenCustId);
      if (status !== undefined)          r.input('Status',     sql.NVarChar(20),   status);
      if (assignedTo !== undefined)      r.input('AssignedTo', sql.NVarChar(100),  assignedTo);
      if (resolutionNotes !== undefined) r.input('ResNotes',   sql.NVarChar(1000), resolutionNotes);
      if (priority !== undefined)        r.input('Priority',   sql.NVarChar(10),   priority);
      if (status === 'resolved')         r.input('Actor',      sql.NVarChar(100),  actor);

      await r.query(`
        UPDATE dbo.BankIssueEscalation
        SET ${setClauses.join(', ')}
        WHERE id = @Id ${custSql}
      `);

      res.json({ message: 'Updated' });
    } catch (err: any) {
      logger.error('[BankEscalations] update error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
