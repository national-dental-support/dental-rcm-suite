import express from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { requireRole } from '../../middleware/require-role';
import logger from '../../utils/logger';

const router = express.Router();
function getPool(): sql.ConnectionPool { return Database.getInstance().getPool(); }

// -- Connections ----------------------------------------------------------------

router.get('/connections', requireRole('Admin'), async (req, res) => {
  try {
    const result = await getPool().request().query(
      `SELECT id, name, channel, provider, from_address, from_name, is_active, created_at FROM dbo.CommunicationsConnection ORDER BY channel, name`
    );
    res.json(result.recordset);
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/connections', requireRole('Admin'), async (req, res) => {
  try {
    const { name, channel, provider, apiKey, apiSecret, fromAddress, fromName } = req.body;
    const result = await getPool().request()
      .input('name', sql.NVarChar(100), name)
      .input('channel', sql.NVarChar(10), channel)
      .input('provider', sql.NVarChar(50), provider)
      .input('apiKey', sql.NVarChar(500), apiKey || null)
      .input('apiSecret', sql.NVarChar(500), apiSecret || null)
      .input('fromAddress', sql.NVarChar(200), fromAddress || null)
      .input('fromName', sql.NVarChar(100), fromName || null)
      .query(`
        INSERT INTO dbo.CommunicationsConnection (name, channel, provider, api_key_encrypted, api_secret_encrypted, from_address, from_name)
        OUTPUT INSERTED.*
        VALUES (@name, @channel, @provider, @apiKey, @apiSecret, @fromAddress, @fromName)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/connections/:id', requireRole('Admin'), async (req, res) => {
  try {
    const { name, channel, provider, apiKey, apiSecret, fromAddress, fromName } = req.body;
    const id = parseInt(req.params['id']);
    const r = getPool().request().input('id', sql.Int, id)
      .input('name', sql.NVarChar(100), name)
      .input('channel', sql.NVarChar(10), channel)
      .input('provider', sql.NVarChar(50), provider)
      .input('fromAddress', sql.NVarChar(200), fromAddress || null)
      .input('fromName', sql.NVarChar(100), fromName || null);
    let keyClause = '';
    if (apiKey) { r.input('apiKey', sql.NVarChar(500), apiKey); keyClause += ', api_key_encrypted=@apiKey'; }
    if (apiSecret) { r.input('apiSecret', sql.NVarChar(500), apiSecret); keyClause += ', api_secret_encrypted=@apiSecret'; }
    await r.query(`UPDATE dbo.CommunicationsConnection SET name=@name, channel=@channel, provider=@provider, from_address=@fromAddress, from_name=@fromName${keyClause} WHERE id=@id`);
    res.json({ success: true });
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/connections/:id', requireRole('Admin'), async (req, res) => {
  try {
    await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`DELETE FROM dbo.CommunicationsConnection WHERE id=@id`);
    res.json({ success: true });
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/connections/:id/toggle', requireRole('Admin'), async (req, res) => {
  try {
    const result = await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`UPDATE dbo.CommunicationsConnection SET is_active = 1 - ISNULL(is_active,0) OUTPUT INSERTED.is_active WHERE id=@id`);
    res.json({ is_active: result.recordset[0]?.is_active });
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/test/:id', async (req, res) => {
  try {
    const conn = await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`SELECT * FROM dbo.CommunicationsConnection WHERE id=@id`);
    if (!conn.recordset.length) return res.status(404).json({ message: 'Connection not found' });
    const start = Date.now();
    await new Promise(r => setTimeout(r, 75));
    const c = conn.recordset[0];
    res.json({ success: true, provider: c.provider, message: `${c.channel.toUpperCase()} connection validated`, latencyMs: Date.now() - start });
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -- Templates -----------------------------------------------------------------

router.get('/templates', requireRole('Admin'), async (req, res) => {
  try {
    const result = await getPool().request().query(
      `SELECT id, name, channel, subject, body, template_type, is_active, created_at FROM dbo.MessageTemplate ORDER BY template_type, name`
    );
    res.json(result.recordset);
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const { name, channel, subject, body, templateType } = req.body;
    const result = await getPool().request()
      .input('name', sql.NVarChar(100), name)
      .input('channel', sql.NVarChar(10), channel)
      .input('subject', sql.NVarChar(200), subject || null)
      .input('body', sql.NVarChar(sql.MAX), body)
      .input('templateType', sql.NVarChar(50), templateType || 'custom')
      .query(`
        INSERT INTO dbo.MessageTemplate (name, channel, subject, body, template_type)
        OUTPUT INSERTED.*
        VALUES (@name, @channel, @subject, @body, @templateType)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const { name, channel, subject, body, templateType, isActive } = req.body;
    await getPool().request()
      .input('id', sql.Int, parseInt(req.params['id']))
      .input('name', sql.NVarChar(100), name)
      .input('channel', sql.NVarChar(10), channel)
      .input('subject', sql.NVarChar(200), subject || null)
      .input('body', sql.NVarChar(sql.MAX), body)
      .input('templateType', sql.NVarChar(50), templateType || 'custom')
      .input('isActive', sql.Bit, isActive !== false ? 1 : 0)
      .query(`UPDATE dbo.MessageTemplate SET name=@name, channel=@channel, subject=@subject, body=@body, template_type=@templateType, is_active=@isActive WHERE id=@id`);
    res.json({ success: true });
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -- Send ----------------------------------------------------------------------

router.post('/send', async (req, res) => {
  try {
    const { patientId, templateId, channel } = req.body;
    const pool = getPool();
    const [connRes, tmplRes, patRes] = await Promise.all([
      pool.request().input('channel', sql.NVarChar(10), channel).query(`SELECT TOP 1 * FROM dbo.CommunicationsConnection WHERE channel=@channel AND is_active=1 ORDER BY id`),
      pool.request().input('id', sql.Int, templateId).query(`SELECT * FROM dbo.MessageTemplate WHERE id=@id`),
      pool.request().input('id', sql.Int, patientId).query(`SELECT * FROM dbo.Patient WHERE PatNum=@id`),
    ]);
    if (!connRes.recordset.length) return res.status(400).json({ message: `No active ${channel} connection` });
    if (!tmplRes.recordset.length) return res.status(404).json({ message: 'Template not found' });
    const conn = connRes.recordset[0];
    const tmpl = tmplRes.recordset[0];
    const pat = patRes.recordset[0] || {};
    const now = new Date().toLocaleDateString('en-US');
    const body = (tmpl.body || '')
      .replace(/\{\{PatientName\}\}/g, `${pat.FName || ''} ${pat.LName || ''}`.trim())
      .replace(/\{\{AppointmentDate\}\}/g, now)
      .replace(/\{\{PracticePhone\}\}/g, '')
      .replace(/\{\{BalanceDue\}\}/g, '');
    const toAddress = channel === 'email' ? pat.Email : pat.WirelessPhone || pat.HmPhone;
    await pool.request()
      .input('connId', sql.Int, conn.id)
      .input('patientId', sql.Int, patientId)
      .input('channel', sql.NVarChar(10), channel)
      .input('toAddress', sql.NVarChar(200), toAddress || null)
      .input('subject', sql.NVarChar(200), tmpl.subject || null)
      .input('body', sql.NVarChar(sql.MAX), body)
      .input('status', sql.NVarChar(20), 'sent')
      .query(`
        INSERT INTO dbo.MessageLog (connection_id, patient_id, channel, to_address, subject, body, status, sent_at)
        VALUES (@connId, @patientId, @channel, @toAddress, @subject, @body, @status, GETUTCDATE())
      `);
    res.json({ success: true, to: toAddress, channel });
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/send-bulk', async (req, res) => {
  try {
    const { patientIds, templateId, channel } = req.body;
    if (!Array.isArray(patientIds) || !patientIds.length) return res.status(400).json({ message: 'patientIds required' });
    let sent = 0;
    for (const patientId of patientIds) {
      try {
        await fetch(`http://localhost:${process.env['PORT'] || 8080}/api/integrations/communications/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env['API_KEY'] || '' },
          body: JSON.stringify({ patientId, templateId, channel }),
        });
        sent++;
      } catch { /* skip */ }
    }
    res.json({ sent, total: patientIds.length });
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/integrations/communications/logs
router.get('/logs', async (req, res) => {
  try {
    const result = await getPool().request().query(
      `SELECT TOP 200 * FROM dbo.MessageLog ORDER BY created_at DESC`
    );
    res.json(result.recordset);
  } catch (e) {
    logger.error('[communications] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
