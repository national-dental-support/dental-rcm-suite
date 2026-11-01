import { Router, Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { requireRole } from '../../middleware/require-role';

const router = Router();
function getPool(): sql.ConnectionPool { return Database.getInstance().getPool(); }

/**
 * GET /api/admin/security-audit
 * Returns all security audit scan records.
 */
router.get('/', requireRole('Admin'), async (_req: Request, res: Response) => {
  try {
    const result = await getPool().request().query(`
      SELECT id, scan_type, scan_date, scanner, total_checks, passed, failed, score_pct,
             findings, sast_findings, performed_by, notes, created_at
      FROM dbo.SecurityAuditLog
      ORDER BY scan_date DESC
    `);
    return res.json({ data: result.recordset });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/security-audit/latest
 * Returns the most recent scan of each type.
 */
router.get('/latest', requireRole('Admin'), async (_req: Request, res: Response) => {
  try {
    const result = await getPool().request().query(`
      SELECT TOP 1 id, scan_type, scan_date, scanner, total_checks, passed, failed, score_pct,
             findings, sast_findings, performed_by, notes, created_at
      FROM dbo.SecurityAuditLog
      ORDER BY scan_date DESC
    `);
    return res.json({ data: result.recordset[0] || null });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/admin/security-audit
 * Records a new security scan result.
 * Body: { scan_type, scanner, total_checks, passed, failed, findings, sast_findings, notes }
 */
router.post('/', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const { scan_type = 'DAST', scanner = 'automated', total_checks, passed, failed,
            findings, sast_findings, notes } = req.body;
    const performed_by = req.headers['x-actor-email'] as string || 'system';

    const result = await getPool().request()
      .input('scan_type',     sql.NVarChar(20),   scan_type)
      .input('scanner',       sql.NVarChar(100),  scanner)
      .input('total_checks',  sql.Int,             parseInt(total_checks) || 0)
      .input('passed',        sql.Int,             parseInt(passed) || 0)
      .input('failed',        sql.Int,             parseInt(failed) || 0)
      .input('findings',      sql.NVarChar(sql.MAX), findings ? JSON.stringify(findings) : null)
      .input('sast_findings', sql.NVarChar(sql.MAX), sast_findings ? JSON.stringify(sast_findings) : null)
      .input('performed_by',  sql.NVarChar(200),  performed_by)
      .input('notes',         sql.NVarChar(500),  notes || null)
      .query(`
        INSERT INTO dbo.SecurityAuditLog
          (scan_type, scanner, total_checks, passed, failed, findings, sast_findings, performed_by, notes)
        OUTPUT INSERTED.id, INSERTED.scan_date, INSERTED.score_pct
        VALUES (@scan_type, @scanner, @total_checks, @passed, @failed,
                @findings, @sast_findings, @performed_by, @notes)
      `);

    return res.status(201).json({ data: result.recordset[0] });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/security-audit/compliance
 * Returns the latest COMPLIANCE scan with full parsed findings.
 */
router.get('/compliance', requireRole('Admin'), async (_req: Request, res: Response) => {
  try {
    const result = await getPool().request().query(`
      SELECT TOP 1 id, scan_type, scan_date, scanner, total_checks, passed, failed, score_pct,
             findings, sast_findings, performed_by, notes, created_at
      FROM dbo.SecurityAuditLog
      WHERE scan_type = 'COMPLIANCE'
      ORDER BY scan_date DESC
    `);
    const row = result.recordset[0] || null;
    if (row && row.findings && typeof row.findings === 'string') {
      try { row.findings = JSON.parse(row.findings); } catch { /* leave as string */ }
    }
    return res.json({ data: row });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/security-audit/data-validation
 * Returns the latest DATA_VALIDATION scan.
 */
router.get('/data-validation', requireRole('Admin'), async (_req: Request, res: Response) => {
  try {
    const result = await getPool().request().query(`
      SELECT TOP 1 id, scan_type, scan_date, scanner, total_checks, passed, failed, score_pct,
             findings, sast_findings, performed_by, notes, created_at
      FROM dbo.SecurityAuditLog
      WHERE scan_type = 'DATA_VALIDATION'
      ORDER BY scan_date DESC
    `);
    const row = result.recordset[0] || null;
    if (row && row.findings && typeof row.findings === 'string') {
      try { row.findings = JSON.parse(row.findings); } catch { /* leave as string */ }
    }
    return res.json({ data: row });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/security-audit/access-log
 * Returns recent access audit log entries (who accessed what, when) for SOC2/HIPAA audit.
 * Query: ?days=30&limit=500
 */
router.get('/access-log', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 5000);
    const result = await getPool().request()
      .input('days', sql.Int, days)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          a.id, a.actor_id, a.actor_role, a.action, a.target_id,
          a.ip_address, a.session_id, a.timestamp, a.created_at,
          u.first_name + ' ' + u.last_name AS actor_name,
          u.email AS actor_email
        FROM dbo.AdminAuditLog a
        LEFT JOIN dbo.Users u ON u.id = a.actor_id
        WHERE a.timestamp >= DATEADD(DAY, -@days, GETDATE())
        ORDER BY a.timestamp DESC
      `);
    return res.json({ data: result.recordset });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/security-audit/access-summary
 * Aggregated access summary: who accessed what products/endpoints and how often.
 * For SOC2/HIPAA evidence of access controls.
 */
router.get('/access-summary', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const result = await getPool().request()
      .input('days', sql.Int, days)
      .query(`
        SELECT
          u.email, u.first_name + ' ' + u.last_name AS name,
          u.role, u.customer_id,
          COUNT(a.id) AS action_count,
          COUNT(DISTINCT a.action) AS distinct_actions,
          MAX(a.timestamp) AS last_action,
          MIN(a.timestamp) AS first_action
        FROM dbo.Users u
        LEFT JOIN dbo.AdminAuditLog a ON a.actor_id = u.id
          AND a.timestamp >= DATEADD(DAY, -@days, GETDATE())
        WHERE u.archived IS NULL OR u.archived = 0
        GROUP BY u.id, u.email, u.first_name, u.last_name, u.role, u.customer_id
        ORDER BY action_count DESC
      `);
    return res.json({ data: result.recordset });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/security-audit/ephi-inventory
 * Returns ePHI/PII field inventory from the latest compliance scan.
 * Structured for SOC2/HIPAA auditor consumption.
 */
router.get('/ephi-inventory', requireRole('Admin'), async (_req: Request, res: Response) => {
  try {
    const result = await getPool().request().query(`
      SELECT TOP 1 findings
      FROM dbo.SecurityAuditLog
      WHERE scan_type = 'COMPLIANCE'
      ORDER BY scan_date DESC
    `);
    const row = result.recordset[0];
    if (!row || !row.findings) {
      return res.json({ data: { ephi_map: [], masking: [], summary: null } });
    }
    let findings = row.findings;
    if (typeof findings === 'string') {
      try { findings = JSON.parse(findings); } catch { return res.json({ data: { ephi_map: [], masking: [], summary: null } }); }
    }
    return res.json({
      data: {
        ephi_map: findings.ephi_map || [],
        masking: findings.masking || [],
        summary: findings.summary || null,
      }
    });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/security-audit/export/:id
 * Returns a full compliance scan formatted for auditor export (JSON structure).
 * The frontend renders this as PDF/CSV.
 */
router.get('/export/:id', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const result = await getPool().request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query(`
        SELECT id, scan_type, scan_date, scanner, total_checks, passed, failed, score_pct,
               findings, sast_findings, performed_by, notes, created_at
        FROM dbo.SecurityAuditLog
        WHERE id = @id
      `);
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ message: 'Scan not found' });
    if (row.findings && typeof row.findings === 'string') {
      try { row.findings = JSON.parse(row.findings); } catch { /* ok */ }
    }
    if (row.sast_findings && typeof row.sast_findings === 'string') {
      try { row.sast_findings = JSON.parse(row.sast_findings); } catch { /* ok */ }
    }
    return res.json({ data: row });
  } catch (e) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
