import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

/** Full step-set with nested steps + checklists */
export interface RemediationStepSetFull {
  id: number;
  reason_code: string;
  role: string;
  status: string;
  version: number;
  published_at: string | null;
  published_by: string | null;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
  created_by: string | null;
  steps: Array<{
    id: number;
    sort_order: number;
    title: string;
    body: string | null;
    required: boolean;
    checklist: Array<{ id: number; sort_order: number; item_text: string }>;
  }>;
}

export class AdminRemediationController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  // -------------------------------------------------------------------------
  // GET /api/admin/remediation/sets
  // Query: reasonCode, role, status, limit
  // -------------------------------------------------------------------------
  public listSets = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { reasonCode, role, status, limit } = req.query as Record<string, string>;
      const top = Math.min(Number(limit) || 200, 500);
      const request = this.pool.request();
      const xenCustId = extractCustomerId(req);

      const conditions: string[] = [];
      if (xenCustId != null) {
        request.input('_custId', sql.Int, xenCustId);
        conditions.push('(s.customer_id = @_custId OR s.customer_id IS NULL)');
      }
      if (reasonCode) {
        request.input('reasonCode', sql.NVarChar(50), reasonCode);
        conditions.push('s.reason_code = @reasonCode');
      }
      if (role) {
        request.input('role', sql.NVarChar(50), role);
        conditions.push('s.role = @role');
      }
      if (status) {
        request.input('status', sql.NVarChar(20), status);
        conditions.push('s.status = @status');
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await request.query(`
        SELECT TOP ${top}
          s.id, s.reason_code, s.role, s.status, s.version,
          s.published_at, s.published_by,
          s.updated_at, s.updated_by,
          s.created_at, s.created_by,
          step_count = (SELECT COUNT(*) FROM dbo.RemediationStep WHERE set_id = s.id)
        FROM dbo.RemediationStepSet s
        ${where}
        ORDER BY s.reason_code, s.role, s.version DESC
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('AdminRemediation.listSets', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // GET /api/admin/remediation/sets/:id
  // -------------------------------------------------------------------------
  public getSet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const request = this.pool.request();
      request.input('id', sql.Int, Number(id));

      const xenCustId = extractCustomerId(req);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);
      const custFilter = xenCustId != null ? 'AND (s.customer_id = @_custId OR s.customer_id IS NULL)' : '';

      const setResult = await request.query(`
        SELECT s.id, s.reason_code, s.role, s.status, s.version,
               s.published_at, s.published_by,
               s.updated_at, s.updated_by,
               s.created_at, s.created_by
        FROM dbo.RemediationStepSet s
        WHERE s.id = @id ${custFilter}
      `);

      if (!setResult.recordset.length) {
        return res.status(404).json({ message: 'Step set not found' });
      }

      const stepResult = await this.pool.request()
        .input('setId', sql.Int, Number(id))
        .query(`
          SELECT st.id, st.sort_order, st.title, st.body, st.required,
                 cl.id AS cl_id, cl.sort_order AS cl_sort, cl.item_text
          FROM dbo.RemediationStep st
          LEFT JOIN dbo.RemediationStepChecklist cl
            ON cl.step_id = st.id
          WHERE st.set_id = @setId
          ORDER BY st.sort_order, cl.sort_order
        `);

      // Aggregate steps + checklists
      const stepsMap = new Map<number, RemediationStepSetFull['steps'][0]>();
      for (const row of stepResult.recordset) {
        if (!stepsMap.has(row.id)) {
          stepsMap.set(row.id, {
            id: row.id,
            sort_order: row.sort_order,
            title: row.title,
            body: row.body,
            required: !!row.required,
            checklist: [],
          });
        }
        if (row.cl_id != null) {
          stepsMap.get(row.id)!.checklist.push({
            id: row.cl_id,
            sort_order: row.cl_sort,
            item_text: row.item_text,
          });
        }
      }

      const payload: RemediationStepSetFull = {
        ...setResult.recordset[0],
        steps: Array.from(stepsMap.values()),
      };

      return res.status(200).json({ data: payload });
    } catch (error: unknown) {
      logger.error('AdminRemediation.getSet', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // POST /api/admin/remediation/sets
  // Body: { reason_code, role, steps: [{ title, body, required, checklist: [] }] }
  // -------------------------------------------------------------------------
  public createSet = async (req: Request, res: Response): Promise<Response> => {
    const { reason_code, role, steps = [] } = req.body as {
      reason_code: string;
      role: string;
      steps: Array<{ title: string; body?: string; required?: boolean; checklist?: string[] }>;
    };

    if (!reason_code || !role) {
      return res.status(400).json({ message: 'reason_code and role are required' });
    }

    const actor = (req as any).actor?.email ?? 'unknown';

    try {
      const xenCustId = extractCustomerId(req);

      // Guard: prevent duplicate drafts for the same (reason_code, role, tenant) combination.
      // If one already exists, return 409 with its ID so the caller can switch to PUT.
      const dupReq = this.pool.request();
      dupReq.input('reasonCode', sql.NVarChar(50), reason_code);
      dupReq.input('role', sql.NVarChar(50), role);
      const custFilter = xenCustId != null
        ? (dupReq.input('_custId', sql.Int, xenCustId), 'AND customer_id = @_custId')
        : 'AND customer_id IS NULL';

      const existing = await dupReq.query(`
        SELECT TOP 1 id FROM dbo.RemediationStepSet
        WHERE reason_code = @reasonCode AND role = @role AND status = 'draft'
        ${custFilter}
      `);

      if (existing.recordset.length) {
        return res.status(409).json({
          message: 'A draft already exists for this reason_code and role combination.',
          data: { id: existing.recordset[0].id },
        });
      }

      const setRequest = this.pool.request();
      setRequest.input('reasonCode', sql.NVarChar(50), reason_code);
      setRequest.input('role', sql.NVarChar(50), role);
      setRequest.input('actor', sql.NVarChar(255), actor);
      setRequest.input('_custId', sql.Int, xenCustId ?? null);

      const setResult = await setRequest.query(`
        INSERT INTO dbo.RemediationStepSet (reason_code, role, status, version, created_by, updated_by, customer_id)
        OUTPUT INSERTED.id
        VALUES (@reasonCode, @role, 'draft', 1, @actor, @actor, @_custId)
      `);

      const setId: number = setResult.recordset[0].id;

      await this._saveSteps(setId, steps);

      return res.status(201).json({ data: { id: setId } });
    } catch (error: unknown) {
      logger.error('AdminRemediation.createSet', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // PUT /api/admin/remediation/sets/:id
  // Replaces all steps + checklists with new payload
  // -------------------------------------------------------------------------
  public updateSet = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return res.status(400).json({ message: 'Invalid set id' });
    }

    const { reason_code, role, steps = [] } = req.body as {
      reason_code?: string;
      role?: string;
      steps: Array<{ title: string; body?: string; required?: boolean; checklist?: string[] }>;
    };

    const actor = (req as any).actor?.email ?? 'unknown';

    try {
      // Verify set exists
      const check = await this.pool.request()
        .input('id', sql.Int, numericId)
        .query(`SELECT id FROM dbo.RemediationStepSet WHERE id = @id`);

      if (!check.recordset.length) {
        return res.status(404).json({ message: 'Step set not found' });
      }

      const updateReq = this.pool.request();
      updateReq.input('id', sql.Int, numericId);
      updateReq.input('actor', sql.NVarChar(255), actor);
      const setClauses: string[] = ['updated_at = GETUTCDATE()', 'updated_by = @actor'];

      if (reason_code) {
        updateReq.input('reasonCode', sql.NVarChar(50), reason_code);
        setClauses.push('reason_code = @reasonCode');
      }
      if (role) {
        updateReq.input('role', sql.NVarChar(50), role);
        setClauses.push('role = @role');
      }

      await updateReq.query(`
        UPDATE dbo.RemediationStepSet
        SET ${setClauses.join(', ')}
        WHERE id = @id
      `);

      // Delete checklist items first (no FK cascade in schema), then steps
      await this.pool.request()
        .input('setId', sql.Int, numericId)
        .query(`
          DELETE cl FROM dbo.RemediationStepChecklist cl
          JOIN dbo.RemediationStep st ON st.id = cl.step_id
          WHERE st.set_id = @setId
        `);

      await this.pool.request()
        .input('setId', sql.Int, numericId)
        .query(`DELETE FROM dbo.RemediationStep WHERE set_id = @setId`);

      await this._saveSteps(numericId, steps);

      return res.status(200).json({ data: { id: numericId } });
    } catch (error: unknown) {
      logger.error('AdminRemediation.updateSet', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // POST /api/admin/remediation/sets/:id/publish
  // Promotes draft -> active; increments version; snapshots history
  // -------------------------------------------------------------------------
  public publishSet = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const actor = (req as any).actor?.email ?? 'unknown';

    try {
      // Get current set (include customer_id for tenant-scoped archival)
      const setCheck = await this.pool.request()
        .input('id', sql.Int, Number(id))
        .query(`SELECT id, reason_code, role, version, customer_id FROM dbo.RemediationStepSet WHERE id = @id`);

      if (!setCheck.recordset.length) {
        return res.status(404).json({ message: 'Step set not found' });
      }

      const { reason_code, role, version, customer_id } = setCheck.recordset[0];

      // Deactivate any existing active set for same reason_code+role within the same tenant
      const archiveReq = this.pool.request()
        .input('reasonCode', sql.NVarChar(50), reason_code)
        .input('role', sql.NVarChar(50), role)
        .input('currentId', sql.Int, Number(id));
      const custFilter = customer_id != null
        ? (archiveReq.input('custId', sql.Int, customer_id), 'AND customer_id = @custId')
        : 'AND customer_id IS NULL';
      await archiveReq.query(`
        UPDATE dbo.RemediationStepSet
        SET status = 'archived', updated_at = GETUTCDATE()
        WHERE reason_code = @reasonCode AND role = @role AND status = 'active' AND id <> @currentId ${custFilter}
      `);

      // Get snapshot of current steps
      const stepsSnap = await this.pool.request()
        .input('setId', sql.Int, Number(id))
        .query(`
          SELECT st.id, st.sort_order, st.title, st.body, st.required,
                 cl.id AS cl_id, cl.item_text
          FROM dbo.RemediationStep st
          LEFT JOIN dbo.RemediationStepChecklist cl ON cl.step_id = st.id
          WHERE st.set_id = @setId
          ORDER BY st.sort_order, cl.sort_order
        `);

      const snapshot = JSON.stringify(stepsSnap.recordset);
      const newVersion = version + 1;

      // Publish
      const publishReq = this.pool.request();
      publishReq.input('id', sql.Int, Number(id));
      publishReq.input('actor', sql.NVarChar(255), actor);
      publishReq.input('version', sql.Int, newVersion);
      await publishReq.query(`
        UPDATE dbo.RemediationStepSet
        SET status = 'active', version = @version, published_at = GETUTCDATE(), published_by = @actor, updated_at = GETUTCDATE(), updated_by = @actor
        WHERE id = @id
      `);

      // History snapshot
      const histReq = this.pool.request();
      histReq.input('setId', sql.Int, Number(id));
      histReq.input('version', sql.Int, newVersion);
      histReq.input('snapshot', sql.NVarChar(sql.MAX), snapshot);
      histReq.input('actor', sql.NVarChar(255), actor);
      await histReq.query(`
        INSERT INTO dbo.RemediationStepSetHistory (set_id, version, snapshot, changed_by)
        VALUES (@setId, @version, @snapshot, @actor)
      `);

      return res.status(200).json({ data: { id: Number(id), version: newVersion, status: 'active' } });
    } catch (error: unknown) {
      logger.error('AdminRemediation.publishSet', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // GET /api/admin/remediation/sets/:id/history
  // -------------------------------------------------------------------------
  public getSetHistory = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    try {
      const result = await this.pool.request()
        .input('setId', sql.Int, Number(id))
        .query(`
          SELECT id, set_id, version, snapshot, changed_by, changed_at
          FROM dbo.RemediationStepSetHistory
          WHERE set_id = @setId
          ORDER BY version DESC
        `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('AdminRemediation.getSetHistory', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // GET /api/admin/remediation/reason-codes
  // Returns distinct codes from DB + any custom codes in the step-set table
  // -------------------------------------------------------------------------
  public listReasonCodes = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const result = await this.pool.request().query(`
        SELECT DISTINCT code = reason_code
        FROM dbo.RemediationStepSet
        WHERE reason_code <> 'DEFAULT'
        UNION
        SELECT DISTINCT code = lh.CARCCode
        FROM dbo.claimhistory lh
        WHERE lh.CARCCode IS NOT NULL
          AND lh.CARCCode <> ''
        ORDER BY code
      `);

      return res.status(200).json({ data: (result.recordset ?? []).map((r: { code: string }) => r.code) });
    } catch (error: unknown) {
      logger.error('AdminRemediation.listReasonCodes', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // GET /api/admin/remediation/feedback
  // Query: status, limit
  // -------------------------------------------------------------------------
  public listFeedback = async (req: Request, res: Response): Promise<Response> => {
    const { status, limit } = req.query as Record<string, string>;
    const top = Math.min(Number(limit) || 200, 1000);
    try {
      const request = this.pool.request();
      const conditions = status ? ['f.status = @status'] : [];
      if (status) request.input('status', sql.NVarChar(20), status);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await request.query(`
        SELECT TOP ${top}
          f.id, f.set_id, f.step_id, f.claim_id, f.author_user_id,
          f.suggestion, f.status, f.reviewed_by, f.reviewed_at, f.reviewer_note,
          f.created_at,
          s.reason_code, s.role AS set_role,
          st.title AS step_title
        FROM dbo.RemediationFeedback f
        JOIN dbo.RemediationStepSet s ON s.id = f.set_id
        LEFT JOIN dbo.RemediationStep st ON st.id = f.step_id
        ${where}
        ORDER BY f.created_at DESC
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('AdminRemediation.listFeedback', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // PATCH /api/admin/remediation/feedback/:id
  // Body: { status: 'approved'|'rejected'|'deferred', reviewer_note? }
  // -------------------------------------------------------------------------
  public reviewFeedback = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const { status, reviewer_note } = req.body as { status: string; reviewer_note?: string };
    const actor = (req as any).actor?.email ?? 'unknown';

    if (!['approved', 'rejected', 'deferred'].includes(status)) {
      return res.status(400).json({ message: 'status must be approved, rejected, or deferred' });
    }

    try {
      const reviewReq = this.pool.request();
      reviewReq.input('id', sql.Int, Number(id));
      reviewReq.input('status', sql.NVarChar(20), status);
      reviewReq.input('actor', sql.NVarChar(255), actor);
      reviewReq.input('note', sql.NVarChar(sql.MAX), reviewer_note ?? null);

      await reviewReq.query(`
        UPDATE dbo.RemediationFeedback
        SET status = @status, reviewed_by = @actor, reviewed_at = GETUTCDATE(), reviewer_note = @note
        WHERE id = @id
      `);

      return res.status(200).json({ data: { id: Number(id), status } });
    } catch (error: unknown) {
      logger.error('AdminRemediation.reviewFeedback', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // DELETE /api/admin/remediation/sets/:id
  // Permanently removes a step set and all child records
  // -------------------------------------------------------------------------
  public deleteSet = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    try {
      const check = await this.pool.request()
        .input('id', sql.Int, Number(id))
        .query(`SELECT id FROM dbo.RemediationStepSet WHERE id = @id`);

      if (!check.recordset.length) {
        return res.status(404).json({ message: 'Step set not found' });
      }

      // Delete in dependency order (checklist -> step -> history -> feedback -> set)
      await this.pool.request().input('setId', sql.Int, Number(id)).query(`
        DELETE cl FROM dbo.RemediationStepChecklist cl
        JOIN dbo.RemediationStep st ON st.id = cl.step_id
        WHERE st.set_id = @setId
      `);
      await this.pool.request().input('setId', sql.Int, Number(id)).query(
        `DELETE FROM dbo.RemediationStep WHERE set_id = @setId`
      );
      await this.pool.request().input('setId', sql.Int, Number(id)).query(
        `DELETE FROM dbo.RemediationStepSetHistory WHERE set_id = @setId`
      );
      await this.pool.request().input('setId', sql.Int, Number(id)).query(
        `DELETE FROM dbo.RemediationFeedback WHERE set_id = @setId`
      );
      await this.pool.request().input('id', sql.Int, Number(id)).query(
        `DELETE FROM dbo.RemediationStepSet WHERE id = @id`
      );

      logger.info('AdminRemediation.deleteSet', { id });
      return res.status(200).json({ data: { id: Number(id) } });
    } catch (error: unknown) {
      logger.error('AdminRemediation.deleteSet', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // Internal: save steps + checklists for a set
  // -------------------------------------------------------------------------
  private async _saveSteps(
    setId: number,
    steps: Array<{ title: string; body?: string; required?: boolean; checklist?: string[] }>,
  ): Promise<void> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepReq = this.pool.request();
      stepReq.input('setId', sql.Int, setId);
      stepReq.input('order', sql.Int, i + 1);
      stepReq.input('title', sql.NVarChar(200), step.title);
      stepReq.input('body', sql.NVarChar(sql.MAX), step.body ?? null);
      stepReq.input('required', sql.Bit, step.required ? 1 : 0);

      const stepResult = await stepReq.query(`
        INSERT INTO dbo.RemediationStep (set_id, sort_order, title, body, required)
        OUTPUT INSERTED.id
        VALUES (@setId, @order, @title, @body, @required)
      `);

      const stepId: number = stepResult.recordset[0].id;

      for (let j = 0; j < (step.checklist ?? []).length; j++) {
        const checkReq = this.pool.request();
        checkReq.input('stepId', sql.Int, stepId);
        checkReq.input('order', sql.Int, j + 1);
        checkReq.input('text', sql.NVarChar(500), step.checklist![j]);
        await checkReq.query(`
          INSERT INTO dbo.RemediationStepChecklist (step_id, sort_order, item_text)
          VALUES (@stepId, @order, @text)
        `);
      }
    }
  }
}
