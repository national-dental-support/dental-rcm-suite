import { Request, Response } from 'express';
import Database from '../../modules/db';
import sql from 'mssql';

/**
 * QA Workflow controller - sampling, scoring, and findings.
 */

/** POST /denial-iq/qa/sample - Generate a random QA sample */
export async function createQaSample(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const { sample_size = 10, review_type = 'random_sample', specialist_id } = req.body;
  const scopeFilter = (req as any).scopeFilter;
  const reviewerId = scopeFilter?.userId;
  const customerId = scopeFilter?.customerId;

  if (!reviewerId) return res.status(400).json({ message: 'Reviewer could not be resolved' });

  // Get random closed claims for sampling
  let specialistFilter = '';
  const request = pool.request()
    .input('sampleSize', sql.Int, Math.min(sample_size, 50))
    .input('reviewerId', sql.Int, reviewerId)
    .input('reviewType', sql.NVarChar(30), review_type)
    .input('customerId', sql.SmallInt, customerId);

  if (specialist_id) {
    specialistFilter = 'AND ch.AssignedTo = @specialistId';
    request.input('specialistId', sql.Int, specialist_id);
  }

  const claims = await request.query(`
    SELECT TOP (@sampleSize) ch.ClaimID
    FROM dbo.claimhistory ch
    INNER JOIN dbo.claims c ON c.ClaimID = ch.ClaimID
    WHERE ch.ClaimWorkEndedTime IS NOT NULL
      AND ch.ClaimStatus IN ('Closed', 'Written Off')
      AND c.customer_id = @customerId
      ${specialistFilter}
      AND NOT EXISTS (
        SELECT 1 FROM dbo.QaReview qr
        WHERE qr.claim_id = ch.ClaimID AND qr.status != 'completed'
      )
    ORDER BY NEWID()
  `);

  // Create QaReview records
  const reviews: any[] = [];
  for (const row of claims.recordset) {
    const r = await pool.request()
      .input('claimId', sql.NVarChar(50), row.ClaimID)
      .input('reviewerId', sql.Int, reviewerId)
      .input('reviewType', sql.NVarChar(30), review_type)
      .input('customerId', sql.SmallInt, customerId)
      .query(`
        INSERT INTO dbo.QaReview (claim_id, reviewer_id, review_type, customer_id)
        OUTPUT INSERTED.*
        VALUES (@claimId, @reviewerId, @reviewType, @customerId)
      `);
    reviews.push(r.recordset[0]);
  }

  res.status(201).json({ data: reviews, count: reviews.length });
}

/** GET /denial-iq/qa/reviews - List QA reviews */
export async function listQaReviews(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const status = req.query.status as string;
  const scopeFilter = (req as any).scopeFilter;

  let where = `WHERE 1=1`;
  if (scopeFilter?.sql) where += ` AND qr.${scopeFilter.sql}`;
  if (status) where += ` AND qr.status = '${status}'`;

  const result = await pool.request().query(`
    SELECT qr.*,
           u.FirstName + ' ' + u.LastName AS reviewer_name,
           (SELECT COUNT(*) FROM dbo.QaFinding qf WHERE qf.review_id = qr.id) AS finding_count
    FROM dbo.QaReview qr
    LEFT JOIN dbo.Users u ON u.userID = qr.reviewer_id
    ${where}
    ORDER BY qr.created_at DESC
  `);

  res.json({ data: result.recordset });
}

/** PATCH /denial-iq/qa/reviews/:id - Update QA review (score, status) */
export async function updateQaReview(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const id = parseInt(req.params.id);
  const { score, status } = req.body;

  const sets: string[] = [];
  const request = pool.request().input('id', sql.Int, id);

  if (score !== undefined) { sets.push('score = @score'); request.input('score', sql.Int, score); }
  if (status) {
    sets.push('status = @status');
    request.input('status', sql.NVarChar(20), status);
    if (status === 'in_progress') sets.push('started_at = GETUTCDATE()');
    if (status === 'completed') sets.push('completed_at = GETUTCDATE()');
  }

  if (sets.length === 0) return res.status(400).json({ message: 'Nothing to update' });

  await request.query(`UPDATE dbo.QaReview SET ${sets.join(', ')} WHERE id = @id`);
  res.json({ ok: true });
}

/** POST /denial-iq/qa/findings - Add a finding to a QA review */
export async function createQaFinding(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const { review_id, category, severity, description, recommendation } = req.body;

  if (!review_id || !category || !severity || !description) {
    return res.status(400).json({ message: 'review_id, category, severity, and description are required' });
  }

  const result = await pool.request()
    .input('reviewId', sql.Int, review_id)
    .input('category', sql.NVarChar(50), category)
    .input('severity', sql.NVarChar(20), severity)
    .input('description', sql.NVarChar(sql.MAX), description)
    .input('recommendation', sql.NVarChar(sql.MAX), recommendation || null)
    .query(`
      INSERT INTO dbo.QaFinding (review_id, category, severity, description, recommendation)
      OUTPUT INSERTED.*
      VALUES (@reviewId, @category, @severity, @description, @recommendation)
    `);

  res.status(201).json({ data: result.recordset[0] });
}

/** GET /denial-iq/qa/findings?reviewId= - List findings for a review */
export async function listQaFindings(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const reviewId = parseInt(req.query.reviewId as string);

  const result = await pool.request()
    .input('reviewId', sql.Int, reviewId)
    .query(`SELECT * FROM dbo.QaFinding WHERE review_id = @reviewId ORDER BY created_at`);

  res.json({ data: result.recordset });
}

/** GET /denial-iq/qa/stats - QA summary statistics */
export async function getQaStats(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const scopeFilter = (req as any).scopeFilter;
  const customerFilter = scopeFilter?.sql ? `AND qr.${scopeFilter.sql}` : '';

  const result = await pool.request().query(`
    SELECT
      COUNT(*) AS total_reviews,
      SUM(CASE WHEN qr.status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN qr.status = 'pending' THEN 1 ELSE 0 END) AS pending,
      AVG(CASE WHEN qr.score IS NOT NULL THEN CAST(qr.score AS FLOAT) END) AS avg_score,
      (SELECT COUNT(*) FROM dbo.QaFinding qf
       INNER JOIN dbo.QaReview qr2 ON qr2.id = qf.review_id
       WHERE 1=1 ${customerFilter.replace(/qr\./g, 'qr2.')}) AS total_findings,
      (SELECT COUNT(*) FROM dbo.QaFinding qf
       INNER JOIN dbo.QaReview qr2 ON qr2.id = qf.review_id
       WHERE qf.severity = 'critical' ${customerFilter.replace(/qr\./g, 'qr2.')}) AS critical_findings
    FROM dbo.QaReview qr
    WHERE 1=1 ${customerFilter}
  `);

  res.json({ data: result.recordset[0] });
}
