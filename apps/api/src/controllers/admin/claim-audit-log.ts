import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

export class ClaimAuditLogController extends DatabaseConnectionController {
  constructor() { super(); }

  public list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId, customerId, eventType, actorUser, from, to } = req.query;
      const format    = (req.query.format as string) || 'json';
      const page      = Math.max(1, parseInt(req.query.page as string || '1', 10));
      const pageSize  = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string || '50', 10)));
      const offset    = (page - 1) * pageSize;

      const where: string[] = [];
      const r = this.pool.request();

      if (claimId)    { r.input('claimId',   sql.NVarChar(50),  claimId as string);                   where.push('e.claim_id = @claimId'); }
      if (customerId) { r.input('custId',     sql.Int,           parseInt(customerId as string, 10));   where.push('e.customer_id = @custId'); }
      if (eventType)  { r.input('evtType',    sql.NVarChar(50),  eventType as string);                 where.push('e.event_type = @evtType'); }
      if (actorUser)  { r.input('actorUser',  sql.NVarChar(255), `%${actorUser}%`);                    where.push('e.actor_user LIKE @actorUser'); }
      if (from)       { r.input('fromDate',   sql.DateTime2,     new Date(from as string));             where.push('e.event_time >= @fromDate'); }
      if (to)         { r.input('toDate',     sql.DateTime2,     new Date(to as string));               where.push('e.event_time <= @toDate'); }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      if (format === 'csv') {
        // Full result for CSV export (no pagination)
        const exportResult = await r.query(`
          SELECT
            e.id, e.customer_id AS customerId, e.claim_id AS claimId,
            e.event_type AS eventType, e.event_time AS eventTime,
            e.actor_user AS actorUser, e.metadata,
            cu.name AS customerName
          FROM dbo.ClaimEvent e
          LEFT JOIN dbo.Customers cu ON cu.uid = e.customer_id
          ${whereClause}
          ORDER BY e.event_time DESC, e.id DESC
        `);

        const rows = exportResult.recordset;
        const csvLines = [
          '"ID","Customer","Claim ID","Event Type","Event Time","Actor","Metadata"',
          ...rows.map((row: any) =>
            [row.id, row.customerName ?? row.customerId ?? '', row.claimId, row.eventType,
             row.eventTime ? new Date(row.eventTime).toISOString() : '',
             row.actorUser ?? '',
             (row.metadata ?? '').replace(/"/g, '""'),
            ].map((v: any) => `"${v}"`).join(',')
          ),
        ];

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="claim-audit-log.csv"');
        return res.send(csvLines.join('\r\n'));
      }

      r.input('pageOffset', sql.Int, offset);
      r.input('pageSize', sql.Int, pageSize);

      const result = await r.query(`
        SELECT
          e.id, e.customer_id AS customerId, e.claim_id AS claimId,
          e.event_type AS eventType, e.event_time AS eventTime,
          e.actor_user AS actorUser, e.metadata,
          cu.name AS customerName,
          COUNT(*) OVER() AS totalCount
        FROM dbo.ClaimEvent e
        LEFT JOIN dbo.Customers cu ON cu.uid = e.customer_id
        ${whereClause}
        ORDER BY e.event_time DESC, e.id DESC
        OFFSET @pageOffset ROWS FETCH NEXT @pageSize ROWS ONLY
      `);

      return res.json({
        data: result.recordset,
        total: result.recordset[0]?.totalCount ?? 0,
        page,
        pageSize,
      });
    } catch (error: unknown) {
      logger.error('ClaimAuditLogController.list error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
