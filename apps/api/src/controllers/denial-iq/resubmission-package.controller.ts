/**
 * Resubmission Package Builder Controller
 *
 * Assembles a bundled resubmission package per claim:
 *   - Corrected claim data snapshot
 *   - Appeal letter reference
 *   - Documentation checklist
 *   - Supporting attachments list
 *
 * Packages flow: draft -> ready -> submitted (after manager approval).
 */
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

const DEFAULT_CHECKLIST = [
  { item: 'Corrected claim data verified', checked: false },
  { item: 'Appeal letter drafted and reviewed', checked: false },
  { item: 'Clinical notes attached', checked: false },
  { item: 'Medical necessity statement included', checked: false },
  { item: 'Prior authorization documentation (if applicable)', checked: false },
  { item: 'EOB from primary payer attached (secondary claims)', checked: false },
  { item: 'Provider signature obtained', checked: false },
  { item: 'Timely filing deadline confirmed', checked: false },
];

export class ResubmissionPackageController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/denial-iq/resubmission-package/:claimId - latest package for a claim */
  get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('ClaimId', sql.NVarChar(50), claimId);
      if (custId != null) r.input('_custId', sql.Int, custId);

      const [pkgResult, attachResult] = await Promise.all([
        r.query(`
          SELECT TOP 1 id, claim_id, appeal_id, status, checklist, corrected_claim, notes, created_by, submitted_at, created_at, updated_at
          FROM dbo.ResubmissionPackage
          WHERE claim_id = @ClaimId${custId != null ? ' AND customer_id = @_custId' : ''}
          ORDER BY created_at DESC
        `),
        (() => {
          const ar = this.pool.request().input('ClaimId', sql.NVarChar(50), claimId);
          if (custId != null) ar.input('_custId', sql.Int, custId);
          return ar.query(`
            SELECT id, file_name, file_type, file_size_kb, description, uploaded_by, uploaded_at
            FROM dbo.ClaimAttachment
            WHERE claim_id = @ClaimId${custId != null ? ' AND customer_id = @_custId' : ''}
            ORDER BY uploaded_at DESC
          `);
        })(),
      ]);

      const pkg = pkgResult.recordset[0];
      if (!pkg) return res.status(404).json({ message: 'No package. POST to create one.' });

      return res.json({
        data: {
          ...pkg,
          checklist: JSON.parse(pkg.checklist || JSON.stringify(DEFAULT_CHECKLIST)),
          corrected_claim: pkg.corrected_claim ? JSON.parse(pkg.corrected_claim) : null,
          attachments: attachResult.recordset,
        },
      });
    } catch (err: any) {
      logger.error('[ResubmissionPackage] get error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/resubmission-package/:claimId - create or reset package */
  create = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const { appeal_id, corrected_claim, notes } = req.body as {
        appeal_id?: number;
        corrected_claim?: Record<string, unknown>;
        notes?: string;
      };
      const custId = extractCustomerId(req);
      const actorEmail = (req.headers['x-actor-email'] as string) || 'unknown';

      const r = this.pool.request();
      r.input('ClaimId', sql.NVarChar(50), claimId);
      r.input('AppealId', sql.Int, appeal_id ?? null);
      r.input('Checklist', sql.NVarChar(sql.MAX), JSON.stringify(DEFAULT_CHECKLIST));
      r.input('CorrectedClaim', sql.NVarChar(sql.MAX), corrected_claim ? JSON.stringify(corrected_claim) : null);
      r.input('Notes', sql.NVarChar(sql.MAX), notes ?? null);
      r.input('CreatedBy', sql.NVarChar(255), actorEmail);
      r.input('CustId', sql.Int, custId);

      const result = await r.query(`
        INSERT INTO dbo.ResubmissionPackage
          (customer_id, claim_id, appeal_id, checklist, corrected_claim, notes, created_by)
        OUTPUT INSERTED.*
        VALUES (@CustId, @ClaimId, @AppealId, @Checklist, @CorrectedClaim, @Notes, @CreatedBy)
      `);

      const pkg = result.recordset[0];
      return res.status(201).json({
        data: {
          ...pkg,
          checklist: DEFAULT_CHECKLIST,
          corrected_claim: corrected_claim ?? null,
          attachments: [],
        },
      });
    } catch (err: any) {
      logger.error('[ResubmissionPackage] create error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PATCH /api/denial-iq/resubmission-package/:id - update checklist/status/notes */
  update = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const { checklist, corrected_claim, notes, status } = req.body as {
        checklist?: Array<{ item: string; checked: boolean }>;
        corrected_claim?: Record<string, unknown>;
        notes?: string;
        status?: string;
      };
      const custId = extractCustomerId(req);

      const r = this.pool.request();
      r.input('Id', sql.Int, id);
      r.input('Checklist', sql.NVarChar(sql.MAX), checklist ? JSON.stringify(checklist) : null);
      r.input('CorrectedClaim', sql.NVarChar(sql.MAX), corrected_claim ? JSON.stringify(corrected_claim) : null);
      r.input('Notes', sql.NVarChar(sql.MAX), notes ?? null);
      r.input('Status', sql.NVarChar(30), status ?? null);
      if (custId != null) r.input('_custId', sql.Int, custId);

      await r.query(`
        UPDATE dbo.ResubmissionPackage SET
          checklist      = COALESCE(@Checklist, checklist),
          corrected_claim = COALESCE(@CorrectedClaim, corrected_claim),
          notes          = COALESCE(@Notes, notes),
          status         = COALESCE(@Status, status),
          updated_at     = GETUTCDATE()
        WHERE id = @Id${custId != null ? ' AND customer_id = @_custId' : ''}
      `);

      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('[ResubmissionPackage] update error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/resubmission-package/:claimId/attachments - record an attachment */
  addAttachment = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.params.claimId;
      const { package_id, file_name, file_type, file_size_kb, description, storage_key } = req.body as {
        package_id?: number;
        file_name: string;
        file_type?: string;
        file_size_kb?: number;
        description?: string;
        storage_key?: string;
      };

      if (!file_name) return res.status(400).json({ message: 'file_name is required' });
      const custId = extractCustomerId(req);
      const actorEmail = (req.headers['x-actor-email'] as string) || 'unknown';

      const r = this.pool.request();
      r.input('ClaimId', sql.NVarChar(50), claimId);
      r.input('PackageId', sql.Int, package_id ?? null);
      r.input('FileName', sql.NVarChar(500), file_name);
      r.input('FileType', sql.NVarChar(100), file_type ?? null);
      r.input('FileSizeKb', sql.Int, file_size_kb ?? null);
      r.input('Description', sql.NVarChar(500), description ?? null);
      r.input('StorageKey', sql.NVarChar(1000), storage_key ?? null);
      r.input('UploadedBy', sql.NVarChar(255), actorEmail);
      r.input('CustId', sql.Int, custId);

      const result = await r.query(`
        INSERT INTO dbo.ClaimAttachment
          (customer_id, claim_id, package_id, file_name, file_type, file_size_kb, description, storage_key, uploaded_by)
        OUTPUT INSERTED.*
        VALUES (@CustId, @ClaimId, @PackageId, @FileName, @FileType, @FileSizeKb, @Description, @StorageKey, @UploadedBy)
      `);

      return res.status(201).json({ data: result.recordset[0] });
    } catch (err: any) {
      logger.error('[ResubmissionPackage] addAttachment error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/denial-iq/resubmission-package/attachments/:id */
  removeAttachment = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id, 10);
      const custId = extractCustomerId(req);
      const r = this.pool.request();
      r.input('Id', sql.Int, id);
      if (custId != null) r.input('_custId', sql.Int, custId);
      await r.query(`DELETE FROM dbo.ClaimAttachment WHERE id = @Id${custId != null ? ' AND customer_id = @_custId' : ''}`);
      return res.status(204).send();
    } catch (err: any) {
      logger.error('[ResubmissionPackage] removeAttachment error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
