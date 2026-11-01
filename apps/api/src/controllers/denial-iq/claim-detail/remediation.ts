import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { recordClaimEvent } from '../../../utils/claim-events';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class ClaimRemediationController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  // -------------------------------------------------------------------------
  // GET /api/denial-iq/claim-detail/remediation?claimId=&role=
  // Returns active step set for the claim's reason code + role,
  // falling back to 'DEFAULT' if no specific set exists.
  // Also includes per-step completion status for this claim.
  // -------------------------------------------------------------------------
  public getSteps = async (req: Request, res: Response): Promise<Response> => {
    const claimId = (req.query.claimId as string) ?? '';
    const role = (req.query.role as string) ?? 'ar-specialist';
    // Optional: caller may supply the CARC code directly (avoids a second claimhistory lookup)
    const suppliedReasonCode = ((req.query.reasonCode as string) ?? '').trim();

    if (!claimId) {
      return res.status(400).json({ message: 'claimId is required' });
    }

    try {
      let claimReasonCode: string;

      if (suppliedReasonCode) {
        // Use the caller-supplied code (already normalised by claim-detail endpoint)
        claimReasonCode = suppliedReasonCode.replace(/-/g, '');
      } else {
        // Fall back: resolve reason code from claimhistory
        const reasonResult = await this.pool.request()
          .input('claimId', sql.NVarChar(50), claimId)
          .query(`
            SELECT TOP 1
              REPLACE(lh.CARCCode, '-', '') AS reason_code
            FROM dbo.claimhistory lh
            WHERE lh.ClaimID = @claimId
              AND lh.CARCCode IS NOT NULL
              AND lh.CARCCode <> ''
            ORDER BY lh.ClaimModifiedDate DESC, lh.ClaimWorkStartedTime DESC
          `);
        claimReasonCode = reasonResult.recordset[0]?.reason_code ?? 'DEFAULT';
      }
      // Strip group-code prefix: 'CO26'->'26', 'PR3'->'3'; RARC codes like 'B24' are unchanged
      const claimReasonCodeStripped = claimReasonCode.replace(/^(CO|PR|OA|PI)(\d[\w]*)$/i, '$2');

      // Find active step set: exact code -> stripped code -> DEFAULT
      const setResult = await this.pool.request()
        .input('reasonCode',         sql.NVarChar(50), claimReasonCode)
        .input('reasonCodeStripped', sql.NVarChar(50), claimReasonCodeStripped)
        .input('role',               sql.NVarChar(50), role)
        .query(`
          SELECT TOP 1 id, reason_code, role, version, updated_at, published_at
          FROM dbo.RemediationStepSet
          WHERE role = @role
            AND status = 'active'
            AND reason_code IN (@reasonCode, @reasonCodeStripped, 'DEFAULT')
          ORDER BY
            CASE WHEN reason_code = @reasonCode         THEN 0
                 WHEN reason_code = @reasonCodeStripped THEN 1
                 ELSE 2 END
        `);

      // If no set for the requested role, fall back to ar-specialist so managers
      // and admins see the same steps without needing duplicate step-set configs.
      if (!setResult.recordset.length && role !== 'ar-specialist') {
        const fallbackResult = await this.pool.request()
          .input('reasonCode',         sql.NVarChar(50), claimReasonCode)
          .input('reasonCodeStripped', sql.NVarChar(50), claimReasonCodeStripped)
          .query(`
            SELECT TOP 1 id, reason_code, role, version, updated_at, published_at
            FROM dbo.RemediationStepSet
            WHERE role = 'ar-specialist'
              AND status = 'active'
              AND reason_code IN (@reasonCode, @reasonCodeStripped, 'DEFAULT')
            ORDER BY
              CASE WHEN reason_code = @reasonCode         THEN 0
                   WHEN reason_code = @reasonCodeStripped THEN 1
                   ELSE 2 END
          `);
        if (fallbackResult.recordset.length) {
          setResult.recordset.push(...fallbackResult.recordset);
        }
      }

      if (!setResult.recordset.length) {
        return res.status(200).json({ data: null, claimReasonCode });
      }

      const set = setResult.recordset[0];

      // Fetch steps + checklists
      const stepsResult = await this.pool.request()
        .input('setId', sql.Int, set.id)
        .query(`
          SELECT st.id, st.sort_order, st.title, st.body, st.required,
                 cl.id AS cl_id, cl.sort_order AS cl_sort, cl.item_text
          FROM dbo.RemediationStep st
          LEFT JOIN dbo.RemediationStepChecklist cl ON cl.step_id = st.id
          WHERE st.set_id = @setId
          ORDER BY st.sort_order, cl.sort_order
        `);

      // Fetch completions for this claim
      const completionResult = await this.pool.request()
        .input('claimId', sql.NVarChar(50), claimId)
        .query(`
          SELECT step_id, completed_at, user_id
          FROM dbo.ClaimStepCompletion
          WHERE claim_id = @claimId
        `);

      const completionMap = new Map<number, { completed_at: string; user_id: string }>();
      for (const c of completionResult.recordset) {
        completionMap.set(c.step_id, { completed_at: c.completed_at, user_id: c.user_id });
      }

      // Aggregate
      const stepsMap = new Map<number, any>();
      for (const row of stepsResult.recordset) {
        if (!stepsMap.has(row.id)) {
          const comp = completionMap.get(row.id);
          stepsMap.set(row.id, {
            id: row.id,
            sort_order: row.sort_order,
            title: row.title,
            body: row.body,
            required: !!row.required,
            completed: !!comp,
            completed_at: comp?.completed_at ?? null,
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

      return res.status(200).json({
        data: {
          set_id: set.id,
          reason_code: set.reason_code,
          version: set.version,
          updated_at: set.updated_at,
          steps: Array.from(stepsMap.values()),
        },
        // Return the short (stripped) code for display when the full group-prefixed form differs
        claimReasonCode: claimReasonCodeStripped !== claimReasonCode
          ? claimReasonCodeStripped
          : claimReasonCode,
      });
    } catch (error: unknown) {
      logger.error('ClaimRemediation.getSteps', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // POST /api/denial-iq/claim-detail/step-completion
  // Body: { claimId, stepId, completed: boolean, userId }
  // -------------------------------------------------------------------------
  public saveStepCompletion = async (req: Request, res: Response): Promise<Response> => {
    const { claimId, stepId, completed, userId } = req.body as {
      claimId: string;
      stepId: number;
      completed: boolean;
      userId: string;
    };

    if (!claimId || !stepId || !userId) {
      return res.status(400).json({ message: 'claimId, stepId, and userId are required' });
    }

    try {
      if (completed) {
        await this.pool.request()
          .input('claimId', sql.NVarChar(50), claimId)
          .input('stepId', sql.Int, stepId)
          .input('userId', sql.NVarChar(255), userId)
          .query(`
            MERGE dbo.ClaimStepCompletion AS target
            USING (SELECT @claimId AS claim_id, @stepId AS step_id) AS source
              ON target.claim_id = source.claim_id AND target.step_id = source.step_id
            WHEN NOT MATCHED THEN
              INSERT (claim_id, step_id, user_id) VALUES (@claimId, @stepId, @userId);
          `);
      } else {
        await this.pool.request()
          .input('claimId', sql.NVarChar(50), claimId)
          .input('stepId', sql.Int, stepId)
          .query(`
            DELETE FROM dbo.ClaimStepCompletion
            WHERE claim_id = @claimId AND step_id = @stepId
          `);
      }

      return res.status(200).json({ data: { claimId, stepId, completed } });
    } catch (error: unknown) {
      logger.error('ClaimRemediation.saveStepCompletion', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // GET /api/denial-iq/claim-detail/notes?claimId=
  // -------------------------------------------------------------------------
  public getNotes = async (req: Request, res: Response): Promise<Response> => {
    const claimId = (req.query.claimId as string) ?? '';
    if (!claimId) {
      return res.status(400).json({ message: 'claimId is required' });
    }

    try {
      const result = await this.pool.request()
        .input('claimId', sql.NVarChar(50), claimId)
        .query(`
          SELECT n.id, n.claim_id, n.step_id, n.author_user_id, n.note_text, n.note_type, n.created_at,
                 st.title AS step_title
          FROM dbo.ClaimStepNote n
          LEFT JOIN dbo.RemediationStep st ON st.id = n.step_id
          WHERE n.claim_id = @claimId
          ORDER BY n.created_at ASC
        `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (error: unknown) {
      logger.error('ClaimRemediation.getNotes', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // POST /api/denial-iq/claim-detail/notes
  // Body: { claimId, stepId?, authorUserId, noteText, noteType? }
  // -------------------------------------------------------------------------
  public addNote = async (req: Request, res: Response): Promise<Response> => {
    const { claimId, stepId, authorUserId, noteText, noteType = 'general' } = req.body as {
      claimId: string;
      stepId?: number | null;
      authorUserId: string;
      noteText: string;
      noteType?: string;
    };

    if (!claimId || !authorUserId || !noteText) {
      return res.status(400).json({ message: 'claimId, authorUserId, and noteText are required' });
    }

    try {
      const request = this.pool.request();
      request.input('claimId', sql.NVarChar(50), claimId);
      request.input('stepId', sql.Int, stepId ?? null);
      request.input('authorUserId', sql.NVarChar(255), authorUserId);
      request.input('noteText', sql.NVarChar(sql.MAX), noteText);
      request.input('noteType', sql.NVarChar(50), noteType);

      const result = await request.query(`
        INSERT INTO dbo.ClaimStepNote (claim_id, step_id, author_user_id, note_text, note_type)
        OUTPUT INSERTED.id, INSERTED.created_at
        VALUES (@claimId, @stepId, @authorUserId, @noteText, @noteType)
      `);

      const newNote = result.recordset[0];
      void recordClaimEvent(this.pool, {
        customerId: extractCustomerId(req),
        claimId,
        eventType: 'claim_note_added',
        actorUser: (req as any).actor?.email || authorUserId,
        metadata: { noteId: newNote?.id, preview: noteText.slice(0, 80), noteType },
      });

      return res.status(201).json({ data: { ...newNote, claimId, stepId, noteText } });
    } catch (error: unknown) {
      logger.error('ClaimRemediation.addNote', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // PUT /api/denial-iq/claim-detail/notes/:id   [Manager+]
  // Body: { noteText, noteType? }
  // -------------------------------------------------------------------------
  public updateNote = async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Note id is required' });
    }

    const { noteText, noteType } = req.body as { noteText: string; noteType?: string | null };

    if (!noteText) {
      return res.status(400).json({ message: 'noteText is required' });
    }

    try {
      const result = await this.pool.request()
        .input('id', sql.Int, id)
        .input('noteText', sql.NVarChar(sql.MAX), noteText)
        .input('noteType', sql.NVarChar(50), noteType ?? null)
        .query(`
          UPDATE dbo.ClaimStepNote
          SET note_text = @noteText,
              note_type = COALESCE(@noteType, note_type)
          OUTPUT INSERTED.*
          WHERE id = @id
        `);

      if (!result.recordset.length) {
        return res.status(404).json({ message: 'Note not found' });
      }

      const updated = result.recordset[0];
      void recordClaimEvent(this.pool, {
        customerId: extractCustomerId(req),
        claimId: updated.claim_id,
        eventType: 'claim_note_edited',
        actorUser: (req as any).actor?.email || null,
        metadata: { noteId: id, preview: noteText.slice(0, 80) },
      });

      return res.status(200).json({ data: updated });
    } catch (error: unknown) {
      logger.error('ClaimRemediation.updateNote', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // DELETE /api/denial-iq/claim-detail/notes/:id
  // -------------------------------------------------------------------------
  public deleteNote = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    try {
      await this.pool.request()
        .input('id', sql.Int, Number(id))
        .query(`DELETE FROM dbo.ClaimStepNote WHERE id = @id`);

      return res.status(200).json({ data: { id: Number(id) } });
    } catch (error: unknown) {
      logger.error('ClaimRemediation.deleteNote', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -------------------------------------------------------------------------
  // POST /api/denial-iq/claim-detail/feedback
  // Body: { setId, stepId?, claimId, authorUserId, suggestion }
  // -------------------------------------------------------------------------
  public submitFeedback = async (req: Request, res: Response): Promise<Response> => {
    const { setId, stepId, claimId, authorUserId, suggestion } = req.body as {
      setId: number;
      stepId?: number | null;
      claimId?: string | null;
      authorUserId: string;
      suggestion: string;
    };

    if (!setId || !authorUserId || !suggestion) {
      return res.status(400).json({ message: 'setId, authorUserId, and suggestion are required' });
    }

    try {
      const request = this.pool.request();
      request.input('setId', sql.Int, setId);
      request.input('stepId', sql.Int, stepId ?? null);
      request.input('claimId', sql.NVarChar(50), claimId ?? null);
      request.input('authorUserId', sql.NVarChar(255), authorUserId);
      request.input('suggestion', sql.NVarChar(sql.MAX), suggestion);

      const result = await request.query(`
        INSERT INTO dbo.RemediationFeedback (set_id, step_id, claim_id, author_user_id, suggestion)
        OUTPUT INSERTED.id
        VALUES (@setId, @stepId, @claimId, @authorUserId, @suggestion)
      `);

      return res.status(201).json({ data: { id: result.recordset[0].id } });
    } catch (error: unknown) {
      logger.error('ClaimRemediation.submitFeedback', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
