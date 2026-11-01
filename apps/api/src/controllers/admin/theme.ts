/**
 * AdminThemeController - GET/PUT /api/admin/theme
 *
 * Stores the application chart-color palette in a single AppConfig row.
 *
 * DDL (run once):
 * -----------------------------------------------------
 *   CREATE TABLE AppConfig (
 *     [key]      NVARCHAR(100) NOT NULL CONSTRAINT PK_AppConfig PRIMARY KEY,
 *     value      NVARCHAR(MAX) NOT NULL,
 *     updated_at DATETIME2     NOT NULL DEFAULT GETUTCDATE()
 *   );
 * -----------------------------------------------------
 */
import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

const CONFIG_KEY = 'chart_theme';

export const DEFAULT_THEME: AppChartTheme = {
  chart_color_1: '#18a69b',
  chart_color_2: '#3c3c3c',
  chart_color_3: '#4f43bc',
  chart_color_4: '#a63918',
  chart_color_5: '#bb79d3',
  ui_accent: '#2563eb',
  app_bg:    '#f6f7fb',
  nav_bg:    '#ffffff',
};

export interface AppChartTheme {
  chart_color_1: string;
  chart_color_2: string;
  chart_color_3: string;
  chart_color_4: string;
  chart_color_5: string;
  ui_accent: string;
  app_bg: string;
  nav_bg: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const HEX_KEYS: (keyof AppChartTheme)[] = [
  'chart_color_1', 'chart_color_2', 'chart_color_3', 'chart_color_4', 'chart_color_5',
  'ui_accent', 'app_bg', 'nav_bg',
];

function sanitize(body: Record<string, unknown>): AppChartTheme {
  const out: Record<string, string> = {};
  for (const k of HEX_KEYS) {
    const v = body[k];
    out[k] = typeof v === 'string' && HEX_RE.test(v) ? v : DEFAULT_THEME[k];
  }
  return out as unknown as AppChartTheme;
}

const PRESETS_KEY = 'chart_theme_presets';

interface SavedPreset {
  name: string;
  theme: AppChartTheme;
}

async function readPresets(pool: sql.ConnectionPool): Promise<SavedPreset[]> {
  const result = await pool.request()
    .input('key', sql.NVarChar(100), PRESETS_KEY)
    .query(`SELECT value FROM AppConfig WHERE [key] = @key`);
  if (!result.recordset[0]?.value) return [];
  try { return JSON.parse(result.recordset[0].value) as SavedPreset[]; }
  catch { return []; }
}

async function writePresets(pool: sql.ConnectionPool, presets: SavedPreset[]): Promise<void> {
  await pool.request()
    .input('key',   sql.NVarChar(100),    PRESETS_KEY)
    .input('value', sql.NVarChar(sql.MAX), JSON.stringify(presets))
    .query(`
      MERGE AppConfig AS target
      USING (SELECT @key AS [key], @value AS value) AS source
        ON target.[key] = source.[key]
      WHEN MATCHED THEN
        UPDATE SET value = source.value, updated_at = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT ([key], value) VALUES (source.[key], source.value);
    `);
}

export class AdminThemeController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /** GET /api/admin/theme - returns current palette (defaults on any error) */
  public getTheme = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const result = await this.pool
        .request()
        .input('key', sql.NVarChar(100), CONFIG_KEY)
        .query(`SELECT value FROM AppConfig WHERE [key] = @key`);

      if (result.recordset[0]?.value) {
        const parsed = JSON.parse(result.recordset[0].value);
        return res.status(200).json({ ...DEFAULT_THEME, ...parsed });
      }
      return res.status(200).json(DEFAULT_THEME);
    } catch (error: unknown) {
      logger.warn('[AdminTheme] getTheme \u2013 DB unavailable, returning defaults');
      return res.status(200).json(DEFAULT_THEME);
    }
  };

  /** PUT /api/admin/theme - saves palette; responds with the saved values */
  public saveTheme = async (req: Request, res: Response): Promise<Response> => {
    const clean = sanitize(req.body ?? {});
    try {
      await this.pool
        .request()
        .input('key',   sql.NVarChar(100),    CONFIG_KEY)
        .input('value', sql.NVarChar(sql.MAX), JSON.stringify(clean))
        .query(`
          MERGE AppConfig AS target
          USING (SELECT @key AS [key], @value AS value) AS source
            ON target.[key] = source.[key]
          WHEN MATCHED THEN
            UPDATE SET value = source.value, updated_at = GETUTCDATE()
          WHEN NOT MATCHED THEN
            INSERT ([key], value) VALUES (source.[key], source.value);
        `);
      logger.info('[AdminTheme] saveTheme \u2013 palette saved');
      return res.status(200).json(clean);
    } catch (error: unknown) {
      logger.error('[AdminTheme] saveTheme \u2013 error', { error });
      return res.status(500).json({
        message: 'Failed to save theme',
      });
    }
  };

  /** GET /api/admin/theme/presets - returns all user-saved named presets */
  public getPresets = async (_req: Request, res: Response): Promise<Response> => {
    try {
      return res.status(200).json(await readPresets(this.pool));
    } catch (error) {
      return res.status(200).json([]);
    }
  };

  /** POST /api/admin/theme/presets - add/overwrite a named preset */
  public savePreset = async (req: Request, res: Response): Promise<Response> => {
    const { name, theme } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'name is required.' });
    }
    const clean = sanitize(theme ?? {});
    try {
      const presets = await readPresets(this.pool);
      const idx = presets.findIndex(p => p.name === name);
      if (idx >= 0) presets[idx].theme = clean;
      else presets.push({ name: name.trim().slice(0, 80), theme: clean });
      await writePresets(this.pool, presets);
      return res.status(200).json(presets);
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/admin/theme/presets/:name - remove a named preset */
  public deletePreset = async (req: Request, res: Response): Promise<Response> => {
    const name = decodeURIComponent(req.params['name'] ?? '');
    try {
      const presets = await readPresets(this.pool);
      const filtered = presets.filter(p => p.name !== name);
      await writePresets(this.pool, filtered);
      return res.status(200).json(filtered);
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
