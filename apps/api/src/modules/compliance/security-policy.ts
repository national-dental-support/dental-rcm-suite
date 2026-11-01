/**
 * Password policy enforcement and session security.
 */

import * as crypto from 'crypto';
import { ConnectionPool } from 'mssql';
import sql from 'mssql';

export interface SecurityPolicyConfig {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  passwordExpiryDays: number;
  maxFailedAttempts: number;
  lockoutDurationMin: number;
  sessionTimeoutMin: number;
  requireMfa: boolean;
  mfaMethod?: string;
}

export class SecurityPolicyService {
  constructor(private pool: ConnectionPool) {}

  async getPolicy(customerId: number): Promise<SecurityPolicyConfig> {
    const result = await this.pool.request()
      .input('custId', sql.Int, customerId)
      .query(`SELECT * FROM SecurityPolicy WHERE customer_id = @custId`);

    if (result.recordset.length) {
      const p = result.recordset[0];
      return {
        minPasswordLength: p.min_password_length ?? 12,
        requireUppercase: !!p.require_uppercase,
        requireLowercase: !!p.require_lowercase,
        requireNumber: !!p.require_number,
        requireSpecial: !!p.require_special,
        passwordExpiryDays: p.password_expiry_days ?? 90,
        maxFailedAttempts: p.max_failed_attempts ?? 5,
        lockoutDurationMin: p.lockout_duration_min ?? 30,
        sessionTimeoutMin: p.session_timeout_min ?? 30,
        requireMfa: !!p.require_mfa,
        mfaMethod: p.mfa_method,
      };
    }

    // Return defaults
    return {
      minPasswordLength: 12, requireUppercase: true, requireLowercase: true,
      requireNumber: true, requireSpecial: true, passwordExpiryDays: 90,
      maxFailedAttempts: 5, lockoutDurationMin: 30, sessionTimeoutMin: 30,
      requireMfa: false,
    };
  }

  validatePassword(password: string, policy: SecurityPolicyConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (password.length < policy.minPasswordLength) errors.push(`Password must be at least ${policy.minPasswordLength} characters`);
    if (policy.requireUppercase && !/[A-Z]/.test(password)) errors.push('Must contain uppercase letter');
    if (policy.requireLowercase && !/[a-z]/.test(password)) errors.push('Must contain lowercase letter');
    if (policy.requireNumber && !/\d/.test(password)) errors.push('Must contain a number');
    if (policy.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('Must contain a special character');
    return { valid: errors.length === 0, errors };
  }

  async savePolicy(customerId: number, config: Partial<SecurityPolicyConfig>): Promise<void> {
    await this.pool.request()
      .input('custId', sql.Int, customerId)
      .input('minLen', sql.Int, config.minPasswordLength ?? 12)
      .input('upper', sql.Bit, config.requireUppercase ? 1 : 0)
      .input('lower', sql.Bit, config.requireLowercase ? 1 : 0)
      .input('num', sql.Bit, config.requireNumber ? 1 : 0)
      .input('special', sql.Bit, config.requireSpecial ? 1 : 0)
      .input('expiry', sql.Int, config.passwordExpiryDays ?? 90)
      .input('maxFail', sql.Int, config.maxFailedAttempts ?? 5)
      .input('lockout', sql.Int, config.lockoutDurationMin ?? 30)
      .input('session', sql.Int, config.sessionTimeoutMin ?? 30)
      .input('mfa', sql.Bit, config.requireMfa ? 1 : 0)
      .input('mfaMethod', sql.NVarChar, config.mfaMethod ?? null)
      .query(`
        MERGE SecurityPolicy AS tgt
        USING (SELECT @custId AS customer_id) AS src ON tgt.customer_id = src.customer_id
        WHEN MATCHED THEN UPDATE SET
          min_password_length = @minLen, require_uppercase = @upper, require_lowercase = @lower,
          require_number = @num, require_special = @special, password_expiry_days = @expiry,
          max_failed_attempts = @maxFail, lockout_duration_min = @lockout, session_timeout_min = @session,
          require_mfa = @mfa, mfa_method = @mfaMethod
        WHEN NOT MATCHED THEN INSERT
          (customer_id, min_password_length, require_uppercase, require_lowercase, require_number,
           require_special, password_expiry_days, max_failed_attempts, lockout_duration_min,
           session_timeout_min, require_mfa, mfa_method)
        VALUES (@custId, @minLen, @upper, @lower, @num, @special, @expiry, @maxFail, @lockout, @session, @mfa, @mfaMethod);
      `);
  }
}
