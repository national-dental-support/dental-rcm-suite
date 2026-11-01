/**
 * Claim mutation audit middleware.
 *
 * Applied once at /api/denial-iq - automatically logs every mutating request
 * (POST/PUT/PATCH/DELETE) to AdminAuditLog after the response is sent.
 * Logs both successful (2xx) and failed (4xx/5xx) requests; failed requests
 * are recorded with outcome='failure' for HIPAA/SOC2 traceability.
 */
import { Request, Response, NextFunction } from 'express';
import Database from '../modules/db';
import { writeAuditLog } from '../utils/audit-log';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type ActionResolver = string | ((req: Request) => string);

const ACTION_MAP: [RegExp, ActionResolver][] = [
  // Lifecycle
  [/\/claim-detail\/start-work/,        'claim.work_started'],
  [/\/claim-detail\/close-adjudicated/, 'claim.closed_adjudicated'],
  [/\/claim-detail\/close$/,            'claim.closed'],
  [/\/claim-detail\/unassign/,          'claim.unassigned'],
  [/\/claim-detail\/assign$/,           'claim.assigned'],
  [/\/claim-detail\/escalate/,          'claim.escalated'],
  [/\/claim-detail\/write-off/,         'claim.written_off'],
  [/\/claim-detail\/step-completion/,   'claim.step_completed'],
  [/\/claim-detail\/feedback/,          'claim.feedback_submitted'],
  // Bulk
  [/\/claim-detail\/bulk-assign/,       'claim.bulk_assigned'],
  [/\/claim-detail\/bulk-escalate/,     'claim.bulk_escalated'],
  [/\/claim-detail\/bulk-close/,        'claim.bulk_closed'],
  [/\/claim-detail\/bulk-reassign/,     'claim.bulk_reassigned'],
  [/\/claim-detail\/auto-assign/,       'claim.auto_assigned'],
  // Notes
  [/\/claim-detail\/notes\/\d+/,        (r) => r.method === 'DELETE' ? 'claim.note_deleted' : 'claim.note_updated'],
  [/\/claim-detail\/notes/,             'claim.note_added'],
  // Comments
  [/\/claim-detail\/comments\/\d+/,     (r) => r.method === 'DELETE' ? 'claim.comment_deleted' : 'claim.comment_edited'],
  [/\/claim-detail\/comments/,          'claim.comment_added'],
  // Documents
  [/\/claim-detail\/documents\/\d+/,    'claim.document_deleted'],
  [/\/claim-detail\/documents/,         'claim.document_uploaded'],
  // Narrative score
  [/\/narrative-score/,                 'claim.narrative_scored'],
  // Rewrite
  [/\/claim-rewrite\/[^/]+\/accept/,    (r) => r.body?.accepted === false ? 'claim.rewrite_discarded' : 'claim.rewrite_accepted'],
  [/\/claim-rewrite\//,                 'claim.rewrite_generated'],
  // Approvals
  [/\/approvals\/\d+/,                  (r) => r.method === 'DELETE' ? 'claim.approval_recalled' : 'claim.approval_reviewed'],
  [/\/approvals$/,                      'claim.approval_submitted'],
  // Resubmission package
  [/\/resubmission-package\/[^/]+\/attachments\/\d+/, 'claim.attachment_deleted'],
  [/\/resubmission-package\/[^/]+\/attachments/,      'claim.attachment_added'],
  [/\/resubmission-package\/[^/]+$/,    (r) => r.method === 'POST' ? 'claim.package_created' : 'claim.package_updated'],
  // Appeals
  [/\/appeals\/generate-ai/,            'claim.appeal_ai_generated'],
  [/\/appeals\/generate/,               'claim.appeal_generated'],
  [/\/appeals\/templates\/\d+/,         (r) => r.method === 'DELETE' ? 'claim.appeal_template_deleted' : 'claim.appeal_template_updated'],
  [/\/appeals\/templates/,              'claim.appeal_template_created'],
  [/\/appeals\/\d+/,                    'claim.appeal_status_updated'],
  [/\/appeals$/,                        'claim.appeal_created'],
  // Outcome / template performance
  [/\/template-performance\/outcome/,   'claim.outcome_recorded'],
];

function deriveAction(req: Request): string | null {
  if (!MUTATION_METHODS.has(req.method)) return null;
  const path = req.originalUrl.replace(/\?.*$/, '').replace(/^\/api/, '');
  for (const [pattern, resolver] of ACTION_MAP) {
    if (pattern.test(path)) {
      return typeof resolver === 'function' ? resolver(req) : resolver;
    }
  }
  return null;
}

function extractClaimId(req: Request): string | undefined {
  if (req.params.claimId) return req.params.claimId;
  const body = req.body ?? {};
  if (body.claimId) return String(body.claimId);
  if (body.claim_id) return String(body.claim_id);
  if (Array.isArray(body.claimIds) && body.claimIds.length) return body.claimIds.join(',');
  if (req.query.claimId) return req.query.claimId as string;
  if (req.params.id) return req.params.id;
  return undefined;
}

// Strip large text blobs - keep only metadata fields for the audit entry
const OMIT_FIELDS = new Set([
  'narrative', 'rewritten_text', 'original_text', 'diff_hunks',
  'letter_body', 'letter_text', 'content', 'corrected_claim_text',
]);

function summarizeBody(body: any): Record<string, any> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!OMIT_FIELDS.has(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Generic mutation audit factory for non-denial-iq platforms.
 * Derives an action string from the platform name + HTTP method + URL path.
 */
export function mutationAudit(platform: string) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!MUTATION_METHODS.has(req.method)) return next();

    const actor     = (req as any).actor;
    const actorId   = actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'unknown';
    const actorRole = actor?.role ?? 'unknown';
    const targetId  = extractClaimId(req);
    const sessionId = req.headers['x-session-id'] as string | undefined;
    const bodySummary = summarizeBody(req.body);
    const startedAt   = Date.now();

    // e.g. insightflow.post.denial-management.top-reasons
    const rawPath = req.originalUrl.replace(/\?.*$/, '').replace(/^\/api\/[^/]+\/?/, '');
    const segment = rawPath.replace(/\/\d+/g, '').replace(/^\//, '').replace(/\//g, '.').slice(0, 80) || 'root';
    const action = `${platform}.${req.method.toLowerCase()}.${segment}`;

    res.on('finish', () => {
      const outcome: 'success' | 'failure' = res.statusCode < 400 ? 'success' : 'failure';
      try {
        const pool = Database.getInstance().getPool();
        writeAuditLog(pool, {
          actor_id:    actorId,
          actor_role:  actorRole,
          action,
          target_id:   targetId,
          after_state: bodySummary ?? undefined,
          ip_address:  req.ip,
          session_id:  sessionId,
          outcome,
          cause:       outcome === 'failure' ? `HTTP ${res.statusCode}` : undefined,
          duration_ms: Date.now() - startedAt,
        });
      } catch { /* fire-and-forget - must not throw */ }
    });

    next();
  };
}

export function claimMutationAudit(req: Request, res: Response, next: NextFunction): void {
  const action = deriveAction(req);
  if (!action) return next();

  const actor   = (req as any).actor;
  const actorId  = actor?.email ?? (req.headers['x-actor-email'] as string) ?? 'unknown';
  const actorRole = actor?.role ?? 'unknown';
  const targetId  = extractClaimId(req);
  const sessionId = req.headers['x-session-id'] as string | undefined;
  const bodySummary = summarizeBody(req.body);
  const startedAt = Date.now();

  res.on('finish', () => {
    const outcome: 'success' | 'failure' = res.statusCode < 400 ? 'success' : 'failure';
    const cause = outcome === 'failure' ? `HTTP ${res.statusCode}` : undefined;
    try {
      const pool = Database.getInstance().getPool();
      writeAuditLog(pool, {
        actor_id:    actorId,
        actor_role:  actorRole,
        action,
        target_id:   targetId,
        after_state: bodySummary ?? undefined,
        ip_address:  req.ip,
        session_id:  sessionId,
        outcome,
        cause,
        duration_ms: Date.now() - startedAt,
      });
    } catch { /* fire-and-forget - must not throw */ }
  });

  next();
}
