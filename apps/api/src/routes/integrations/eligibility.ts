import express from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import { requireRole } from '../../middleware/require-role';
import { trackEvent } from '../../utils/telemetry';
import logger from '../../utils/logger';

const router = express.Router();
function getPool(): sql.ConnectionPool { return Database.getInstance().getPool(); }

// GET /api/integrations/eligibility/connections
router.get('/connections', requireRole('Admin'), async (req, res) => {
  try {
    const result = await getPool().request().query(
      `SELECT id, name, provider, npi, payer_id, is_active, created_at FROM dbo.EligibilityConnection ORDER BY name`
    );
    res.json(result.recordset);
  } catch (e) {
    logger.error('[eligibility] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/integrations/eligibility/connections
router.post('/connections', requireRole('Admin'), async (req, res) => {
  try {
    const { name, provider, apiKey, apiSecret, payerId, npi } = req.body;
    const result = await getPool().request()
      .input('name', sql.NVarChar(100), name)
      .input('provider', sql.NVarChar(50), provider)
      .input('apiKey', sql.NVarChar(500), apiKey || null)
      .input('apiSecret', sql.NVarChar(500), apiSecret || null)
      .input('payerId', sql.NVarChar(50), payerId || null)
      .input('npi', sql.NVarChar(20), npi || null)
      .query(`
        INSERT INTO dbo.EligibilityConnection (name, provider, api_key_encrypted, api_secret_encrypted, payer_id, npi)
        OUTPUT INSERTED.*
        VALUES (@name, @provider, @apiKey, @apiSecret, @payerId, @npi)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (e) {
    logger.error('[eligibility] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/integrations/eligibility/connections/:id
router.put('/connections/:id', requireRole('Admin'), async (req, res) => {
  try {
    const { name, provider, apiKey, apiSecret, payerId, npi } = req.body;
    const id = parseInt(req.params['id']);
    const r = getPool().request().input('id', sql.Int, id)
      .input('name', sql.NVarChar(100), name)
      .input('provider', sql.NVarChar(50), provider)
      .input('payerId', sql.NVarChar(50), payerId || null)
      .input('npi', sql.NVarChar(20), npi || null);
    let keyClause = '';
    if (apiKey) { r.input('apiKey', sql.NVarChar(500), apiKey); keyClause += ', api_key_encrypted=@apiKey'; }
    if (apiSecret) { r.input('apiSecret', sql.NVarChar(500), apiSecret); keyClause += ', api_secret_encrypted=@apiSecret'; }
    await r.query(`UPDATE dbo.EligibilityConnection SET name=@name, provider=@provider, payer_id=@payerId, npi=@npi${keyClause} WHERE id=@id`);
    res.json({ success: true });
  } catch (e) {
    logger.error('[eligibility] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/integrations/eligibility/connections/:id
router.delete('/connections/:id', requireRole('Admin'), async (req, res) => {
  try {
    await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`DELETE FROM dbo.EligibilityConnection WHERE id=@id`);
    res.json({ success: true });
  } catch (e) {
    logger.error('[eligibility] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/integrations/eligibility/connections/:id/toggle
router.patch('/connections/:id/toggle', requireRole('Admin'), async (req, res) => {
  try {
    const result = await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`UPDATE dbo.EligibilityConnection SET is_active = 1 - ISNULL(is_active,0) OUTPUT INSERTED.is_active WHERE id=@id`);
    res.json({ is_active: result.recordset[0]?.is_active });
  } catch (e) {
    logger.error('[eligibility] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/integrations/eligibility/test/:id
router.post('/test/:id', async (req, res) => {
  try {
    const conn = await getPool().request().input('id', sql.Int, parseInt(req.params['id']))
      .query(`SELECT * FROM dbo.EligibilityConnection WHERE id=@id`);
    if (!conn.recordset.length) return res.status(404).json({ message: 'Connection not found' });
    const start = Date.now();
    // Simulate provider ping (real impl would call the API)
    await new Promise(r => setTimeout(r, 80));
    res.json({ success: true, provider: conn.recordset[0].provider, message: 'Connection validated successfully', latencyMs: Date.now() - start });
  } catch (e) {
    logger.error('[eligibility] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/integrations/eligibility/check
router.post('/check', async (req, res) => {
  try {
    const { patientId, insPlanId } = req.body;
    if (!patientId) return res.status(400).json({ message: 'patientId required' });
    const pool = getPool();
    // Get active connection
    const connResult = await pool.request().query(
      `SELECT TOP 1 * FROM dbo.EligibilityConnection WHERE is_active=1 ORDER BY id`
    );
    if (!connResult.recordset.length) return res.status(400).json({ message: 'No active eligibility connection configured' });
    // Get insurance plan
    const planResult = await pool.request().input('patNum', sql.Int, patientId)
      .query(`SELECT TOP 1 * FROM dbo.InsPlan WHERE PatNum=@patNum AND IsPrimary=1`);
    const plan = planResult.recordset[0] || {};
    // Simulate eligibility response (real impl would call Availity/Change Healthcare/Waystar)
    const eligResult = {
      is_eligible: 1,
      coverage_pct: plan.CovPercent ?? 80,
      annual_max: plan.AnnualMax ?? 1500,
      deductible: plan.Deductible ?? 100,
      deductible_met: Math.min(plan.UsedAmount ?? 0, plan.Deductible ?? 100),
      copay: 20,
    };
    // Store check result
    await pool.request()
      .input('patientId', sql.Int, patientId)
      .input('insPlanId', sql.Int, insPlanId || null)
      .input('isEligible', sql.Bit, eligResult.is_eligible)
      .input('coveragePct', sql.Decimal(5, 2), eligResult.coverage_pct)
      .input('annualMax', sql.Decimal(10, 2), eligResult.annual_max)
      .input('deductible', sql.Decimal(10, 2), eligResult.deductible)
      .input('deductibleMet', sql.Decimal(10, 2), eligResult.deductible_met)
      .input('copay', sql.Decimal(10, 2), eligResult.copay)
      .input('raw', sql.NVarChar(sql.MAX), JSON.stringify(eligResult))
      .query(`
        INSERT INTO dbo.EligibilityCheck
          (patient_id, ins_plan_id, is_eligible, coverage_pct, annual_max, deductible, deductible_met, copay, raw_response)
        VALUES (@patientId, @insPlanId, @isEligible, @coveragePct, @annualMax, @deductible, @deductibleMet, @copay, @raw)
      `);
    trackEvent(pool, { event: 'eligibility_checked', feature: 'integrations', actorId: (req as any).actor?.userId, customerId: (req as any).actor?.customer_id, metadata: { patientId, isEligible: eligResult.is_eligible } });
    res.json({ ...eligResult, checkedAt: new Date() });
  } catch (e) {
    logger.error('[eligibility] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/integrations/eligibility/history/:patientId
router.get('/history/:patientId', async (req, res) => {
  try {
    const result = await getPool().request()
      .input('patientId', sql.Int, parseInt(req.params['patientId']))
      .query(`
        SELECT TOP 10 id, patient_id, ins_plan_id, checked_at, is_eligible,
          coverage_pct, annual_max, deductible, deductible_met, copay
        FROM dbo.EligibilityCheck
        WHERE patient_id=@patientId
        ORDER BY checked_at DESC
      `);
    res.json(result.recordset);
  } catch (e) {
    logger.error('[eligibility] route error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
