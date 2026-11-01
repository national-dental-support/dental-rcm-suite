/**
 * Security enhancements: session audit recording, field masking,
 * break-the-glass access, BAA management.
 */

import { ConnectionPool } from 'mssql';
import sql from 'mssql';
import logger from '../../utils/logger';

/**
 * Session audit - track every PHI access action.
 */
export class SessionAuditService {
  constructor(private pool: ConnectionPool) {}

  async log(
    customerId: number, userId: string, sessionId: string,
    action: string, entityType?: string, entityId?: string,
    details?: Record<string, any>, ipAddress?: string
  ): Promise<void> {
    await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('userId', sql.NVarChar, userId)
      .input('sessId', sql.NVarChar, sessionId)
      .input('action', sql.NVarChar, action)
      .input('eType', sql.NVarChar, entityType ?? null)
      .input('eId', sql.NVarChar, entityId ?? null)
      .input('details', sql.NVarChar, details ? JSON.stringify(details) : null)
      .input('ip', sql.NVarChar, ipAddress ?? null)
      .query(`
        INSERT INTO SessionAudit (customer_id, user_id, session_id, action, entity_type, entity_id, details, ip_address)
        VALUES (@custId, @userId, @sessId, @action, @eType, @eId, @details, @ip)
      `);
  }

  async getAuditTrail(
    customerId: number, entityType: string, entityId: string, limit: number = 50
  ): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('eType', sql.NVarChar, entityType)
      .input('eId', sql.NVarChar, entityId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) * FROM SessionAudit
        WHERE customer_id = @custId AND entity_type = @eType AND entity_id = @eId
        ORDER BY created_at DESC
      `);
    return result.recordset;
  }
}

/**
 * Field masking - role-based PHI field visibility.
 */
export class FieldMaskingService {
  constructor(private pool: ConnectionPool) {}

  async getMaskingRules(customerId: number): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .query(`SELECT * FROM FieldMaskingRule WHERE customer_id = @custId AND is_active = 1`);
    return result.recordset;
  }

  /**
   * Apply masking to a record based on the user's role.
   */
  applyMasking(record: Record<string, any>, entityType: string, userRole: string, rules: any[]): Record<string, any> {
    const roleHierarchy: Record<string, number> = {
      'Super Admin': 100, 'Admin': 80, 'Manager': 60, 'Provider': 50, 'AR Specialist': 30, 'Front Desk': 20,
    };
    const userLevel = roleHierarchy[userRole] ?? 0;
    const masked = { ...record };

    for (const rule of rules) {
      if (rule.entity_type !== entityType) continue;
      const requiredLevel = roleHierarchy[rule.min_role] ?? 100;

      if (userLevel < requiredLevel && masked[rule.field_name] !== undefined) {
        const value = masked[rule.field_name];
        if (rule.mask_type === 'hidden') {
          masked[rule.field_name] = null;
        } else if (rule.mask_type === 'partial' && typeof value === 'string') {
          masked[rule.field_name] = value.length > 4 ? '***' + value.slice(-4) : '****';
        } else {
          masked[rule.field_name] = '[REDACTED]';
        }
      }
    }
    return masked;
  }
}

/**
 * Break-the-glass - emergency override for locked records.
 */
export class BreakTheGlassService {
  constructor(private pool: ConnectionPool) {}

  async requestAccess(
    customerId: number, userId: string, patientId: number,
    reason: string, entityType: string, entityId?: string, ipAddress?: string
  ): Promise<number> {
    if (!reason || reason.trim().length < 10) {
      throw new Error('A detailed justification is required (minimum 10 characters)');
    }

    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('userId', sql.NVarChar, userId)
      .input('patId', sql.Int, patientId)
      .input('reason', sql.NVarChar, reason)
      .input('eType', sql.NVarChar, entityType)
      .input('eId', sql.NVarChar, entityId ?? null)
      .input('ip', sql.NVarChar, ipAddress ?? null)
      .query(`
        INSERT INTO BreakTheGlassLog (customer_id, user_id, patient_id, reason, entity_type, entity_id, ip_address)
        OUTPUT INSERTED.id
        VALUES (@custId, @userId, @patId, @reason, @eType, @eId, @ip)
      `);

    logger.warn(`BREAK-THE-GLASS: user ${userId} accessed patient ${patientId} (${entityType}). Reason: ${reason}`);
    return result.recordset[0].id;
  }

  async getLog(customerId: number, limit: number = 100): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('limit', sql.Int, limit)
      .query(`SELECT TOP (@limit) * FROM BreakTheGlassLog WHERE customer_id = @custId ORDER BY accessed_at DESC`);
    return result.recordset;
  }
}

/**
 * BAA management - track Business Associate Agreements with vendors.
 */
export class BaaManagementService {
  constructor(private pool: ConnectionPool) {}

  async createBaa(customerId: number, data: any): Promise<number> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('vendor', sql.NVarChar, data.vendorName)
      .input('contact', sql.NVarChar, data.vendorContact ?? null)
      .input('date', sql.Date, data.agreementDate)
      .input('expires', sql.Date, data.expirationDate ?? null)
      .input('renewal', sql.Date, data.renewalDate ?? null)
      .input('docPath', sql.NVarChar, data.documentPath ?? null)
      .input('notes', sql.NVarChar, data.notes ?? null)
      .query(`
        INSERT INTO BusinessAssociateAgreement (customer_id, vendor_name, vendor_contact, agreement_date, expiration_date, renewal_date, document_path, notes)
        OUTPUT INSERTED.id
        VALUES (@custId, @vendor, @contact, @date, @expires, @renewal, @docPath, @notes)
      `);
    return result.recordset[0].id;
  }

  async getAll(customerId: number): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .query(`SELECT * FROM BusinessAssociateAgreement WHERE customer_id = @custId ORDER BY status, expiration_date`);
    return result.recordset;
  }

  async getExpiring(customerId: number, withinDays: number = 60): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('days', sql.Int, withinDays)
      .query(`
        SELECT * FROM BusinessAssociateAgreement
        WHERE customer_id = @custId AND status = 'active'
          AND expiration_date IS NOT NULL AND expiration_date <= DATEADD(DAY, @days, GETUTCDATE())
        ORDER BY expiration_date
      `);
    return result.recordset;
  }
}
