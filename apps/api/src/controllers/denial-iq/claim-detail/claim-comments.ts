import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';
import { recordClaimEvent } from '../../../utils/claim-events';

/*
  DDL for reference. The schema is created by db/migrations - see 904_deferred_schema.sql.

  CREATE TABLE ClaimComment (
    id INT IDENTITY(1,1) PRIMARY KEY,
    claim_id NVARCHAR(50) NOT NULL,
    parent_id INT NULL REFERENCES ClaimComment(id),
    author_id INT NOT NULL,
    body NVARCHAR(MAX) NOT NULL,
    mentions NVARCHAR(500),
    is_edited BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
  );

  CREATE INDEX IX_ClaimComment_ClaimId ON ClaimComment(claim_id, created_at);
*/

export class ClaimCommentsController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/denial-iq/claim-detail/comments/:claimId - threaded comments */
  getComments = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const claimId = req.params.claimId;
      const xenCustId = extractCustomerId(req);

      const request = pool.request()
        .input('ClaimId', sql.NVarChar, claimId);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);
      const result = await request.query(`
          SELECT
            c.id, c.claim_id AS claimId, c.parent_id AS parentId,
            c.author_id AS authorId,
            u.FirstName + ' ' + u.LastName AS authorName,
            u.Role AS authorRole,
            c.body, c.mentions, c.is_edited AS isEdited,
            c.created_at AS createdAt, c.updated_at AS updatedAt
          FROM dbo.ClaimComment c
          JOIN dbo.Users u ON u.userID = c.author_id
          WHERE c.claim_id = @ClaimId${xenCustId != null ? ' AND c.customer_id = @_custId' : ''}
          ORDER BY c.created_at ASC
        `);

      // Build thread structure: top-level comments + replies nested
      const all = result.recordset;
      const topLevel = all.filter((c: any) => !c.parentId);
      const replies = all.filter((c: any) => c.parentId);

      const threaded = topLevel.map((c: any) => ({
        ...c,
        replies: replies.filter((r: any) => r.parentId === c.id),
      }));

      res.json({ comments: threaded, totalCount: all.length });
    } catch (err: any) {
      logger.error('claim comments get error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/denial-iq/claim-detail/comments/:claimId - add comment */
  addComment = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const claimId = req.params.claimId;
      const { body, parentId, mentions } = req.body;
      const userEmail = (req as any).actor?.email || '';
      const xenCustId = extractCustomerId(req);

      if (!body?.trim()) {
        return res.status(400).json({ error: 'Comment body is required' });
      }

      // Extract @mentions from body
      const mentionPattern = /@(\w+[\w.]*@[\w.]+)/g;
      const extractedMentions = (body.match(mentionPattern) || []).map((m: string) => m.substring(1));
      const allMentions = [...new Set([...(mentions || []), ...extractedMentions])];

      const request = pool.request()
        .input('ClaimId', sql.NVarChar, claimId)
        .input('ParentId', sql.Int, parentId || null)
        .input('Email', sql.NVarChar, userEmail)
        .input('Body', sql.NVarChar, body.trim())
        .input('Mentions', sql.NVarChar, allMentions.join(','));
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);
      const result = await request.query(`
          DECLARE @AuthorId INT = (SELECT TOP 1 userID FROM dbo.Users WHERE Email = @Email);

          INSERT INTO dbo.ClaimComment (claim_id, parent_id, author_id, body, mentions, customer_id)
          VALUES (@ClaimId, @ParentId, @AuthorId, @Body, @Mentions, ${xenCustId != null ? '@_custId' : 'NULL'});

          DECLARE @NewId INT = SCOPE_IDENTITY();

          SELECT c.id, c.claim_id AS claimId, c.parent_id AS parentId,
                 c.author_id AS authorId,
                 u.FirstName + ' ' + u.LastName AS authorName,
                 u.Role AS authorRole,
                 c.body, c.mentions, c.is_edited AS isEdited,
                 c.created_at AS createdAt
          FROM dbo.ClaimComment c
          JOIN dbo.Users u ON u.userID = c.author_id
          WHERE c.id = @NewId;
        `);

      const comment = result.recordset[0];

      // Fire-and-forget audit event
      void recordClaimEvent(pool, {
        customerId: xenCustId,
        claimId,
        eventType: 'claim_comment_added',
        actorUser: userEmail,
        metadata: { commentId: comment?.id, preview: body.trim().slice(0, 80) },
      });

      // Create notifications for mentioned users
      if (allMentions.length > 0) {
        for (const email of allMentions) {
          try {
            await pool.request()
              .input('MEmail', sql.NVarChar, email)
              .input('ClaimId2', sql.NVarChar, claimId)
              .input('AuthorName', sql.NVarChar, comment?.authorName || 'Someone')
              .query(`
                DECLARE @MUserId INT = (SELECT TOP 1 userID FROM dbo.Users WHERE Email = @MEmail);
                IF @MUserId IS NOT NULL
                BEGIN
                  INSERT INTO dbo.Notifications (user_id, type, title, body, link, created_at)
                  VALUES (@MUserId, 'mention', 'New Mention',
                          @AuthorName + ' mentioned you on claim ' + @ClaimId2,
                          '/app/denial-iq/claims/' + @ClaimId2, GETDATE());
                END
              `);
          } catch { /* Notifications table might not exist yet - fail silently */ }
        }
      }

      res.json(comment);
    } catch (err: any) {
      logger.error('claim comment add error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/denial-iq/claim-detail/comments/:commentId - edit comment */
  editComment = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const commentId = parseInt(req.params.commentId);
      const { body } = req.body;
      const xenCustId = extractCustomerId(req);
      const userEmail = (req as any).actor?.email || (req.headers['x-actor-email'] as string) || '';

      // Fetch claim_id for audit before update
      const metaRow = await pool.request()
        .input('MetaId', sql.Int, commentId)
        .query(`SELECT claim_id FROM dbo.ClaimComment WHERE id = @MetaId`);
      const commentClaimId: string | null = metaRow.recordset[0]?.claim_id ?? null;

      const request = pool.request()
        .input('Id', sql.Int, commentId)
        .input('Body', sql.NVarChar, body.trim());
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);
      await request.query(`
          UPDATE dbo.ClaimComment
          SET body = @Body, is_edited = 1, updated_at = GETDATE()
          WHERE id = @Id${xenCustId != null ? ' AND customer_id = @_custId' : ''}
        `);

      if (commentClaimId) {
        void recordClaimEvent(pool, {
          customerId: xenCustId,
          claimId: commentClaimId,
          eventType: 'claim_comment_edited',
          actorUser: userEmail,
          metadata: { commentId, preview: body.trim().slice(0, 80) },
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      logger.error('claim comment edit error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/denial-iq/claim-detail/comments/:commentId - delete comment */
  deleteComment = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const commentId = parseInt(req.params.commentId);
      const xenCustId = extractCustomerId(req);
      const userEmail = (req as any).actor?.email || (req.headers['x-actor-email'] as string) || '';

      // Fetch claim_id for audit before delete
      const metaRow = await pool.request()
        .input('MetaId', sql.Int, commentId)
        .query(`SELECT claim_id FROM dbo.ClaimComment WHERE id = @MetaId`);
      const commentClaimId: string | null = metaRow.recordset[0]?.claim_id ?? null;

      const request = pool.request()
        .input('Id', sql.Int, commentId);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);
      await request.query(`DELETE FROM dbo.ClaimComment WHERE id = @Id${xenCustId != null ? ' AND customer_id = @_custId' : ''}`);

      if (commentClaimId) {
        void recordClaimEvent(pool, {
          customerId: xenCustId,
          claimId: commentClaimId,
          eventType: 'claim_comment_deleted',
          actorUser: userEmail,
          metadata: { commentId },
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      logger.error('claim comment delete error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
