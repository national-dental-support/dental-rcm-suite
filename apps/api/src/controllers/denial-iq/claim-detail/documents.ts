import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class ClaimDocumentsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** GET /denial-iq/claim-detail/documents?claimId=CL5xxxx */
  public list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = req.query.claimId as string;
      if (!claimId) {
        return res.status(400).json({ message: 'claimId is required' });
      }

      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('claimId', claimId);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(`
        SELECT
          id,
          claim_id,
          file_name,
          content_type,
          file_size,
          doc_type,
          uploaded_by,
          created_at
        FROM dbo.ClaimDocuments
        WHERE claim_id = @claimId${xenCustId != null ? ' AND customer_id = @_custId' : ''}
        ORDER BY created_at DESC
      `);

      return res.status(200).json({ data: result.recordset || [] });
    } catch (error: unknown) {
      logger.error('ClaimDocuments.list \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /** POST /denial-iq/claim-detail/documents (multipart: file + claimId + docType) */
  public upload = async (req: Request, res: Response): Promise<Response> => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const { claimId, docType } = req.body;
      if (!claimId) {
        return res.status(400).json({ message: 'claimId is required' });
      }

      const uploadedBy =
        (req.headers['x-actor-email'] as string) || 'unknown';
      const xenCustId = extractCustomerId(req);

      const request = this.pool.request();
      request.input('claimId', claimId);
      request.input('fileName', file.originalname);
      request.input('contentType', file.mimetype);
      request.input('fileSize', file.size);
      request.input('fileData', file.buffer);
      request.input('docType', docType || 'other');
      request.input('uploadedBy', uploadedBy);
      request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(`
        INSERT INTO dbo.ClaimDocuments
          (claim_id, file_name, content_type, file_size, file_data, doc_type, uploaded_by, customer_id)
        OUTPUT
          INSERTED.id,
          INSERTED.claim_id,
          INSERTED.file_name,
          INSERTED.content_type,
          INSERTED.file_size,
          INSERTED.doc_type,
          INSERTED.uploaded_by,
          INSERTED.created_at
        VALUES
          (@claimId, @fileName, @contentType, @fileSize, @fileData, @docType, @uploadedBy, @_custId)
      `);

      const row = result.recordset?.[0];
      logger.info('ClaimDocuments.upload \u2013 document saved', {
        claimId,
        fileName: file.originalname,
        docId: row?.id,
      });

      return res.status(201).json({ data: row });
    } catch (error: unknown) {
      logger.error('ClaimDocuments.upload \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /** GET /denial-iq/claim-detail/documents/:id/download */
  public download = async (req: Request, res: Response): Promise<void> => {
    try {
      const docId = parseInt(req.params.id, 10);
      if (isNaN(docId)) {
        res.status(400).json({ message: 'Invalid document ID' });
        return;
      }

      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('id', docId);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result = await request.query(`
        SELECT file_name, content_type, file_data
        FROM dbo.ClaimDocuments
        WHERE id = @id${xenCustId != null ? ' AND customer_id = @_custId' : ''}
      `);

      const row = result.recordset?.[0];
      if (!row) {
        res.status(404).json({ message: 'Document not found' });
        return;
      }

      res.setHeader('Content-Type', row.content_type);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${row.file_name}"`,
      );
      res.send(row.file_data);
    } catch (error: unknown) {
      logger.error('ClaimDocuments.download \u2013 error', { error });
      res.status(500).json({
        message: 'Internal server error',
      });
    }
  };

  /** DELETE /denial-iq/claim-detail/documents/:id */
  public remove = async (req: Request, res: Response): Promise<Response> => {
    try {
      const docId = parseInt(req.params.id, 10);
      if (isNaN(docId)) {
        return res.status(400).json({ message: 'Invalid document ID' });
      }

      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('id', docId);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      await request.query(`
        DELETE FROM dbo.ClaimDocuments WHERE id = @id${xenCustId != null ? ' AND customer_id = @_custId' : ''}
      `);

      logger.info('ClaimDocuments.remove \u2013 document deleted', { docId });
      return res.status(200).json({ message: 'Document deleted' });
    } catch (error: unknown) {
      logger.error('ClaimDocuments.remove \u2013 error', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
