/**
 * Data retention policy management and automated purging.
 *
 * Enforces state-specific and HIPAA record retention requirements.
 * Supports: patient records (7-10 years), financial (7 years),
 * imaging (varies by state), communications (3 years), audit logs (6 years).
 */

import { ConnectionPool } from 'mssql';
import sql from 'mssql';
import logger from '../../utils/logger';

export const DEFAULT_RETENTION_POLICIES = [
  { entityType: 'patient_record', retentionYears: 10, regulation: 'hipaa' },
  { entityType: 'financial', retentionYears: 7, regulation: 'hipaa' },
  { entityType: 'imaging', retentionYears: 7, regulation: 'hipaa' },
  { entityType: 'communication', retentionYears: 3, regulation: 'hipaa' },
  { entityType: 'audit_log', retentionYears: 6, regulation: 'hipaa' },
];

export class DataRetentionService {
  constructor(private pool: ConnectionPool) {}

  async getPolicies(customerId: number): Promise<any[]> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .query(`SELECT * FROM DataRetentionPolicy WHERE customer_id = @custId AND is_active = 1 ORDER BY entity_type`);

    if (!result.recordset.length) {
      await this.seedDefaults(customerId);
      return this.getPolicies(customerId);
    }
    return result.recordset;
  }

  async updatePolicy(policyId: number, retentionYears: number, autoPurge: boolean): Promise<void> {
    await this.pool.request()
      .input('id', sql.Int, policyId)
      .input('years', sql.Int, retentionYears)
      .input('purge', sql.Bit, autoPurge ? 1 : 0)
      .query(`UPDATE DataRetentionPolicy SET retention_years = @years, auto_purge = @purge WHERE id = @id`);
  }

  /**
   * Identify records eligible for purging based on retention policies.
   * Does NOT delete - returns counts for review.
   */
  async getEligibleForPurge(customerId: number): Promise<Record<string, number>> {
    const policies = await this.getPolicies(customerId);
    const counts: Record<string, number> = {};

    for (const policy of policies) {
      if (!policy.auto_purge) continue;
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - policy.retention_years);

      let countQuery = '';
      switch (policy.entity_type) {
        case 'communication':
          countQuery = `SELECT COUNT(*) AS cnt FROM CommunicationHistory WHERE customer_id = @custId AND created_at < @cutoff`;
          break;
        case 'audit_log':
          countQuery = `SELECT COUNT(*) AS cnt FROM AdminAuditLog WHERE customer_id = @custId AND timestamp < @cutoff`;
          break;
        default:
          continue;
      }

      const result = await this.pool.request()
        .input('custId', sql.Int, customerId)
        .input('cutoff', sql.DateTime2, cutoffDate)
        .query(countQuery);
      counts[policy.entity_type] = result.recordset[0]?.cnt ?? 0;
    }

    return counts;
  }

  /**
   * Execute purge for auto-purge-enabled policies.
   * Only purges non-PHI records (communications, audit logs).
   * Patient records and financials require manual review.
   */
  async executePurge(customerId: number): Promise<Record<string, number>> {
    const policies = await this.getPolicies(customerId);
    const purged: Record<string, number> = {};

    for (const policy of policies) {
      if (!policy.auto_purge) continue;
      if (['patient_record', 'financial', 'imaging'].includes(policy.entity_type)) {
        logger.warn(`Skipping auto-purge for ${policy.entity_type} \u2014 requires manual review`);
        continue;
      }

      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - policy.retention_years);

      let deleteQuery = '';
      switch (policy.entity_type) {
        case 'communication':
          deleteQuery = `DELETE FROM CommunicationHistory WHERE customer_id = @custId AND created_at < @cutoff`;
          break;
        case 'audit_log':
          deleteQuery = `DELETE FROM AdminAuditLog WHERE customer_id = @custId AND timestamp < @cutoff`;
          break;
        default:
          continue;
      }

      const result = await this.pool.request()
        .input('custId', sql.Int, customerId)
        .input('cutoff', sql.DateTime2, cutoffDate)
        .query(deleteQuery);

      purged[policy.entity_type] = result.rowsAffected[0] ?? 0;

      // Update last purge timestamp
      await this.pool.request()
        .input('id', sql.Int, policy.id)
        .query(`UPDATE DataRetentionPolicy SET last_purge_at = GETUTCDATE() WHERE id = @id`);
    }

    logger.info(`Data retention purge for customer ${customerId}:`, purged);
    return purged;
  }

  private async seedDefaults(customerId: number): Promise<void> {
    for (const p of DEFAULT_RETENTION_POLICIES) {
      await this.pool.request()
        .input('custId', sql.Int, customerId)
        .input('type', sql.NVarChar, p.entityType)
        .input('years', sql.Int, p.retentionYears)
        .input('reg', sql.NVarChar, p.regulation)
        .query(`
          INSERT INTO DataRetentionPolicy (customer_id, entity_type, retention_years, regulation)
          VALUES (@custId, @type, @years, @reg)
        `);
    }
  }
}
