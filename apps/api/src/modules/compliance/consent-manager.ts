/**
 * Consent document management with versioned e-signatures and audit trail.
 */

import { ConnectionPool } from 'mssql';
import sql from 'mssql';

export class ConsentManagerService {
  constructor(private pool: ConnectionPool) {}

  async createDocument(
    customerId: number, documentType: string, title: string, bodyHtml: string,
    requiresWitness: boolean = false
  ): Promise<number> {
    // Deactivate previous version
    await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('type', sql.NVarChar, documentType)
      .query(`UPDATE ConsentDocument SET is_current = 0 WHERE customer_id = @custId AND document_type = @type`);

    // Get next version number
    const verResult = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('type', sql.NVarChar, documentType)
      .query(`SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM ConsentDocument WHERE customer_id = @custId AND document_type = @type`);

    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('type', sql.NVarChar, documentType)
      .input('ver', sql.Int, verResult.recordset[0].next_ver)
      .input('title', sql.NVarChar, title)
      .input('body', sql.NVarChar, bodyHtml)
      .input('witness', sql.Bit, requiresWitness ? 1 : 0)
      .query(`
        INSERT INTO ConsentDocument (customer_id, document_type, version, title, body_html, requires_witness)
        OUTPUT INSERTED.id
        VALUES (@custId, @type, @ver, @title, @body, @witness)
      `);
    return result.recordset[0].id;
  }

  async getCurrentDocuments(customerId: number): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .query(`SELECT * FROM ConsentDocument WHERE customer_id = @custId AND is_current = 1 ORDER BY document_type`);
    return result.recordset;
  }

  async signDocument(
    customerId: number, patientId: number, documentId: number,
    signatureData: string, signerName: string,
    signerRelationship?: string, witnessName?: string, witnessSignature?: string,
    ipAddress?: string, userAgent?: string
  ): Promise<number> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('patId', sql.Int, patientId)
      .input('docId', sql.Int, documentId)
      .input('sig', sql.NVarChar, signatureData)
      .input('name', sql.NVarChar, signerName)
      .input('rel', sql.NVarChar, signerRelationship ?? 'self')
      .input('wName', sql.NVarChar, witnessName ?? null)
      .input('wSig', sql.NVarChar, witnessSignature ?? null)
      .input('ip', sql.NVarChar, ipAddress ?? null)
      .input('ua', sql.NVarChar, userAgent ?? null)
      .query(`
        INSERT INTO ConsentSignature
          (customer_id, patient_id, document_id, signature_data, signer_name,
           signer_relationship, witness_name, witness_signature, ip_address, user_agent)
        OUTPUT INSERTED.id
        VALUES (@custId, @patId, @docId, @sig, @name, @rel, @wName, @wSig, @ip, @ua)
      `);
    return result.recordset[0].id;
  }

  async getPatientSignatures(patientId: number, customerId: number): Promise<any[]> {
    const result = await this.pool.request()
      .input('patId', sql.Int, patientId)
      .input('custId', sql.Int, customerId)
      .query(`
        SELECT cs.*, cd.document_type, cd.title, cd.version
        FROM ConsentSignature cs
        JOIN ConsentDocument cd ON cs.document_id = cd.id
        WHERE cs.patient_id = @patId AND cs.customer_id = @custId
        ORDER BY cs.signed_at DESC
      `);
    return result.recordset;
  }

  async getUnsignedDocuments(patientId: number, customerId: number): Promise<any[]> {
    const result = await this.pool.request()
      .input('patId', sql.Int, patientId)
      .input('custId', sql.Int, customerId)
      .query(`
        SELECT cd.* FROM ConsentDocument cd
        WHERE cd.customer_id = @custId AND cd.is_current = 1 AND cd.is_required = 1
          AND cd.id NOT IN (
            SELECT document_id FROM ConsentSignature
            WHERE patient_id = @patId AND customer_id = @custId
          )
      `);
    return result.recordset;
  }
}
