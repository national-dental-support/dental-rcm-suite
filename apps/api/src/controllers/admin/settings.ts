import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

const SESSION_TIMEOUT_KEY = 'session_timeout_minutes';
const DEFAULT_TIMEOUT_MINUTES = 4320; // 3 days

const INACTIVITY_DISABLE_KEY = 'inactivity_disable_days';
const DEFAULT_INACTIVITY_DAYS = 90;

const SLA_SCHEDULES_KEY = 'sla_schedules';
const VALID_SLA_MODES = ['24_7', 'business_hours', 'custom'] as const;
const VALID_SERVICE_KEYS = ['default', 'database', 'backend', 'frontend', 'ollama', 'superset'];

// --- Seed job state (in-memory mutex + status) ------------------------------
interface SeedJobStatus {
  running: boolean;
  startedAt: string | null;
  completedAt: string | null;
  mode: string | null;
  result: unknown | null;
  error: string | null;
}

const seedJob: SeedJobStatus = {
  running: false,
  startedAt: null,
  completedAt: null,
  mode: null,
  result: null,
  error: null,
};

export class AdminSettingsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  private custId(req: Request): number {
    return (req as any).actor?.customer_id ?? 0;
  }

  private async readConfig(key: string, custId: number): Promise<string | undefined> {
    const r = await this.pool.request()
      .input('key', sql.NVarChar(100), key)
      .input('custId', sql.Int, custId)
      .query(`
        SELECT TOP 1 value FROM dbo.AppConfig
        WHERE [key] = @key AND (customer_id = @custId OR customer_id IS NULL)
        ORDER BY customer_id DESC
      `);
    return r.recordset[0]?.value;
  }

  private async writeConfig(key: string, value: string, custId: number): Promise<void> {
    await this.pool.request()
      .input('key', sql.NVarChar(100), key)
      .input('value', sql.NVarChar(sql.MAX), value)
      .input('custId', sql.Int, custId)
      .query(`
        MERGE dbo.AppConfig AS target
        USING (SELECT @key AS [key], @value AS value, @custId AS customer_id) AS source
          ON target.[key] = source.[key] AND target.customer_id = source.customer_id
        WHEN MATCHED THEN
          UPDATE SET value = source.value, updated_at = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT ([key], value, customer_id) VALUES (source.[key], source.value, source.customer_id);
      `);
  }

  /** GET /api/admin/settings/session-timeout - returns timeout in minutes */
  public getSessionTimeout = async (req: Request, res: Response): Promise<Response> => {
    try {
      const raw = await this.readConfig(SESSION_TIMEOUT_KEY, this.custId(req));
      const minutes = raw ? parseInt(raw, 10) : DEFAULT_TIMEOUT_MINUTES;
      return res.json({ minutes: isNaN(minutes) ? DEFAULT_TIMEOUT_MINUTES : minutes });
    } catch (error: unknown) {
      logger.warn('[AdminSettings] getSessionTimeout \u2013 DB error, returning default');
      return res.json({ minutes: DEFAULT_TIMEOUT_MINUTES });
    }
  };

  /** PUT /api/admin/settings/session-timeout - update timeout (superadmin only) */
  public setSessionTimeout = async (req: Request, res: Response): Promise<Response> => {
    try {
      const minutes = parseInt(req.body?.minutes, 10);
      if (isNaN(minutes) || minutes < 5 || minutes > 43200) {
        return res.status(400).json({ message: 'minutes must be between 5 and 43200 (30 days)' });
      }

      await this.writeConfig(SESSION_TIMEOUT_KEY, String(minutes), this.custId(req));
      logger.info('[AdminSettings] session timeout updated', { minutes });
      return res.json({ message: 'Session timeout updated', minutes });
    } catch (error: unknown) {
      logger.error('[AdminSettings] setSessionTimeout error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/settings/inactivity-threshold - returns auto-disable days */
  public getInactivityThreshold = async (req: Request, res: Response): Promise<Response> => {
    try {
      const raw = await this.readConfig(INACTIVITY_DISABLE_KEY, this.custId(req));
      const days = raw ? parseInt(raw, 10) : DEFAULT_INACTIVITY_DAYS;
      return res.json({ days: isNaN(days) ? DEFAULT_INACTIVITY_DAYS : days });
    } catch (error: unknown) {
      logger.warn('[AdminSettings] getInactivityThreshold \u2013 DB error, returning default');
      return res.json({ days: DEFAULT_INACTIVITY_DAYS });
    }
  };

  /** PUT /api/admin/settings/inactivity-threshold - update auto-disable days (Admin+) */
  public setInactivityThreshold = async (req: Request, res: Response): Promise<Response> => {
    try {
      const days = parseInt(req.body?.days, 10);
      if (isNaN(days) || days < 30 || days > 365) {
        return res.status(400).json({ message: 'days must be between 30 and 365' });
      }

      await this.writeConfig(INACTIVITY_DISABLE_KEY, String(days), this.custId(req));
      logger.info('[AdminSettings] inactivity threshold updated', { days });
      return res.json({ message: 'Inactivity threshold updated', days });
    } catch (error: unknown) {
      logger.error('[AdminSettings] setInactivityThreshold error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };


  /** GET /api/admin/settings/sla-schedules - returns per-service SLA schedule map */
  public getSlaSchedules = async (req: Request, res: Response): Promise<Response> => {
    try {
      const raw = await this.readConfig(SLA_SCHEDULES_KEY, this.custId(req));
      if (raw) return res.json(JSON.parse(raw));
      return res.json({ default: { mode: '24_7' } });
    } catch (error: unknown) {
      logger.warn('[AdminSettings] getSlaSchedules \u2013 DB error, returning default');
      return res.json({ default: { mode: '24_7' } });
    }
  };

  /** PUT /api/admin/settings/sla-schedules - validate and save per-service SLA schedule map */
  public setSlaSchedules = async (req: Request, res: Response): Promise<Response> => {
    try {
      const schedules = req.body;
      if (!schedules || typeof schedules !== 'object') {
        return res.status(400).json({ message: 'Body must be a JSON object of SLA schedules' });
      }

      // Validate each entry
      for (const [key, entry] of Object.entries(schedules) as [string, any][]) {
        if (!VALID_SERVICE_KEYS.includes(key)) {
          return res.status(400).json({ message: `Invalid service key: ${key}. Must be one of: ${VALID_SERVICE_KEYS.join(', ')}` });
        }
        if (!entry.mode || !VALID_SLA_MODES.includes(entry.mode)) {
          return res.status(400).json({ message: `Invalid mode for ${key}: ${entry.mode}. Must be one of: ${VALID_SLA_MODES.join(', ')}` });
        }
        if (entry.mode === 'custom') {
          if (!entry.days || typeof entry.days !== 'object') {
            return res.status(400).json({ message: `Custom mode for ${key} requires a 'days' object` });
          }
          for (const [day, window] of Object.entries(entry.days) as [string, any][]) {
            if (!['0', '1', '2', '3', '4', '5', '6'].includes(day)) {
              return res.status(400).json({ message: `Invalid day key: ${day} for ${key}. Must be 0-6` });
            }
            if (window !== null) {
              if (!window.start || !window.end || !/^\d{2}:\d{2}$/.test(window.start) || !/^\d{2}:\d{2}$/.test(window.end)) {
                return res.status(400).json({ message: `Day ${day} for ${key}: start/end must be HH:MM format` });
              }
              if (window.start >= window.end) {
                return res.status(400).json({ message: `Day ${day} for ${key}: end must be after start` });
              }
            }
          }
        }
      }

      await this.writeConfig(SLA_SCHEDULES_KEY, JSON.stringify(schedules), this.custId(req));
      logger.info('[AdminSettings] SLA schedules updated');
      return res.json({ message: 'SLA schedules updated', schedules });
    } catch (error: unknown) {
      logger.error('[AdminSettings] setSlaSchedules error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
