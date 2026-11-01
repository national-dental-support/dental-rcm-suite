import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';
import { generateAiAppealLetter } from '../../services/ai-agents/appeal-agent';

export class AppealGeneratorController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** GET /api/denial-iq/appeals/templates - ?all=1 returns inactive too (admin) */
  listTemplates = async (req: Request, res: Response): Promise<Response> => {
    try {
      const showAll = req.query.all === '1';
      const xenCustId = extractCustomerId(req);
      const conditions: string[] = [];
      if (!showAll) conditions.push('is_active = 1');
      if (xenCustId != null) conditions.push('(customer_id = @_custId OR customer_id IS NULL)');
      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const request = this.pool.request();
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);
      const result = await request.query(`
        SELECT id, template_name, denial_category, carc_codes, subject_line, body_template, closing_text, is_active, created_at, updated_at
        FROM dbo.AppealLetterTemplate
        ${where}
        ORDER BY
          CASE WHEN denial_category IS NULL THEN 1 ELSE 0 END,
          template_name
      `);
      return res.status(200).json({ data: result.recordset });
    } catch (error: unknown) {
      logger.error('[AppealGenerator] listTemplates error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/appeals/templates - create */
  createTemplate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { template_name, denial_category, carc_codes, subject_line, body_template, closing_text, is_active } = req.body as Record<string, any>;
      if (!template_name || !subject_line || !body_template) {
        return res.status(400).json({ message: 'template_name, subject_line, and body_template are required' });
      }
      const xenCustId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('Name', sql.NVarChar(255), template_name);
      r.input('Category', sql.NVarChar(100), denial_category ?? null);
      r.input('CarcCodes', sql.NVarChar(500), carc_codes ?? null);
      r.input('SubjectLine', sql.NVarChar(500), subject_line);
      r.input('Body', sql.NVarChar(sql.MAX), body_template);
      r.input('Closing', sql.NVarChar(sql.MAX), closing_text ?? null);
      r.input('IsActive', sql.Bit, is_active ?? 1);
      r.input('_custId', sql.Int, xenCustId);
      const result = await r.query(`
        INSERT INTO dbo.AppealLetterTemplate
          (template_name, denial_category, carc_codes, subject_line, body_template, closing_text, is_active, customer_id)
        OUTPUT INSERTED.*
        VALUES (@Name, @Category, @CarcCodes, @SubjectLine, @Body, @Closing, @IsActive, @_custId)
      `);
      return res.status(201).json({ data: result.recordset[0] });
    } catch (error: unknown) {
      logger.error('[AppealGenerator] createTemplate error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/denial-iq/appeals/templates/:id - update */
  updateTemplate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const { template_name, denial_category, carc_codes, subject_line, body_template, closing_text, is_active } = req.body as Record<string, any>;
      const xenCustId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('Id', sql.Int, id);
      r.input('Name', sql.NVarChar(255), template_name ?? null);
      r.input('Category', sql.NVarChar(100), denial_category ?? null);
      r.input('CarcCodes', sql.NVarChar(500), carc_codes ?? null);
      r.input('SubjectLine', sql.NVarChar(500), subject_line ?? null);
      r.input('Body', sql.NVarChar(sql.MAX), body_template ?? null);
      r.input('Closing', sql.NVarChar(sql.MAX), closing_text ?? null);
      r.input('IsActive', sql.Bit, is_active ?? null);
      if (xenCustId != null) r.input('_custId', sql.Int, xenCustId);
      await r.query(`
        UPDATE dbo.AppealLetterTemplate SET
          template_name   = COALESCE(@Name, template_name),
          denial_category = @Category,
          carc_codes      = @CarcCodes,
          subject_line    = COALESCE(@SubjectLine, subject_line),
          body_template   = COALESCE(@Body, body_template),
          closing_text    = @Closing,
          is_active       = COALESCE(@IsActive, is_active),
          updated_at      = GETUTCDATE()
        WHERE id = @Id${xenCustId != null ? ' AND customer_id = @_custId' : ''}
      `);
      return res.status(200).json({ ok: true });
    } catch (error: unknown) {
      logger.error('[AppealGenerator] updateTemplate error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/denial-iq/appeals/templates/:id */
  deleteTemplate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const xenCustId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('Id', sql.Int, id);
      if (xenCustId != null) r.input('_custId', sql.Int, xenCustId);
      await r.query(`DELETE FROM dbo.AppealLetterTemplate WHERE id = @Id${xenCustId != null ? ' AND customer_id = @_custId' : ''}`);
      return res.status(200).json({ ok: true });
    } catch (error: unknown) {
      logger.error('[AppealGenerator] deleteTemplate error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/denial-iq/appeals?claimId= */
  listAppeals = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = (req.query.claimId as string) ?? '';
      if (!claimId) return res.status(400).json({ message: 'Missing claimId' });

      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('ClaimId', sql.NVarChar(50), claimId);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);
      const result = await request.query(`
        SELECT
          a.id, a.claim_id, a.template_id, a.denial_reason,
          a.appeal_level, a.submitted_date, a.due_date, a.status,
          a.generated_letter, a.notes, a.author_user_id, a.created_at, a.updated_at,
          t.template_name
        FROM dbo.DenialAppeal a
        LEFT JOIN dbo.AppealLetterTemplate t ON t.id = a.template_id
        WHERE a.claim_id = @ClaimId${xenCustId != null ? ' AND a.customer_id = @_custId' : ''}
        ORDER BY a.created_at DESC
      `);
      return res.status(200).json({ data: result.recordset });
    } catch (error: unknown) {
      logger.error('[AppealGenerator] listAppeals error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/appeals/generate */
  generateLetter = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId, templateId, customNotes } = req.body as {
        claimId: string;
        templateId?: number;
        customNotes?: string;
      };

      if (!claimId) return res.status(400).json({ message: 'Missing claimId' });

      const xenCustId = extractCustomerId(req);

      // 1. Load claim info
      const claimReq = this.pool.request();
      claimReq.input('ClaimId', sql.NVarChar(50), claimId);
      if (xenCustId != null) claimReq.input('_custId', sql.Int, xenCustId);
      const claimResult = await claimReq.query(`
        SELECT TOP 1
          c.ClaimID,
          c.DateOfService,
          c.ClaimSubmittedDate,
          c.ChargeAmt,
          COALESCE(rr.InsuranceName, CAST(c.PayerID AS NVARCHAR)) AS PayerName,
          COALESCE(rr.ProviderName, '') AS ProviderName,
          LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))) AS PatientName,
          NULLIF(ch.CARCCode, '') AS DenialCode,
          CAST(carc.description AS NVARCHAR(MAX)) AS DenialDescription
        FROM dbo.claims c
        LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID
        LEFT JOIN dbo.patient pt ON pt.PatientID = c.PatientID
        LEFT JOIN (
          SELECT ClaimID, CARCCode
          FROM dbo.claimhistory
          WHERE ClaimID = @ClaimId
          ORDER BY ClaimModifiedDate DESC
          OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
        ) ch ON ch.ClaimID = c.ClaimID
        LEFT JOIN dbo.Carcs carc ON carc.code = ch.CARCCode
        WHERE c.ClaimID = @ClaimId${xenCustId != null ? ' AND c.customer_id = @_custId' : ''}
      `);

      if (!claimResult.recordset.length) {
        return res.status(404).json({ message: 'Claim not found' });
      }
      const claim = claimResult.recordset[0];

      // 2. Select template
      let template: { id: number; body_template: string; subject_line: string; closing_text: string | null } | null = null;

      if (templateId) {
        const tReq = this.pool.request();
        tReq.input('TemplateId', sql.Int, templateId);
        const tResult = await tReq.query(`
          SELECT id, body_template, subject_line, closing_text
          FROM dbo.AppealLetterTemplate WHERE id = @TemplateId AND is_active = 1
        `);
        template = tResult.recordset[0] ?? null;
      }

      if (!template && claim.DenialCode) {
        // Match by carc_codes column
        const tReq = this.pool.request();
        tReq.input('DenialCode', sql.NVarChar(20), claim.DenialCode);
        const tResult = await tReq.query(`
          SELECT TOP 1 id, body_template, subject_line, closing_text
          FROM dbo.AppealLetterTemplate
          WHERE is_active = 1
            AND carc_codes IS NOT NULL
            AND carc_codes LIKE '%' + @DenialCode + '%'
          ORDER BY id
        `);
        template = tResult.recordset[0] ?? null;
      }

      if (!template) {
        // Fallback to general template
        const tResult = await this.pool.request().query(`
          SELECT TOP 1 id, body_template, subject_line, closing_text
          FROM dbo.AppealLetterTemplate
          WHERE is_active = 1 AND denial_category IS NULL
          ORDER BY id DESC
        `);
        template = tResult.recordset[0] ?? null;
      }

      if (!template) {
        return res.status(422).json({ message: 'No active appeal template found. Please add templates in Admin.' });
      }

      // 3. Get payer filing deadline for due_date
      let appealDays = 60;
      if (claim.PayerName) {
        const pdReq = this.pool.request();
        pdReq.input('PayerName', sql.NVarChar(255), claim.PayerName);
        if (xenCustId != null) pdReq.input('_custId', sql.Int, xenCustId);
        const pdResult = await pdReq.query(`
          SELECT TOP 1 appeal_days
          FROM dbo.PayerFilingDeadlines
          WHERE payer_name LIKE '%' + @PayerName + '%'${xenCustId != null ? ' AND customer_id = @_custId' : ''}
        `);
        if (pdResult.recordset.length) {
          appealDays = pdResult.recordset[0].appeal_days ?? 60;
        }
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + appealDays);

      // 4. Render letter - replace all tokens
      const dos = claim.DateOfService ? new Date(claim.DateOfService).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
      const subDate = claim.ClaimSubmittedDate ? new Date(claim.ClaimSubmittedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
      const appealDeadline = dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const chargeAmt = claim.ChargeAmt != null ? `$${parseFloat(claim.ChargeAmt).toFixed(2)}` : 'N/A';

      const tokens: Record<string, string> = {
        '{{patient_name}}':          claim.PatientName || 'Patient',
        '{{claim_id}}':              claimId,
        '{{dos}}':                   dos,
        '{{payer_name}}':            claim.PayerName || 'Insurance Company',
        '{{provider_name}}':         claim.ProviderName || 'Provider',
        '{{charged_amount}}':        chargeAmt,
        '{{denial_code}}':           claim.DenialCode || 'N/A',
        '{{denial_description}}':    claim.DenialDescription || claim.DenialCode || 'N/A',
        '{{submission_date}}':       subDate,
        '{{appeal_deadline}}':       appealDeadline,
        '{{custom_notes}}':          customNotes || '',
      };

      let body = template.body_template;
      let closing = template.closing_text ?? '';
      for (const [token, value] of Object.entries(tokens)) {
        body    = body.split(token).join(value);
        closing = closing.split(token).join(value);
      }

      const fullLetter = closing ? `${body}\n\n${closing}` : body;

      // 5. Insert into ClaimAppeal
      const actorEmail = (req.headers['x-actor-email'] as string) ?? null;
      const insertReq = this.pool.request();
      insertReq.input('ClaimId', sql.NVarChar(50), claimId);
      insertReq.input('TemplateId', sql.Int, template.id);
      insertReq.input('DenialReason', sql.NVarChar(50), claim.DenialCode ?? null);
      insertReq.input('DueDate', sql.Date, dueDate);
      insertReq.input('Letter', sql.NVarChar(sql.MAX), fullLetter);
      insertReq.input('Author', sql.NVarChar(255), actorEmail);
      insertReq.input('_custId', sql.Int, xenCustId);

      const insertResult = await insertReq.query(`
        INSERT INTO dbo.DenialAppeal
          (claim_id, template_id, denial_reason, due_date, status, generated_letter, author_user_id, customer_id)
        OUTPUT INSERTED.*
        VALUES (@ClaimId, @TemplateId, @DenialReason, @DueDate, 'draft', @Letter, @Author, @_custId)
      `);

      return res.status(200).json({
        appeal: insertResult.recordset[0],
        letter: fullLetter,
      });
    } catch (error: unknown) {
      logger.error('[AppealGenerator] generateLetter error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/appeals/generate-ai - AI-powered appeal letter */
  generateAiLetter = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { claimId, customNotes } = req.body as { claimId: string; customNotes?: string };
      if (!claimId) return res.status(400).json({ message: 'Missing claimId' });

      const xenCustId = extractCustomerId(req);

      // Try AI generation first
      const aiResult = await generateAiAppealLetter(claimId, xenCustId, customNotes);

      if (!aiResult) {
        // Ollama unavailable or claim not found - fall back to template
        logger.info('[AppealGenerator] AI generation failed, falling back to template');

        // Check if any active templates exist for this customer before delegating.
        // Without this check, generateLetter() would throw an admin-facing error
        // ("No active appeal template found") shown directly to AR Specialists.
        const tCheckReq = this.pool.request();
        if (xenCustId != null) tCheckReq.input('_custId', sql.Int, xenCustId);
        const tCheck = await tCheckReq.query(
          `SELECT COUNT(*) AS cnt FROM dbo.AppealLetterTemplate WHERE is_active = 1${xenCustId != null ? ' AND (customer_id = @_custId OR customer_id IS NULL)' : ''}`
        );
        if ((tCheck.recordset[0]?.cnt ?? 0) === 0) {
          return res.status(422).json({
            message: 'AI generation failed \u2014 add a template in Admin Settings to use as fallback.',
          });
        }

        return this.generateLetter(req, res);
      }

      // Get filing deadline for due_date
      const claim = await this.pool.request()
        .input('ClaimId', sql.NVarChar(50), claimId)
        .query(`SELECT TOP 1 PayerID FROM dbo.claims WHERE ClaimID = @ClaimId`);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 60);

      // Insert as draft with source='ai'
      const actorEmail = (req.headers['x-actor-email'] as string) ?? null;
      const insertReq = this.pool.request();
      insertReq.input('ClaimId', sql.NVarChar(50), claimId);
      insertReq.input('DueDate', sql.Date, dueDate);
      insertReq.input('Letter', sql.NVarChar(sql.MAX), aiResult.letter);
      insertReq.input('Author', sql.NVarChar(255), actorEmail);
      insertReq.input('Source', sql.NVarChar(20), 'ai');
      insertReq.input('_custId', sql.Int, xenCustId);

      const insertResult = await insertReq.query(`
        INSERT INTO dbo.DenialAppeal
          (claim_id, due_date, status, generated_letter, author_user_id, source, customer_id)
        OUTPUT INSERTED.*
        VALUES (@ClaimId, @DueDate, 'draft', @Letter, @Author, @Source, @_custId)
      `);

      return res.status(200).json({
        appeal: insertResult.recordset[0],
        letter: aiResult.letter,
        source: 'ai',
      });
    } catch (error: unknown) {
      logger.error('[AppealGenerator] generateAiLetter error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PATCH /api/denial-iq/appeals/:id */
  updateAppealStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status, notes, submitted_date } = req.body as {
        status?: string;
        notes?: string;
        submitted_date?: string;
      };

      if (!id) return res.status(400).json({ message: 'Missing appeal id' });

      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('Id', sql.Int, id);
      request.input('Status', sql.NVarChar(50), status ?? null);
      request.input('Notes', sql.NVarChar(sql.MAX), notes ?? null);
      request.input('SubmittedDate', sql.Date, submitted_date ? new Date(submitted_date) : null);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      await request.query(`
        UPDATE dbo.DenialAppeal
        SET
          status = COALESCE(@Status, status),
          notes = COALESCE(@Notes, notes),
          submitted_date = COALESCE(@SubmittedDate, submitted_date),
          updated_at = GETUTCDATE()
        WHERE id = @Id${xenCustId != null ? ' AND customer_id = @_custId' : ''}
      `);

      // When appeal transitions to 'submitted', stamp appeal_sent_at on the linked claim.
      if (status === 'submitted') {
        try {
          const stampReq = this.pool.request().input('AppealId', sql.Int, id);
          await stampReq.query(`
            UPDATE ch
            SET ch.appeal_sent_at = GETUTCDATE()
            FROM dbo.claimhistory ch
            JOIN dbo.DenialAppeal da ON da.claim_id = ch.ClaimID
            WHERE da.id = @AppealId AND ch.appeal_sent_at IS NULL
          `);
        } catch (err: any) { logger.error('[AppealGenerator] post-save step failed:', err?.message); }
      }

      // When outcome is set, propagate to claim record.
      if (status === 'won' || status === 'lost' || status === 'partial') {
        try {
          const outcomeReq = this.pool.request()
            .input('AppealId', sql.Int, id)
            .input('Outcome', sql.NVarChar(50), status);
          await outcomeReq.query(`
            UPDATE ch
            SET ch.appeal_outcome = @Outcome
            FROM dbo.claimhistory ch
            JOIN dbo.DenialAppeal da ON da.claim_id = ch.ClaimID
            WHERE da.id = @AppealId
          `);
        } catch (err: any) { logger.error('[AppealGenerator] post-save step failed:', err?.message); }
      }

      return res.status(200).json({ ok: true });
    } catch (error: unknown) {
      logger.error('[AppealGenerator] updateAppealStatus error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
