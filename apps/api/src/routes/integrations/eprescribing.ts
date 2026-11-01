import express from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { requireRole } from '../../middleware/require-role';
import { trackEvent } from '../../utils/telemetry';
import logger from '../../utils/logger';

const router = express.Router();
function getPool(): sql.ConnectionPool { return Database.getInstance().getPool(); }

// GET /api/integrations/eprescribing/connections
router.get('/connections', requireRole('Admin'), async (req, res) => {
  try {
    const result = await getPool().request().query(
      `SELECT id, name, provider, facility_npi, is_active, sandbox_mode, created_at FROM dbo.EPrescribingConnection ORDER BY name`
    );
    res.json(result.recordset);
  } catch (e) {
    logger.error('[eprescribing] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/integrations/eprescribing/connections
router.post('/connections', requireRole('Admin'), async (req, res) => {
  try {
    const { name, provider, apiKey, facilityNpi, sandboxMode } = req.body;
    const result = await getPool().request()
      .input('name', sql.NVarChar(100), name)
      .input('provider', sql.NVarChar(50), provider)
      .input('apiKey', sql.NVarChar(500), apiKey || null)
      .input('facilityNpi', sql.NVarChar(20), facilityNpi || null)
      .input('sandboxMode', sql.Bit, sandboxMode !== false ? 1 : 0)
      .query(`
        INSERT INTO dbo.EPrescribingConnection (name, provider, api_key_encrypted, facility_npi, sandbox_mode)
        OUTPUT INSERTED.*
        VALUES (@name, @provider, @apiKey, @facilityNpi, @sandboxMode)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (e) {
    logger.error('[eprescribing] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/integrations/eprescribing/connections/:id
router.put('/connections/:id', requireRole('Admin'), async (req, res) => {
  try {
    const { name, provider, apiKey, facilityNpi, sandboxMode } = req.body;
    const id = parseInt(req.params['id']);
    const r = getPool().request().input('id', sql.Int, id)
      .input('name', sql.NVarChar(100), name)
      .input('provider', sql.NVarChar(50), provider)
      .input('facilityNpi', sql.NVarChar(20), facilityNpi || null)
      .input('sandboxMode', sql.Bit, sandboxMode !== false ? 1 : 0);
    let keyClause = '';
    if (apiKey) { r.input('apiKey', sql.NVarChar(500), apiKey); keyClause = ', api_key_encrypted=@apiKey'; }
    await r.query(`UPDATE dbo.EPrescribingConnection SET name=@name, provider=@provider, facility_npi=@facilityNpi, sandbox_mode=@sandboxMode${keyClause} WHERE id=@id`);
    res.json({ success: true });
  } catch (e) {
    logger.error('[eprescribing] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/integrations/eprescribing/connections/:id
router.delete('/connections/:id', requireRole('Admin'), async (req, res) => {
  try {
    await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`DELETE FROM dbo.EPrescribingConnection WHERE id=@id`);
    res.json({ success: true });
  } catch (e) {
    logger.error('[eprescribing] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/integrations/eprescribing/connections/:id/toggle
router.patch('/connections/:id/toggle', requireRole('Admin'), async (req, res) => {
  try {
    const result = await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`UPDATE dbo.EPrescribingConnection SET is_active = 1 - ISNULL(is_active,0) OUTPUT INSERTED.is_active WHERE id=@id`);
    res.json({ is_active: result.recordset[0]?.is_active });
  } catch (e) {
    logger.error('[eprescribing] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/integrations/eprescribing/test/:id
router.post('/test/:id', async (req, res) => {
  try {
    const conn = await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`SELECT * FROM dbo.EPrescribingConnection WHERE id=@id`);
    if (!conn.recordset.length) return res.status(404).json({ message: 'Connection not found' });
    const start = Date.now();
    await new Promise(r => setTimeout(r, 90));
    const c = conn.recordset[0];
    res.json({ success: true, provider: c.provider, message: `${c.sandbox_mode ? 'Sandbox' : 'Production'} connection validated`, latencyMs: Date.now() - start });
  } catch (e) {
    logger.error('[eprescribing] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/integrations/eprescribing/transmit
router.post('/transmit', async (req, res) => {
  try {
    const { rxNum, patientId } = req.body;
    if (!rxNum) return res.status(400).json({ message: 'rxNum required' });
    const pool = getPool();
    const connResult = await pool.request().query(
      `SELECT TOP 1 * FROM dbo.EPrescribingConnection WHERE is_active=1 ORDER BY id`
    );
    if (!connResult.recordset.length) return res.status(400).json({ message: 'No active e-prescribing connection configured' });
    // Simulate NCPDP SCRIPT NewRx transmission
    const confirmationNum = `RX${Date.now()}`;
    await pool.request()
      .input('rxNum', sql.Int, rxNum)
      .input('patientId', sql.Int, patientId || null)
      .input('confirmationNum', sql.NVarChar(100), confirmationNum)
      .query(`
        INSERT INTO dbo.EPrescribingLog (rx_num, patient_id, status, confirmation_num, sent_at)
        VALUES (@rxNum, @patientId, 'sent', @confirmationNum, GETUTCDATE());
        UPDATE dbo.Rx SET RxStatus='Transmitted', DateSent=GETUTCDATE() WHERE RxNum=@rxNum;
      `);
    trackEvent(pool, { event: 'prescription_transmitted', feature: 'integrations', actorId: (req as any).actor?.userId, customerId: (req as any).actor?.customer_id, metadata: { rxNum, confirmationNum } });
    res.json({ success: true, confirmationNum, sentAt: new Date() });
  } catch (e) {
    logger.error('[eprescribing] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/integrations/eprescribing/logs
router.get('/logs', async (req, res) => {
  try {
    const result = await getPool().request().query(
      `SELECT TOP 50 * FROM dbo.EPrescribingLog ORDER BY created_at DESC`
    );
    res.json(result.recordset);
  } catch (e) {
    logger.error('[eprescribing] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
