import express from 'express';
import multer, { memoryStorage } from 'multer';
import { ClaimDetailController } from '../../../controllers/denial-iq/claim-detail/index';
import { ClaimRemediationController } from '../../../controllers/denial-iq/claim-detail/remediation';
import { ClaimActionsController } from '../../../controllers/denial-iq/claim-detail/claim-actions';
import { BulkActionsController } from '../../../controllers/denial-iq/claim-detail/bulk-actions';
import { ClaimHistoryController } from '../../../controllers/denial-iq/claim-detail/claim-history';
import { ClaimDocumentsController } from '../../../controllers/denial-iq/claim-detail/documents';
import { Cms1500Controller } from '../../../controllers/denial-iq/claim-detail/cms1500';
import { AutoAssignmentController } from '../../../controllers/denial-iq/auto-assignment';
import { SOPRecommendationsController } from '../../../controllers/admin/sop-recommendations';
import { ClaimCommentsController } from '../../../controllers/denial-iq/claim-detail/claim-comments';
import { requireRole } from '../../../middleware/require-role';
import { phiAudit } from '../../../middleware/phi-audit';

const docUpload = multer({
  storage: memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max per document
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'image/tiff', 'image/bmp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = express.Router();
const controller = new ClaimDetailController();
const remediationCtrl = new ClaimRemediationController();
const actionsCtrl = new ClaimActionsController();
const bulkCtrl = new BulkActionsController();
const historyCtrl = new ClaimHistoryController();
const docsCtrl = new ClaimDocumentsController();
const cms1500Ctrl = new Cms1500Controller();
const autoAssignCtrl = new AutoAssignmentController();
const sopRecsCtrl = new SOPRecommendationsController();
const commentsCtrl = new ClaimCommentsController();

// PHI audit: log every access to patient-identifiable claim data
router.get('/', phiAudit('phi.claim.view'), controller.getClaimInformation);
router.get('/detail-table', phiAudit('phi.claim.detail-table'), controller.getClaimDetailTable);

// Remediation steps + completions
router.get('/remediation', remediationCtrl.getSteps);
router.get('/smart-steps', sopRecsCtrl.getSmartSteps);
router.post('/step-completion', phiAudit('phi.claim.step-completion'), remediationCtrl.saveStepCompletion);

// Notes
router.get('/notes', remediationCtrl.getNotes);
router.post('/notes',      phiAudit('phi.claim.note-add'),    remediationCtrl.addNote);
router.put('/notes/:id',   requireRole('Manager'), phiAudit('phi.claim.note-edit'), remediationCtrl.updateNote);
router.delete('/notes/:id',phiAudit('phi.claim.note-delete'), remediationCtrl.deleteNote);

// Worker feedback
router.post('/feedback', phiAudit('phi.claim.feedback'), remediationCtrl.submitFeedback);

// Assignable users list (for assign-to dialog)
router.get('/assignable-users', async (req, res) => {
  try {
    const pool = actionsCtrl['pool'];
    const actorEmail      = ((req as any).actor?.email ?? req.headers['x-actor-email'] as string) ?? '';
    const isImpersonating = !!(req as any).actor?.impersonatedBy;
    const oid             = isImpersonating ? null : (req.headers['x-actor-oid'] as string) || null;

    const { resolveUserScope } = await import('../../../utils/resolve-user-scope');
    const scope = await resolveUserScope(pool, actorEmail, null, oid);

    const mssql = await import('mssql');
    const request = pool.request();

    // Super Admins with no tenant override see all active users across all tenants.
    // All other roles (Manager, Admin, AR Specialist) are scoped to their customer_id.
    if (!scope.isSuperAdmin && scope.customerId != null) {
      request.input('_custId', mssql.default.Int, scope.customerId);
      const result = await request.query(`
        SELECT userID AS id, FirstName + ' ' + LastName AS name, Role AS role
        FROM dbo.Users
        WHERE customer_id = @_custId
          AND ISNULL(disabled, 0) = 0 AND ISNULL(archived, 0) = 0
          AND Role IN ('AR Specialist', 'Manager', 'Super Admin')
        ORDER BY Role, name
      `);
      return res.json({ data: result.recordset });
    }

    // Super Admin (no tenant scope) - return all active users
    const result = await request.query(`
      SELECT userID AS id, FirstName + ' ' + LastName AS name, Role AS role
      FROM dbo.Users
      WHERE ISNULL(disabled, 0) = 0 AND ISNULL(archived, 0) = 0
        AND Role IN ('AR Specialist', 'Manager', 'Super Admin')
      ORDER BY Role, name
    `);
    return res.json({ data: result.recordset });
  } catch (e: any) { return res.status(500).json({ message: 'Internal server error' }); }
});

// Claim lifecycle actions
router.post('/start-work',       phiAudit('phi.claim.start-work'),       actionsCtrl.startWork);
router.post('/close',            phiAudit('phi.claim.close'),            actionsCtrl.close);
router.post('/close-adjudicated',phiAudit('phi.claim.close-adjudicated'),actionsCtrl.closeAdjudicated);
router.post('/unassign',         phiAudit('phi.claim.unassign'),         actionsCtrl.unassign);
router.post('/escalate',         phiAudit('phi.claim.escalate'),         actionsCtrl.escalate);
router.post('/write-off',        phiAudit('phi.claim.write-off'),        actionsCtrl.writeOff);
router.post('/assign',           phiAudit('phi.claim.assign'),           actionsCtrl.assign);

// Claim activity history
router.get('/history', historyCtrl.getHistory);
router.get('/history/export', historyCtrl.exportHistory);

// Auto-assignment engine
router.post('/auto-assign', phiAudit('phi.claim.auto-assign'), autoAssignCtrl.run);

// Bulk claim operations
router.post('/bulk-assign',    phiAudit('phi.claim.bulk-assign'),    bulkCtrl.bulkAssign);
router.post('/bulk-escalate',  phiAudit('phi.claim.bulk-escalate'),  bulkCtrl.bulkEscalate);
router.post('/bulk-close',     phiAudit('phi.claim.bulk-close'),     bulkCtrl.bulkClose);
router.post('/bulk-reassign',  phiAudit('phi.claim.bulk-reassign'),  bulkCtrl.bulkReassign);

// Document management
router.get('/documents/cms1500', cms1500Ctrl.get); // must be before /:id routes
router.get('/documents',                    phiAudit('phi.claim.documents'),         docsCtrl.list);
router.post('/documents',                   phiAudit('phi.claim.document-upload'),   docUpload.single('file'), docsCtrl.upload);
router.get('/documents/:id/download',       phiAudit('phi.claim.document-download'), docsCtrl.download);
router.delete('/documents/:id',             phiAudit('phi.claim.document-delete'),   docsCtrl.remove);

// Claim comments / threaded discussion
router.get('/comments/:claimId',            commentsCtrl.getComments);
router.post('/comments/:claimId',           phiAudit('phi.claim.comment-add'),    commentsCtrl.addComment);
router.put('/comments/:commentId',          phiAudit('phi.claim.comment-edit'),   commentsCtrl.editComment);
router.delete('/comments/:commentId',       phiAudit('phi.claim.comment-delete'), commentsCtrl.deleteComment);

export default router;
