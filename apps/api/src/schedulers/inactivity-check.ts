import cron from 'node-cron';
import sql from 'mssql';
import logger from '../utils/logger';
import Database from '../modules/db';
import { runAsSystem } from '../modules/rls-context';
import { writeAuditLog } from '../utils/audit-log';

const DEFAULT_INACTIVITY_DAYS = 90;
const CONFIG_KEY = 'inactivity_disable_days';

/**
 * Inactivity Auto-Disable Job
 *
 * HIPAA Sec.164.312(a)(2)(iii) - automatic termination of inactive accounts
 * SOC2 CC6.2 - periodic access review with automated enforcement
 *
 * Schedule: daily at 2:00 AM UTC
 *
 * Disables users who have not logged in within the configurable threshold.
 * Super Admins are never auto-disabled (prevents lockout).
 * Users who have never logged in (last_login_at IS NULL) are treated as
 * inactive if their account is older than the threshold.
 */
export function startInactivityCheck(): void {
  // G7: background job legitimately operates cross-tenant under RLS
  cron.schedule('0 2 * * *', () => runAsSystem(async () => {
    logger.info('[InactivityCheck] Starting daily inactivity check...');
    try {
      const pool = Database.getInstance().getPool();
      if (!pool) {
        logger.error('[InactivityCheck] No DB pool \u2014 skipping.');
        return;
      }

      // Read configurable threshold from AppConfig
      const configResult = await pool.request()
        .input('key', sql.NVarChar(100), CONFIG_KEY)
        .query(`SELECT value FROM dbo.AppConfig WHERE [key] = @key`);

      const days = configResult.recordset[0]?.value
        ? parseInt(configResult.recordset[0].value, 10)
        : DEFAULT_INACTIVITY_DAYS;

      if (isNaN(days) || days < 1) {
        logger.warn(`[InactivityCheck] Invalid threshold (${days}) \u2014 skipping.`);
        return;
      }

      // Find active, non-archived users who haven't logged in within threshold
      // Exclude Super Admins (never auto-disable)
      const inactive = await pool.request()
        .input('days', sql.Int, days)
        .query(`
          SELECT userID, FirstName, LastName, Email, Role, last_login_at, customer_id
          FROM dbo.Users
          WHERE ISNULL(disabled, 0) = 0
            AND ISNULL(archived, 0) = 0
            AND Role != 'Super Admin'
            AND (
              last_login_at < DATEADD(DAY, -@days, GETUTCDATE())
              OR last_login_at IS NULL
            )
        `);

      if (inactive.recordset.length === 0) {
        logger.info(`[InactivityCheck] No inactive users found (threshold: ${days} days).`);
        return;
      }

      logger.info(`[InactivityCheck] Found ${inactive.recordset.length} inactive user(s) (threshold: ${days} days). Disabling...`);

      for (const user of inactive.recordset) {
        try {
          await pool.request()
            .input('id', sql.Int, user.userID)
            .query(`UPDATE dbo.Users SET disabled = 1 WHERE userID = @id`);

          writeAuditLog(pool, {
            actor_id:    'system',
            actor_role:  'system',
            action:      'user.auto_disable',
            target_id:   user.Email,
            before_state: {
              disabled: 0,
              last_login_at: user.last_login_at,
              role: user.Role,
            },
            after_state: {
              disabled: 1,
              reason: `Inactive for ${days}+ days (last login: ${user.last_login_at ?? 'never'})`,
            },
          });

          logger.info(`[InactivityCheck] Disabled user ${user.Email} (last login: ${user.last_login_at ?? 'never'})`);
        } catch (err) {
          logger.error(`[InactivityCheck] Failed to disable user ${user.Email}: ${err}`);
        }
      }

      logger.info(`[InactivityCheck] Inactivity check complete. Disabled ${inactive.recordset.length} user(s).`);
    } catch (err) {
      logger.error(`[InactivityCheck] Job failed: ${err}`);
    }
  }));

  logger.info('[InactivityCheck] Inactivity auto-disable scheduled (daily at 2:00 AM UTC).');
}
