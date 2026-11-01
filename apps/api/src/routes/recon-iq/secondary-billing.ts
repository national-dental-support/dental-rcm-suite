import express, { Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { extractCustomerId } from '../../utils/resolve-user-scope';
import logger from '../../utils/logger';

const router = express.Router();

// GET /api/recon-iq/secondary-billing
// Returns SecondaryBillingQueue rows joined to patient, primary payer,
// secondary payer, and remittance file.
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = Database.getInstance().getPool();
    const custId = extractCustomerId(req);

    const statusFilter = (req.query.status as string) ?? 'all';
    const secondaryPayer = (req.query.secondaryPayer as string) ?? '';
    const location = (req.query.location as string) ?? '';
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;

    const request = pool.request();
    if (custId != null) request.input('custId', sql.Int, custId);
    request.input('offset', sql.Int, offset);
    request.input('pageSize', sql.Int, pageSize);
    request.input('statusFilter', sql.VarChar(30), statusFilter === 'all' ? null : statusFilter);
    request.input('secondaryPayer', sql.NVarChar(200), secondaryPayer || null);
    request.input('location', sql.VarChar(100), location || null);

    const custWhere = custId != null ? 'AND sbq.customer_id = @custId' : '';

    const result = await request.query(`
      SELECT
        sbq.id,
        sbq.claim_id                   AS claimId,
        sbq.primary_remittance_file_id AS primaryRmfId,
        sbq.secondary_payer_id         AS secondaryPayerId,
        sbq.primary_paid_amt           AS primaryPaidAmt,
        sbq.primary_adjustment_amt     AS primaryAdjustmentAmt,
        sbq.patient_resp_amt           AS patientRespAmt,
        sbq.secondary_bill_amt         AS secondaryBillAmt,
        sbq.status,
        sbq.submitted_by               AS submittedBy,
        sbq.submitted_date             AS submittedDate,
        sbq.created_at                 AS createdAt,
        p.PatientName                  AS patientName,
        CONVERT(varchar(10), c.DateOfService, 23) AS dateOfService,
        CAST(ISNULL(c.ChargeAmt, 0) AS decimal(10,2)) AS chargeAmt,
        pay1.InsuranceName             AS primaryPayerName,
        pay2.InsuranceName             AS secondaryPayerName,
        CONVERT(varchar(10), rf.FileDate, 23) AS primaryEobDate,
        rf.PracticeLocation            AS locationName
      FROM dbo.SecondaryBillingQueue sbq
      JOIN dbo.claims c ON c.ClaimID = sbq.claim_id
      LEFT JOIN dbo.Patient p ON p.PatientID = c.PatientID
      LEFT JOIN dbo.payer pay1 ON pay1.PayerID = c.PayerID
      LEFT JOIN dbo.payer pay2 ON pay2.PayerID = sbq.secondary_payer_id
      LEFT JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = sbq.primary_remittance_file_id
      WHERE 1=1
        ${custWhere}
        AND (@statusFilter IS NULL OR sbq.status = @statusFilter)
        AND (@secondaryPayer IS NULL OR pay2.InsuranceName = @secondaryPayer)
        AND (@location IS NULL OR rf.PracticeLocation = @location)
      ORDER BY sbq.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);

    // Total count for pagination
    const countReq = pool.request();
    if (custId != null) countReq.input('custId', sql.Int, custId);
    countReq.input('statusFilter', sql.VarChar(30), statusFilter === 'all' ? null : statusFilter);
    countReq.input('secondaryPayer', sql.NVarChar(200), secondaryPayer || null);
    countReq.input('location', sql.VarChar(100), location || null);
    const countResult = await countReq.query(`
      SELECT COUNT(*) AS total
      FROM dbo.SecondaryBillingQueue sbq
      LEFT JOIN dbo.payer pay2 ON pay2.PayerID = sbq.secondary_payer_id
      LEFT JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = sbq.primary_remittance_file_id
      WHERE 1=1
        ${custWhere}
        AND (@statusFilter IS NULL OR sbq.status = @statusFilter)
        AND (@secondaryPayer IS NULL OR pay2.InsuranceName = @secondaryPayer)
        AND (@location IS NULL OR rf.PracticeLocation = @location)
    `);

    const total = countResult.recordset[0]?.total ?? 0;

    res.json({
      rows: result.recordset,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err: any) {
    logger.error('[SecondaryBilling] GET error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/recon-iq/secondary-billing/mark-submitted
// Bulk-marks queue rows as submitted.
// Body: { ids: number[], submittedBy?: string }
router.post('/mark-submitted', async (req: Request, res: Response) => {
  try {
    const { ids, submittedBy } = req.body as { ids?: number[]; submittedBy?: string };
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ message: 'ids array is required' });
      return;
    }

    const pool = Database.getInstance().getPool();
    const custId = extractCustomerId(req);
    const actor = submittedBy
      ?? (req.headers['x-actor-email'] as string)
      ?? 'system';

    const idList = ids.map(id => Number(id)).filter(n => Number.isFinite(n) && n > 0);
    if (!idList.length) {
      res.status(400).json({ message: 'No valid ids provided' });
      return;
    }

    const idCsv = idList.join(',');
    const custWhere = custId != null ? `AND customer_id = ${custId}` : '';

    const request = pool.request();
    request.input('actor', sql.NVarChar(150), actor);
    await request.query(`
      UPDATE dbo.SecondaryBillingQueue
      SET status         = 'submitted',
          submitted_by   = @actor,
          submitted_date = GETUTCDATE(),
          updated_at     = GETUTCDATE()
      WHERE id IN (${idCsv})
        AND status = 'pending'
        ${custWhere}
    `);

    res.json({ updated: idList.length });
  } catch (err: any) {
    logger.error('[SecondaryBilling] mark-submitted error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
