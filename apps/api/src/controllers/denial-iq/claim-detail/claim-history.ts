import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

const EVENT_TYPE_LABELS: Record<string, string> = {
  denial_work_started:      'Work started',
  denial_work_completed:    'Work completed',
  denial_work_assigned:     'Claim assigned',
  denial_work_unassigned:   'Claim unassigned',
  denial_work_escalated:    'Claim escalated',
  denial_claim_written_off: 'Claim written off',
  claim_comment_added:      'Comment added',
  claim_comment_edited:     'Comment edited',
  claim_comment_deleted:    'Comment deleted',
  claim_note_added:         'Note added',
  claim_note_edited:        'Note edited',
  claim_document_uploaded:  'Document uploaded',
  claim_document_deleted:   'Document deleted',
};

const SLA_TYPE_LABELS: Record<string, string> = {
  first_touch:           'SLA Violation: First touch',
  followup_cadence:      'SLA Violation: Follow-up cadence',
  resolution_deadline:   'SLA Violation: Resolution deadline',
  appeal_deadline:       'SLA Violation: Appeal deadline',
};

function labelEvent(eventType: string, metadataStr?: string | null): string {
  let meta: Record<string, any> = {};
  try { if (metadataStr) meta = JSON.parse(metadataStr); } catch {}
  const base = EVENT_TYPE_LABELS[eventType] ?? eventType.replace(/_/g, ' ');
  if (meta.preview)     return `${base}: "${meta.preview}"`;
  if (meta.assignedTo)  return `${base} \u2014 to user ${meta.assignedTo}`;
  if (meta.reason)      return `${base} \u2014 ${meta.reason}`;
  return base;
}

function labelSla(type: string, thresholdHrs: number, actualHrs: number, resolvedAt: Date | null): string {
  const base = SLA_TYPE_LABELS[type] ?? `SLA Violation: ${type}`;
  const status = resolvedAt ? 'resolved' : 'active';
  return `${base} \u2014 ${actualHrs}h actual (threshold: ${thresholdHrs}h) [${status}]`;
}

export class ClaimHistoryController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  private async fetchTimeline(claimId: string, xenCustId: number | null): Promise<any[]> {
    const histReq = this.pool.request().input('ClaimID', sql.NVarChar(50), claimId);
    if (xenCustId != null) histReq.input('_custId', sql.Int, xenCustId);
    const result = await histReq.query(`
        SELECT
          ch.ClaimHistoryId, ch.ClaimID, ch.ClaimStatus, ch.AssignedTo,
          LTRIM(RTRIM(COALESCE(u.FirstName, '') + ' ' + COALESCE(u.LastName, ''))) AS AssignedToName,
          u.Role AS AssignedToRole,
          ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime,
          ch.ClaimBalanceDue, ch.CarcCode, ch.Progress, ch.ClaimModifiedDate
        FROM dbo.claimhistory ch
        LEFT JOIN dbo.Users u ON ch.AssignedTo = u.userID
        WHERE ch.ClaimID = @ClaimID${xenCustId != null ? ' AND ch.customer_id = @_custId' : ''}
        ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
      `);

    const noteReq = this.pool.request().input('ClaimID2', sql.NVarChar(50), claimId);
    if (xenCustId != null) noteReq.input('_custId2', sql.Int, xenCustId);
    const notesResult = await noteReq.query(`
        SELECT id, claim_id, step_id, author_user_id, note_text, note_type, created_at
        FROM dbo.ClaimStepNote
        WHERE claim_id = @ClaimID2${xenCustId != null ? ' AND customer_id = @_custId2' : ''}
        ORDER BY created_at DESC
      `);

    const stepReq = this.pool.request().input('ClaimID3', sql.NVarChar(50), claimId);
    if (xenCustId != null) stepReq.input('_custId3', sql.Int, xenCustId);
    const stepsResult = await stepReq.query(`
        SELECT sc.id, sc.claim_id, sc.step_id, sc.user_id AS completed_by, sc.completed_at,
               rs.title AS step_title
        FROM dbo.ClaimStepCompletion sc
        LEFT JOIN dbo.RemediationStep rs ON sc.step_id = rs.id
        WHERE sc.claim_id = @ClaimID3${xenCustId != null ? ' AND sc.customer_id = @_custId3' : ''}
        ORDER BY sc.completed_at DESC
      `);

    // ClaimEvent entries
    const evtReq = this.pool.request().input('ClaimID4', sql.NVarChar(50), claimId);
    if (xenCustId != null) evtReq.input('_custId4', sql.Int, xenCustId);
    const eventsResult = await evtReq.query(`
        SELECT id, event_type, event_time, actor_user, metadata
        FROM dbo.ClaimEvent
        WHERE claim_id = @ClaimID4${xenCustId != null ? ' AND (customer_id = @_custId4 OR customer_id IS NULL)' : ''}
        ORDER BY event_time DESC
      `);

    // SLA violations
    let slaResult: { recordset: any[] } = { recordset: [] };
    try {
      const slaReq = this.pool.request().input('ClaimID5', sql.NVarChar(50), claimId);
      if (xenCustId != null) slaReq.input('_custId5', sql.Int, xenCustId);
      slaResult = await slaReq.query(`
          SELECT violation_type, threshold_hours, actual_hours, detected_at, resolved_at
          FROM dbo.SlaViolation
          WHERE claim_id = @ClaimID5${xenCustId != null ? ' AND customer_id = @_custId5' : ''}
          ORDER BY detected_at DESC
        `);
    } catch {}

    const timeline: any[] = [];

    for (const row of result.recordset) {
      const action = row.ClaimWorkEndedTime
        ? `${row.ClaimStatus || 'Closed'} \u2014 work ended`
        : `${row.ClaimStatus || 'Assigned'} \u2014 work started`;
      timeline.push({
        type: 'status', eventSource: 'history',
        date: row.ClaimWorkStartedTime || row.ClaimModifiedDate,
        action,
        performedBy: row.AssignedToName?.trim() || 'System',
        role: row.AssignedToRole || null,
        status: row.ClaimStatus,
        progress: row.Progress,
        balance: row.ClaimBalanceDue,
      });
    }

    for (const note of notesResult.recordset) {
      timeline.push({
        type: note.note_type || 'note', eventSource: 'history',
        date: note.created_at,
        action: note.note_text,
        performedBy: note.author_user_id || 'Unknown',
      });
    }

    for (const step of stepsResult.recordset) {
      timeline.push({
        type: 'step_completion', eventSource: 'history',
        date: step.completed_at,
        action: `Completed step: ${step.step_title || 'Unknown'}`,
        performedBy: step.completed_by || 'Unknown',
      });
    }

    for (const evt of eventsResult.recordset) {
      let metadata: Record<string, any> | null = null;
      try { if (evt.metadata) metadata = JSON.parse(evt.metadata); } catch {}
      timeline.push({
        type: 'event', eventSource: 'event',
        date: evt.event_time,
        action: labelEvent(evt.event_type, evt.metadata),
        performedBy: evt.actor_user || 'System',
        metadata,
      });
    }

    for (const sla of slaResult.recordset) {
      timeline.push({
        type: 'sla', eventSource: 'sla',
        date: sla.detected_at,
        action: labelSla(sla.violation_type, sla.threshold_hours, sla.actual_hours, sla.resolved_at),
        performedBy: 'System',
        resolved: !!sla.resolved_at,
      });
    }

    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return timeline;
  }

  public getHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.query.claimId as string;
      if (!claimId) {
        return res.status(400).json({ message: 'claimId query parameter is required' });
      }
      const xenCustId = extractCustomerId(req);
      const timeline = await this.fetchTimeline(claimId, xenCustId);
      return res.json({ message: 'Claim history', data: timeline });
    } catch (error: unknown) {
      logger.error('ClaimHistoryController.getHistory error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  public exportHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const claimId = req.query.claimId as string;
      if (!claimId) { res.status(400).json({ message: 'claimId query parameter is required' }); return; }
      const xenCustId = extractCustomerId(req);
      const timeline = await this.fetchTimeline(claimId, xenCustId);

      const csvRows = [
        ['Date', 'Source', 'Type', 'Action', 'Performed By', 'Status', 'Progress', 'Balance', 'Resolved'],
      ];
      for (const item of timeline) {
        csvRows.push([
          item.date ? new Date(item.date).toISOString() : '',
          item.eventSource ?? '',
          item.type ?? '',
          (item.action ?? '').replace(/"/g, '""'),
          (item.performedBy ?? '').replace(/"/g, '""'),
          item.status ?? '',
          item.progress != null ? String(item.progress) : '',
          item.balance != null ? String(item.balance) : '',
          item.resolved != null ? (item.resolved ? 'yes' : 'no') : '',
        ]);
      }
      const csv = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\r\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="claim-${claimId}-activity.csv"`);
      res.send(csv);
    } catch (error: unknown) {
      logger.error('ClaimHistoryController.exportHistory error', { error });
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
