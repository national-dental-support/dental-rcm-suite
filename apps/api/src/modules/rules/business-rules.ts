/**
 * Business rules engine - validates dental operations before execution.
 *
 * Rules: CDT code validation, duplicate claim detection, appointment conflict
 * detection, fee schedule enforcement, insurance annual max tracking.
 */

import { ConnectionPool } from 'mssql';
import sql from 'mssql';
import logger from '../../utils/logger';

export interface RuleViolation {
  ruleType: string;
  severity: 'block' | 'warning' | 'info';
  message: string;
  entityType: string;
  entityId: string;
}

// Valid ADA CDT code prefixes (D0xxx through D9xxx)
const VALID_CDT_PREFIXES = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];

export class BusinessRulesEngine {
  constructor(private pool: ConnectionPool) {}

  /**
   * Validate a claim before submission.
   */
  async validateClaim(
    customerId: number, claimId: string, patientId: number,
    dateOfService: string, procCodes: string[], chargeAmt: number
  ): Promise<RuleViolation[]> {
    const violations: RuleViolation[] = [];

    // 1. CDT code validation
    for (const code of procCodes) {
      if (!this.isValidCdtCode(code)) {
        violations.push({
          ruleType: 'cdt_validation', severity: 'block', entityType: 'claim', entityId: claimId,
          message: `Invalid CDT code: ${code}. Must be D0000-D9999 format.`,
        });
      }
    }

    // 2. Duplicate claim detection
    const dupes = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('patId', sql.NVarChar, String(patientId))
      .input('date', sql.Date, dateOfService)
      .input('claimId', sql.NVarChar, claimId)
      .query(`
        SELECT ClaimID FROM claims
        WHERE customer_id = @custId AND PatientID = @patId
          AND DateOfService = @date AND ClaimID != @claimId
          AND ClaimStatus NOT IN ('Rejected','Void')
      `);
    if (dupes.recordset.length) {
      violations.push({
        ruleType: 'duplicate_claim', severity: 'warning', entityType: 'claim', entityId: claimId,
        message: `Possible duplicate claim. Patient already has claim(s) on ${dateOfService}: ${dupes.recordset.map((d: any) => d.ClaimID).join(', ')}`,
      });
    }

    // 3. Fee schedule variance
    for (const code of procCodes) {
      const fee = await this.pool.request()
        .input('code', sql.NVarChar, code)
        .query(`SELECT TOP 1 Amount FROM Fee WHERE ProcCode = @code ORDER BY FeeSchedNum`);
      if (fee.recordset.length) {
        const scheduleFee = fee.recordset[0].Amount;
        const perProcFee = chargeAmt / Math.max(procCodes.length, 1);
        const variance = Math.abs(perProcFee - scheduleFee) / Math.max(scheduleFee, 1);
        if (variance > 0.10) {
          violations.push({
            ruleType: 'fee_variance', severity: 'warning', entityType: 'claim', entityId: claimId,
            message: `Fee for ${code} ($${perProcFee.toFixed(2)}) differs from fee schedule ($${scheduleFee.toFixed(2)}) by ${(variance * 100).toFixed(0)}%`,
          });
        }
      }
    }

    // 4. Annual max check
    const insUsed = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('patId', sql.NVarChar, String(patientId))
      .query(`
        SELECT SUM(InsPayAmt) AS total_used
        FROM claims
        WHERE customer_id = @custId AND PatientID = @patId
          AND YEAR(DateOfService) = YEAR(GETUTCDATE())
          AND ClaimStatus IN ('Paid','Received')
      `);
    const used = insUsed.recordset[0]?.total_used ?? 0;
    if (used > 1500) { // common annual max threshold
      violations.push({
        ruleType: 'annual_max', severity: 'warning', entityType: 'claim', entityId: claimId,
        message: `Patient has used $${used.toFixed(2)} of insurance this year. May be approaching annual maximum.`,
      });
    }

    // Store violations
    for (const v of violations) {
      await this.pool.request()
        .input('custId', sql.Int, customerId)
        .input('type', sql.NVarChar, v.ruleType)
        .input('eType', sql.NVarChar, v.entityType)
        .input('eId', sql.NVarChar, v.entityId)
        .input('severity', sql.NVarChar, v.severity)
        .input('msg', sql.NVarChar, v.message)
        .query(`INSERT INTO RuleViolation (customer_id, rule_type, entity_type, entity_id, severity, message) VALUES (@custId, @type, @eType, @eId, @severity, @msg)`);
    }

    return violations;
  }

  /**
   * Check for appointment conflicts before booking.
   */
  async checkAppointmentConflict(
    customerId: number, providerId: number, dateTime: string, durationMin: number = 30, excludeAptId?: number
  ): Promise<RuleViolation[]> {
    const violations: RuleViolation[] = [];
    const endTime = new Date(new Date(dateTime).getTime() + durationMin * 60000).toISOString();

    const conflicts = await this.pool.request()
      .input('provId', sql.Int, providerId)
      .input('start', sql.DateTime2, dateTime)
      .input('end', sql.DateTime2, endTime)
      .input('excludeId', sql.Int, excludeAptId ?? 0)
      .query(`
        SELECT AptNum, AptDateTime, PatNum FROM Appointment
        WHERE ProvNum = @provId AND AptStatus = 0 AND AptNum != @excludeId
          AND AptDateTime < @end
          AND COALESCE(AptDateEnd, DATEADD(MINUTE, 30, AptDateTime)) > @start
      `);

    for (const c of conflicts.recordset) {
      violations.push({
        ruleType: 'appointment_conflict', severity: 'block', entityType: 'appointment', entityId: String(c.AptNum),
        message: `Provider already has appointment #${c.AptNum} at ${new Date(c.AptDateTime).toLocaleTimeString()}`,
      });
    }

    return violations;
  }

  private isValidCdtCode(code: string): boolean {
    if (!code || code.length < 4 || code.length > 5) return false;
    return VALID_CDT_PREFIXES.some(prefix => code.toUpperCase().startsWith(prefix));
  }
}
