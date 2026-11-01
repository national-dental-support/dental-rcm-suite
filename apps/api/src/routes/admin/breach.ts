import { Router, Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { requireRole } from '../../middleware/require-role';
import { writeAuditLog } from '../../utils/audit-log';

const router = Router();
const pool = Database.getInstance().getPool();

router.get('/', requireRole('Admin'), async (_req: Request, res: Response) => {
  try {
    const result = await pool.request()
      .query(`SELECT * FROM dbo.BreachIncidents ORDER BY discovered_at DESC`);
    return res.json({ data: result.recordset });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const { incident_type, description, affected_records, phi_involved, severity, discovered_at } = req.body;
    const actor = (req as any).actor?.email || 'unknown';
    const result = await pool.request()
      .input('incidentType', sql.NVarChar, incident_type)
      .input('description', sql.NVarChar, description)
      .input('affectedRecords', sql.Int, affected_records || 0)
      .input('phiInvolved', sql.Bit, phi_involved || false)
      .input('severity', sql.NVarChar, severity || 'medium')
      .input('discoveredAt', sql.DateTime2, discovered_at || new Date())
      .input('reportedBy', sql.NVarChar, actor)
      .query(`INSERT INTO dbo.BreachIncidents (incident_type, description, affected_records, phi_involved, severity, discovered_at, reported_by) OUTPUT INSERTED.id VALUES (@incidentType, @description, @affectedRecords, @phiInvolved, @severity, @discoveredAt, @reportedBy)`);
    writeAuditLog(pool, { actor_id: actor, actor_role: (req as any).actor?.role || 'Admin', action: 'breach.create', target_id: String(result.recordset[0]?.id), after_state: { incident_type, severity }, ip_address: req.ip });
    return res.status(201).json({ id: result.recordset[0]?.id, message: 'Breach incident created' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const { status, assigned_to, root_cause, corrective_action, notification_sent } = req.body;
    const actor = (req as any).actor?.email || 'unknown';
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('status', sql.NVarChar, status)
      .input('assignedTo', sql.NVarChar, assigned_to || null)
      .input('rootCause', sql.NVarChar, root_cause || null)
      .input('correctiveAction', sql.NVarChar, corrective_action || null)
      .input('notificationSent', sql.Bit, notification_sent || false)
      .query(`UPDATE dbo.BreachIncidents SET status = @status, assigned_to = ISNULL(@assignedTo, assigned_to), root_cause = ISNULL(@rootCause, root_cause), corrective_action = ISNULL(@correctiveAction, corrective_action), notification_sent = @notificationSent, updated_at = GETUTCDATE() WHERE id = @id`);
    writeAuditLog(pool, { actor_id: actor, actor_role: (req as any).actor?.role || 'Admin', action: 'breach.update', target_id: req.params.id, after_state: { status, notification_sent }, ip_address: req.ip });
    return res.json({ message: 'Breach incident updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/baa', requireRole('Admin'), async (_req: Request, res: Response) => {
  try {
    const result = await pool.request().query(`SELECT * FROM dbo.BusinessAssociateAgreements ORDER BY expiration_date ASC`);
    return res.json({ data: result.recordset });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/baa', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const { vendor_name, vendor_contact, agreement_date, expiration_date, notes } = req.body;
    const actor = (req as any).actor?.email || 'unknown';
    const result = await pool.request()
      .input('vendorName', sql.NVarChar, vendor_name)
      .input('vendorContact', sql.NVarChar, vendor_contact || null)
      .input('agreementDate', sql.Date, agreement_date)
      .input('expirationDate', sql.Date, expiration_date || null)
      .input('notes', sql.NVarChar, notes || null)
      .input('createdBy', sql.NVarChar, actor)
      .query(`INSERT INTO dbo.BusinessAssociateAgreements (vendor_name, vendor_contact, agreement_date, expiration_date, notes, created_by) OUTPUT INSERTED.id VALUES (@vendorName, @vendorContact, @agreementDate, @expirationDate, @notes, @createdBy)`);
    return res.status(201).json({ id: result.recordset[0]?.id, message: 'BAA created' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/baa/:id', requireRole('Admin'), async (req: Request, res: Response) => {
  try {
    const { vendor_name, vendor_contact, agreement_date, expiration_date, status, notes } = req.body;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('vendorName', sql.NVarChar, vendor_name)
      .input('vendorContact', sql.NVarChar, vendor_contact || null)
      .input('agreementDate', sql.Date, agreement_date)
      .input('expirationDate', sql.Date, expiration_date || null)
      .input('status', sql.NVarChar, status || 'active')
      .input('notes', sql.NVarChar, notes || null)
      .query(`UPDATE dbo.BusinessAssociateAgreements SET vendor_name = @vendorName, vendor_contact = @vendorContact, agreement_date = @agreementDate, expiration_date = @expirationDate, status = @status, notes = @notes, updated_at = GETUTCDATE() WHERE id = @id`);
    return res.json({ message: 'BAA updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
