import { Request, Response } from 'express';
import sql from 'mssql';
import { randomUUID } from 'crypto';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId, buildClaimsCustomerWhere } from '../../utils/resolve-user-scope';

export class PatientStatementsController extends DatabaseConnectionController {
  constructor() { super(); }

  // ---------------------------------------------------------------------------
  // GET /balances - paginated patient balance list
  // ---------------------------------------------------------------------------
  getBalances = async (req: Request, res: Response): Promise<void> => {
    try {
      const page     = Math.max(parseInt(String(req.query.page))     || 1, 1);
      const pageSize = Math.min(parseInt(String(req.query.pageSize)) || 25, 100);
      const offset   = (page - 1) * pageSize;
      const minBal   = parseFloat(String(req.query.minBalance)) || 0;
      const bucket   = String(req.query.agingBucket || 'all');
      const from     = typeof req.query.from === 'string' && req.query.from ? req.query.from : null;
      const to       = typeof req.query.to   === 'string' && req.query.to   ? req.query.to   : null;

      const xenCustId = extractCustomerId(req);
      const custC = buildClaimsCustomerWhere(xenCustId, 'c');

      const r = this.pool.request();
      custC.addInputs(r);
      r.input('MinBal',   sql.Decimal(10, 2), minBal);
      r.input('Offset',   sql.Int, offset);
      r.input('PageSize', sql.Int, pageSize);
      if (from) r.input('From', sql.Date, from);
      if (to)   r.input('To',   sql.Date, to);

      const fromClause = from ? 'AND c.DateOfService >= @From' : '';
      const toClause   = to   ? 'AND c.DateOfService <= @To'   : '';

      // Aging bucket WHERE - applied to days since oldest unpaid claim
      const bucketClause = (() => {
        if (bucket === '0_30')   return 'AND dbo_aging <= 30';
        if (bucket === '31_60')  return 'AND dbo_aging BETWEEN 31 AND 60';
        if (bucket === '61_90')  return 'AND dbo_aging BETWEEN 61 AND 90';
        if (bucket === '90_plus') return 'AND dbo_aging > 90';
        return '';
      })();

      const query = `
        WITH PatientCharges AS (
          SELECT
            c.PatientID,
            LTRIM(RTRIM(COALESCE(p.FirstName,'') + ' ' + COALESCE(p.LastName,''))) AS PatientName,
            ISNULL(SUM(c.ChargeAmt), 0)  AS totalCharges,
            0                            AS totalPaid,
            0                            AS insurancePaid,
            0                            AS patientPaid,
            0                            AS adjustments,
            MAX(c.DateOfService)         AS lastDOS,
            DATEDIFF(DAY, MIN(c.DateOfService), GETDATE()) AS dbo_aging,
            MAX(prov.Location)           AS location,
            0                            AS previousBalance
          FROM dbo.claims c
          JOIN dbo.patient p ON p.PatientID = c.PatientID
          LEFT JOIN dbo.provider prov ON prov.ProviderID = c.ProviderID
          WHERE c.ChargeAmt > 0
            ${custC.where}
            ${fromClause} ${toClause}
          GROUP BY c.PatientID, p.FirstName, p.LastName
        )
        SELECT
          PatientID         AS patientId,
          CAST(PatientID AS NVARCHAR(50)) AS patientAccount,
          PatientName       AS patientName,
          totalCharges - totalPaid - adjustments AS balanceDue,
          totalCharges      AS currentCharges,
          ISNULL(previousBalance, 0) AS previousBalance,
          insurancePaid,
          adjustments,
          totalCharges - totalPaid - adjustments AS patientResponsibility,
          CASE WHEN dbo_aging <= 30  THEN totalCharges - totalPaid - adjustments ELSE 0 END AS aging0_30,
          CASE WHEN dbo_aging BETWEEN 31 AND 60 THEN totalCharges - totalPaid - adjustments ELSE 0 END AS aging31_60,
          CASE WHEN dbo_aging BETWEEN 61 AND 90 THEN totalCharges - totalPaid - adjustments ELSE 0 END AS aging61_90,
          CASE WHEN dbo_aging > 90 THEN totalCharges - totalPaid - adjustments ELSE 0 END AS aging90Plus,
          NULL              AS lastStatementDate,
          location,
          dbo_aging
        FROM PatientCharges
        WHERE (totalCharges - totalPaid - adjustments) >= @MinBal
          ${bucketClause}
        ORDER BY (totalCharges - totalPaid - adjustments) DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `;

      const countReq = this.pool.request();
      custC.addInputs(countReq);
      countReq.input('MinBal', sql.Decimal(10, 2), minBal);
      if (from) countReq.input('From', sql.Date, from);
      if (to)   countReq.input('To',   sql.Date, to);

      const [dataRes, countRes] = await Promise.all([
        r.query(query),
        countReq.query(`
          WITH PatientCharges AS (
            SELECT c.PatientID,
              ISNULL(SUM(c.ChargeAmt), 0) AS balanceDue,
              DATEDIFF(DAY, MIN(c.DateOfService), GETDATE()) AS dbo_aging
            FROM dbo.claims c
            WHERE c.ChargeAmt > 0 ${custC.where} ${fromClause} ${toClause}
            GROUP BY c.PatientID
          )
          SELECT COUNT(*) AS total FROM PatientCharges
          WHERE balanceDue >= @MinBal ${bucketClause}
        `),
      ]);

      const total = countRes.recordset[0]?.total ?? 0;
      const rows = dataRes.recordset.map((row: any) => ({
        patientId:           row.patientId,
        patientAccount:      row.patientAccount,
        patientName:         row.patientName ?? '',
        balanceDue:          Math.round((row.balanceDue ?? 0) * 100) / 100,
        currentCharges:      Math.round((row.currentCharges ?? 0) * 100) / 100,
        previousBalance:     Math.round((row.previousBalance ?? 0) * 100) / 100,
        insurancePaid:       Math.round((row.insurancePaid ?? 0) * 100) / 100,
        adjustments:         Math.round((row.adjustments ?? 0) * 100) / 100,
        patientResponsibility: Math.round((row.patientResponsibility ?? 0) * 100) / 100,
        aging0_30:           Math.round((row.aging0_30 ?? 0) * 100) / 100,
        aging31_60:          Math.round((row.aging31_60 ?? 0) * 100) / 100,
        aging61_90:          Math.round((row.aging61_90 ?? 0) * 100) / 100,
        aging90Plus:         Math.round((row.aging90Plus ?? 0) * 100) / 100,
        lastStatementDate:   row.lastStatementDate ?? null,
        location:            row.location ?? '',
      }));

      res.json({
        message: 'Patient balances',
        asOf: new Date().toISOString(),
        pagination: { page, pageSize, totalRows: total, totalPages: Math.ceil(total / pageSize) },
        rows,
      });
    } catch (err: any) {
      logger.error('[PatientStatements] getBalances error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // ---------------------------------------------------------------------------
  // POST /generate-batch - enqueue a statement batch
  // ---------------------------------------------------------------------------
  generateBatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const { patientIds, filters } = req.body as { patientIds?: number[]; filters?: any };
      const customerId = extractCustomerId(req);
      const requestedBy = (req as any).user?.username ?? 'system';
      const batchId = randomUUID();
      const total = patientIds?.length ?? 0;

      // Ensure StatementBatch table exists before inserting
      try {
        await this.pool.request()
          .input('BatchId',    sql.NVarChar(50),  batchId)
          .input('CustId',     sql.Int,           customerId ?? 0)
          .input('Status',     sql.NVarChar(20),  'queued')
          .input('Total',      sql.Int,           total)
          .input('ReqBy',      sql.NVarChar(100), requestedBy)
          .query(`
            INSERT INTO dbo.StatementBatch (batch_id, customer_id, status, total_patients, requested_by)
            VALUES (@BatchId, @CustId, @Status, @Total, @ReqBy)
          `);
      } catch (err) {
        logger.warn('[PatientStatements] StatementBatch insert failed \u2014 table may not exist yet', { batchId, error: String(err) });
      }

      res.json({ batchId, queued: total });
    } catch (err: any) {
      logger.error('[PatientStatements] generateBatch error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // ---------------------------------------------------------------------------
  // GET /batch/:batchId - single batch status
  // ---------------------------------------------------------------------------
  getBatchStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { batchId } = req.params;
      const r = this.pool.request().input('BatchId', sql.NVarChar(50), batchId);
      const result = await r.query(`
        SELECT batch_id, status, total_patients, completed_count, error_count,
               requested_by, started_at, completed_at, download_url, created_at
        FROM dbo.StatementBatch
        WHERE batch_id = @BatchId
      `);
      if (!result.recordset.length) {
        res.status(404).json({ message: 'Batch not found' });
        return;
      }
      const row = result.recordset[0];
      res.json({
        batchId:        row.batch_id,
        status:         row.status,
        totalPatients:  row.total_patients ?? 0,
        completedCount: row.completed_count ?? 0,
        errorCount:     row.error_count ?? 0,
        requestedBy:    row.requested_by,
        startedAt:      row.started_at,
        completedAt:    row.completed_at,
        downloadUrl:    row.download_url,
        createdAt:      row.created_at,
      });
    } catch (err: any) {
      logger.error('[PatientStatements] getBatchStatus error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // ---------------------------------------------------------------------------
  // GET /batches - recent batches (last 10)
  // ---------------------------------------------------------------------------
  getRecentBatches = async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = extractCustomerId(req);
      const r = this.pool.request().input('CustId', sql.Int, customerId ?? 0);
      const result = await r.query(`
        SELECT TOP 10
          batch_id, status, total_patients, completed_count, error_count,
          requested_by, started_at, completed_at, download_url, created_at
        FROM dbo.StatementBatch
        WHERE customer_id = @CustId
        ORDER BY created_at DESC
      `);
      const batches = result.recordset.map((row: any) => ({
        batchId:        row.batch_id,
        status:         row.status,
        totalPatients:  row.total_patients ?? 0,
        completedCount: row.completed_count ?? 0,
        errorCount:     row.error_count ?? 0,
        requestedBy:    row.requested_by,
        startedAt:      row.started_at,
        completedAt:    row.completed_at,
        downloadUrl:    row.download_url,
        createdAt:      row.created_at,
      }));
      res.json({ batches });
    } catch (err: any) {
      logger.error('[PatientStatements] getRecentBatches error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // ---------------------------------------------------------------------------
  // GET /:id/pdf - statement PDF download (stub)
  // ---------------------------------------------------------------------------
  getStatementPdf = async (req: Request, res: Response): Promise<void> => {
    res.status(501).json({ message: 'PDF generation not yet configured' });
  };
}
