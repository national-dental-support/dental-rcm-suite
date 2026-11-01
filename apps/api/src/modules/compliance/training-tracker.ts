/**
 * HIPAA/OSHA compliance training tracker.
 *
 * Tracks staff training assignments, completions, expirations, and certificates.
 */

import { ConnectionPool } from 'mssql';
import sql from 'mssql';
import logger from '../../utils/logger';

export const TRAINING_TYPES = [
  { type: 'hipaa_privacy', name: 'HIPAA Privacy Rule', requiredAnnually: true },
  { type: 'hipaa_security', name: 'HIPAA Security Rule', requiredAnnually: true },
  { type: 'osha_bloodborne', name: 'OSHA Bloodborne Pathogens', requiredAnnually: true },
  { type: 'infection_control', name: 'Infection Control & Prevention', requiredAnnually: true },
  { type: 'emergency_procedures', name: 'Emergency Procedures', requiredAnnually: false },
  { type: 'cpr_bls', name: 'CPR/BLS Certification', requiredAnnually: false },
  { type: 'fire_safety', name: 'Fire Safety', requiredAnnually: true },
  { type: 'harassment_prevention', name: 'Harassment Prevention', requiredAnnually: true },
];

export class TrainingTrackerService {
  constructor(private pool: ConnectionPool) {}

  async assignTraining(
    customerId: number, userId: string, trainingType: string, trainingName: string,
    assignedBy: string, expiresAt?: Date
  ): Promise<number> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('userId', sql.NVarChar, userId)
      .input('type', sql.NVarChar, trainingType)
      .input('name', sql.NVarChar, trainingName)
      .input('by', sql.NVarChar, assignedBy)
      .input('expires', sql.DateTime2, expiresAt ?? null)
      .query(`
        INSERT INTO ComplianceTraining (customer_id, user_id, training_type, training_name, assigned_by, expires_at)
        OUTPUT INSERTED.id
        VALUES (@custId, @userId, @type, @name, @by, @expires)
      `);
    return result.recordset[0].id;
  }

  async completeTraining(trainingId: number, score?: number, certificatePath?: string): Promise<void> {
    await this.pool.request()
      .input('id', sql.Int, trainingId)
      .input('score', sql.Float, score ?? null)
      .input('cert', sql.NVarChar, certificatePath ?? null)
      .query(`
        UPDATE ComplianceTraining
        SET status = 'completed', completed_at = GETUTCDATE(), score = @score, certificate_path = @cert
        WHERE id = @id
      `);
  }

  async getTrainingStatus(customerId: number, userId?: string): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('userId', sql.NVarChar, userId ?? null)
      .query(`
        SELECT ct.*, u.firstName + ' ' + u.lastName AS user_name
        FROM ComplianceTraining ct
        LEFT JOIN users u ON ct.user_id = CAST(u.id AS NVARCHAR)
        WHERE ct.customer_id = @custId
        ${userId ? 'AND ct.user_id = @userId' : ''}
        ORDER BY ct.status, ct.expires_at
      `);
    return result.recordset;
  }

  async getExpiring(customerId: number, withinDays: number = 30): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('days', sql.Int, withinDays)
      .query(`
        SELECT * FROM ComplianceTraining
        WHERE customer_id = @custId AND status = 'completed'
          AND expires_at IS NOT NULL AND expires_at <= DATEADD(DAY, @days, GETUTCDATE())
          AND expires_at > GETUTCDATE()
        ORDER BY expires_at
      `);
    return result.recordset;
  }

  async getOverdue(customerId: number): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .query(`
        SELECT * FROM ComplianceTraining
        WHERE customer_id = @custId
          AND ((status = 'assigned' AND created_at < DATEADD(DAY, -30, GETUTCDATE()))
               OR (status = 'completed' AND expires_at < GETUTCDATE()))
        ORDER BY expires_at
      `);
    return result.recordset;
  }
}
