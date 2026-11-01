import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/**
 * Coaching Recommendations Controller
 *
 * Closes the training-to-performance loop:
 * - Analyzes training matrix for "needs-training" gaps
 * - Pairs staff with strong-rated mentors for each CARC code
 * - Auto-creates training assignments for relevant modules
 * - Tracks coaching progress and resolution
 */
export class CoachingRecommendationsController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/admin/coaching/recommendations - list all pending + recent coaching recs */
  public listRecommendations = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const status = (req.query.status as string) || 'all';
      const custId: number = (req as any).actor?.customer_id ?? 0;

      let statusFilter = '';
      if (status !== 'all') {
        statusFilter = `AND cr.status = @status`;
      }
      const custFilter = custId ? `AND cr.customer_id = @custId` : '';

      const request = pool.request();
      if (status !== 'all') request.input('status', sql.NVarChar(30), status);
      if (custId) request.input('custId', sql.Int, custId);

      const result = await request.query(`
        SELECT
          cr.id,
          cr.staff_id AS staffId,
          u.FirstName + ' ' + u.LastName AS staffName,
          u.Role AS staffRole,
          cr.carc_code AS carcCode,
          cr.rating,
          ROUND(cr.staff_avg_min, 1) AS staffAvgMin,
          ROUND(cr.team_avg_min, 1) AS teamAvgMin,
          cr.mentor_id AS mentorId,
          cr.mentor_name AS mentorName,
          cr.module_id AS moduleId,
          cr.assignment_id AS assignmentId,
          cr.review_date AS reviewDate,
          cr.status,
          cr.notes,
          cr.created_at AS createdAt,
          cr.resolved_at AS resolvedAt
        FROM dbo.CoachingRecommendation cr
        LEFT JOIN dbo.Users u ON u.userID = cr.staff_id
        WHERE 1=1 ${statusFilter} ${custFilter}
        ORDER BY
          CASE cr.status WHEN 'pending' THEN 0 WHEN 'in-progress' THEN 1 ELSE 2 END,
          cr.created_at DESC
      `);

      const rows = result.recordset ?? [];
      const summary = {
        pending: rows.filter((r: any) => r.status === 'pending').length,
        inProgress: rows.filter((r: any) => r.status === 'in-progress').length,
        completed: rows.filter((r: any) => r.status === 'completed').length,
        total: rows.length,
      };

      return res.status(200).json({ data: rows, summary });
    } catch (error: unknown) {
      logger.error('CoachingRecommendations.list', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/admin/coaching/generate - analyze training matrix and generate new coaching recs */
  public generateRecommendations = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const custId: number = (_req as any).actor?.customer_id ?? 0;

      // 1. Get performance data per staff/CARC (same logic as training-matrix)
      const matrixReq = pool.request();
      if (custId) matrixReq.input('custId', sql.Int, custId);
      const matrixResult = await matrixReq.query(`
        ;WITH WorkSessions AS (
          SELECT
            ch.AssignedTo,
            ch.CARCCode,
            DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS MinutesWorked
          FROM dbo.claimhistory ch
          WHERE ch.ClaimWorkEndedTime IS NOT NULL
            AND ch.ClaimWorkStartedTime IS NOT NULL
            AND ch.CARCCode IS NOT NULL
            AND ch.CARCCode != ''
            AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) > 0
            AND DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) < 480
        ),
        StaffCodeStats AS (
          SELECT
            ws.AssignedTo,
            ws.CARCCode,
            COUNT(*) AS ClaimCount,
            AVG(CAST(ws.MinutesWorked AS FLOAT)) AS AvgMinutes
          FROM WorkSessions ws
          GROUP BY ws.AssignedTo, ws.CARCCode
          HAVING COUNT(*) >= 3
        ),
        TeamAvg AS (
          SELECT CARCCode, AVG(AvgMinutes) AS TeamAvgMinutes
          FROM StaffCodeStats
          GROUP BY CARCCode
        ),
        Rated AS (
          SELECT
            scs.AssignedTo,
            scs.CARCCode,
            scs.AvgMinutes,
            ta.TeamAvgMinutes,
            scs.ClaimCount,
            CASE
              WHEN scs.AvgMinutes - ta.TeamAvgMinutes < -2 THEN 'strong'
              WHEN scs.AvgMinutes - ta.TeamAvgMinutes <= 2 THEN 'average'
              WHEN scs.AvgMinutes - ta.TeamAvgMinutes <= 5 THEN 'below-average'
              ELSE 'needs-training'
            END AS Rating
          FROM StaffCodeStats scs
          JOIN TeamAvg ta ON ta.CARCCode = scs.CARCCode
        )
        SELECT
          r.AssignedTo AS staffId,
          u.FirstName + ' ' + u.LastName AS staffName,
          u.Role AS staffRole,
          r.CARCCode AS carcCode,
          r.Rating AS rating,
          r.AvgMinutes AS staffAvgMin,
          r.TeamAvgMinutes AS teamAvgMin,
          r.ClaimCount AS claimCount
        FROM Rated r
        JOIN dbo.Users u ON u.userID = r.AssignedTo
        WHERE u.IsActive = 1
          ${custId ? 'AND u.customer_id = @custId' : ''}
        ORDER BY r.AssignedTo, r.CARCCode
      `);

      const allRatings = matrixResult.recordset;

      // Filter to only needs-training and below-average
      const gaps = allRatings.filter((r: any) => r.rating === 'needs-training' || r.rating === 'below-average');
      const strong = allRatings.filter((r: any) => r.rating === 'strong');

      // 2. Check what coaching recs already exist (avoid duplicates)
      const existingReq = pool.request();
      if (custId) existingReq.input('custId', sql.Int, custId);
      const existingResult = await existingReq.query(`
        SELECT staff_id, carc_code FROM dbo.CoachingRecommendation
        WHERE status IN ('pending', 'in-progress')
          ${custId ? 'AND customer_id = @custId' : ''}
      `);
      const existingSet = new Set(
        existingResult.recordset.map((r: any) => `${r.staff_id}_${r.carc_code}`)
      );

      let created = 0;

      for (const gap of gaps) {
        const key = `${gap.staffId}_${gap.carcCode}`;
        if (existingSet.has(key)) continue;

        // Find best mentor: strong in this code, different person, prefer same role
        const mentorCandidates = strong.filter((s: any) =>
          s.carcCode === gap.carcCode && s.staffId !== gap.staffId
        );
        // Prefer same role, then by claim count (more experience)
        mentorCandidates.sort((a: any, b: any) => {
          if (a.staffRole === gap.staffRole && b.staffRole !== gap.staffRole) return -1;
          if (b.staffRole === gap.staffRole && a.staffRole !== gap.staffRole) return 1;
          return b.claimCount - a.claimCount;
        });
        const mentor = mentorCandidates[0] ?? null;

        // Review date: 2 weeks from now
        const reviewDate = new Date();
        reviewDate.setDate(reviewDate.getDate() + 14);

        const insertReq = pool.request()
          .input('staffId', sql.Int, gap.staffId)
          .input('carc', sql.NVarChar(20), gap.carcCode)
          .input('rating', sql.NVarChar(30), gap.rating)
          .input('staffAvg', sql.Float, gap.staffAvgMin)
          .input('teamAvg', sql.Float, gap.teamAvgMin)
          .input('mentorId', sql.Int, mentor?.staffId ?? null)
          .input('mentorName', sql.NVarChar(100), mentor?.staffName ?? null)
          .input('reviewDate', sql.Date, reviewDate);
        if (custId) insertReq.input('custId', sql.Int, custId);
        await insertReq.query(`
            INSERT INTO dbo.CoachingRecommendation
              (staff_id, carc_code, rating, staff_avg_min, team_avg_min, mentor_id, mentor_name, review_date${custId ? ', customer_id' : ''})
            VALUES (@staffId, @carc, @rating, @staffAvg, @teamAvg, @mentorId, @mentorName, @reviewDate${custId ? ', @custId' : ''})
          `);

        created++;
      }

      return res.status(200).json({
        message: 'Coaching recommendations generated',
        created,
        totalGaps: gaps.length,
        existingSkipped: gaps.length - created,
      });
    } catch (error: unknown) {
      logger.error('CoachingRecommendations.generate', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PATCH /api/admin/coaching/recommendations/:id - update status, notes, mentor */
  public updateRecommendation = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = Number(req.params.id);
      const { status, notes, mentorId, mentorName, reviewDate } = req.body;
      const pool = (this as any).pool as sql.ConnectionPool;
      const custId: number = (req as any).actor?.customer_id ?? 0;

      const setClauses: string[] = [];
      const request = pool.request().input('id', sql.Int, id);
      if (custId) request.input('custId', sql.Int, custId);

      if (status) {
        setClauses.push('status = @status');
        request.input('status', sql.NVarChar(30), status);
        if (status === 'completed') {
          setClauses.push('resolved_at = GETUTCDATE()');
        }
      }
      if (notes !== undefined) {
        setClauses.push('notes = @notes');
        request.input('notes', sql.NVarChar(500), notes);
      }
      if (mentorId !== undefined) {
        setClauses.push('mentor_id = @mentorId');
        request.input('mentorId', sql.Int, mentorId);
      }
      if (mentorName !== undefined) {
        setClauses.push('mentor_name = @mentorName');
        request.input('mentorName', sql.NVarChar(100), mentorName);
      }
      if (reviewDate !== undefined) {
        setClauses.push('review_date = @reviewDate');
        request.input('reviewDate', sql.Date, reviewDate ? new Date(reviewDate) : null);
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      await request.query(`
        UPDATE dbo.CoachingRecommendation
        SET ${setClauses.join(', ')}
        WHERE id = @id ${custId ? 'AND customer_id = @custId' : ''}
      `);

      return res.status(200).json({ message: 'Updated' });
    } catch (error: unknown) {
      logger.error('CoachingRecommendations.update', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/coaching/summary - overview stats for coaching dashboard */
  public getSummary = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const custId: number = (_req as any).actor?.customer_id ?? 0;
      const custFilter = custId ? 'WHERE customer_id = @custId' : '';
      const custAnd = custId ? 'AND customer_id = @custId' : '';

      const summaryReq = pool.request();
      if (custId) summaryReq.input('custId', sql.Int, custId);
      const result = await summaryReq.query(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) AS inProgress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          COUNT(*) AS total,
          COUNT(DISTINCT staff_id) AS uniqueStaff,
          COUNT(DISTINCT carc_code) AS uniqueCodes,
          COUNT(DISTINCT mentor_id) AS uniqueMentors
        FROM dbo.CoachingRecommendation
        ${custFilter}
      `);

      // Top gap codes
      const gapReq = pool.request();
      if (custId) gapReq.input('custId', sql.Int, custId);
      const gapResult = await gapReq.query(`
        SELECT TOP 5 carc_code AS carcCode, COUNT(*) AS count
        FROM dbo.CoachingRecommendation
        WHERE status IN ('pending', 'in-progress') ${custAnd}
        GROUP BY carc_code
        ORDER BY COUNT(*) DESC
      `);

      // Top mentors (most assignments)
      const mentorReq = pool.request();
      if (custId) mentorReq.input('custId', sql.Int, custId);
      const mentorResult = await mentorReq.query(`
        SELECT TOP 5 mentor_name AS mentorName, COUNT(*) AS menteeCount
        FROM dbo.CoachingRecommendation
        WHERE mentor_id IS NOT NULL AND status IN ('pending', 'in-progress') ${custAnd}
        GROUP BY mentor_name
        ORDER BY COUNT(*) DESC
      `);

      return res.status(200).json({
        ...(result.recordset[0] ?? {}),
        topGapCodes: gapResult.recordset,
        topMentors: mentorResult.recordset,
      });
    } catch (error: unknown) {
      logger.error('CoachingRecommendations.getSummary', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
