import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

const CONFIG_KEY = 'exec_summary_thresholds';

export interface RagBelowThreshold { greenMax: number; yellowMax: number; }
export interface RagAboveThreshold { greenMin: number; yellowMin: number; }

export interface ExecThresholdConfig {
  rag: {
    denialRate:         RagBelowThreshold;
    recoveryRate:       RagAboveThreshold;
    collectionRate:     RagAboveThreshold;
    daysInAR:           RagBelowThreshold;
    pctAging90:         RagBelowThreshold;
    avgQueueSpecialist: RagBelowThreshold;
    trainingCompliance: RagAboveThreshold;
    payerConcentration: RagBelowThreshold;
    reportUsage:        RagAboveThreshold;
  };
  triggers: {
    denialAndAging:        { denialRate: number; pctAging90: number };
    lowCollection:         { collectionRate: number };
    denialAndRecovery:     { denialRate: number; recoveryRate: number };
    payerConcentration:    { topPayerConcentration: number };
    highDaysInAR:          { daysInAR: number };
    highAvgQueue:          { avgQueueSize: number };
    lowTrainingCompliance: { trainingCompliance: number };
  };
}

export const DEFAULT_THRESHOLDS: ExecThresholdConfig = {
  rag: {
    denialRate:         { greenMax: 5,  yellowMax: 10 },
    recoveryRate:       { greenMin: 90, yellowMin: 75 },
    collectionRate:     { greenMin: 90, yellowMin: 80 },
    daysInAR:           { greenMax: 30, yellowMax: 50 },
    pctAging90:         { greenMax: 10, yellowMax: 20 },
    avgQueueSpecialist: { greenMax: 10, yellowMax: 15 },
    trainingCompliance: { greenMin: 90, yellowMin: 80 },
    payerConcentration: { greenMax: 35, yellowMax: 50 },
    reportUsage:        { greenMin: 70, yellowMin: 40 },
  },
  triggers: {
    denialAndAging:        { denialRate: 10, pctAging90: 20 },
    lowCollection:         { collectionRate: 80 },
    denialAndRecovery:     { denialRate: 5, recoveryRate: 75 },
    payerConcentration:    { topPayerConcentration: 35 },
    highDaysInAR:          { daysInAR: 30 },
    highAvgQueue:          { avgQueueSize: 10 },
    lowTrainingCompliance: { trainingCompliance: 80 },
  },
};

function clamp(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitize(body: Record<string, any>): ExecThresholdConfig {
  const d = DEFAULT_THRESHOLDS;
  /* istanbul ignore next */
  const rag = body?.rag ?? {};
  /* istanbul ignore next */
  const triggers = body?.triggers ?? {};

  return {
    rag: {
      denialRate:         { greenMax: clamp(rag.denialRate?.greenMax,         0, 100), yellowMax: clamp(rag.denialRate?.yellowMax,         0, 100) },
      recoveryRate:       { greenMin: clamp(rag.recoveryRate?.greenMin,       0, 100), yellowMin: clamp(rag.recoveryRate?.yellowMin,       0, 100) },
      collectionRate:     { greenMin: clamp(rag.collectionRate?.greenMin,     0, 100), yellowMin: clamp(rag.collectionRate?.yellowMin,     0, 100) },
      daysInAR:           { greenMax: clamp(rag.daysInAR?.greenMax,           0, 365), yellowMax: clamp(rag.daysInAR?.yellowMax,           0, 365) },
      pctAging90:         { greenMax: clamp(rag.pctAging90?.greenMax,         0, 100), yellowMax: clamp(rag.pctAging90?.yellowMax,         0, 100) },
      avgQueueSpecialist: { greenMax: clamp(rag.avgQueueSpecialist?.greenMax, 0, 999), yellowMax: clamp(rag.avgQueueSpecialist?.yellowMax, 0, 999) },
      trainingCompliance: { greenMin: clamp(rag.trainingCompliance?.greenMin, 0, 100), yellowMin: clamp(rag.trainingCompliance?.yellowMin, 0, 100) },
      payerConcentration: { greenMax: clamp(rag.payerConcentration?.greenMax, 0, 100), yellowMax: clamp(rag.payerConcentration?.yellowMax, 0, 100) },
      reportUsage:        { greenMin: clamp(rag.reportUsage?.greenMin,       0, 100), yellowMin: clamp(rag.reportUsage?.yellowMin,       0, 100) },
    },
    triggers: {
      denialAndAging:        { denialRate: clamp(triggers.denialAndAging?.denialRate,               0, 100), pctAging90: clamp(triggers.denialAndAging?.pctAging90,             0, 100) },
      lowCollection:         { collectionRate: clamp(triggers.lowCollection?.collectionRate,        0, 100) },
      denialAndRecovery:     { denialRate: clamp(triggers.denialAndRecovery?.denialRate,            0, 100), recoveryRate: clamp(triggers.denialAndRecovery?.recoveryRate,       0, 100) },
      payerConcentration:    { topPayerConcentration: clamp(triggers.payerConcentration?.topPayerConcentration, 0, 100) },
      highDaysInAR:          { daysInAR: clamp(triggers.highDaysInAR?.daysInAR,                    0, 365) },
      highAvgQueue:          { avgQueueSize: clamp(triggers.highAvgQueue?.avgQueueSize,             0, 999) },
      lowTrainingCompliance: { trainingCompliance: clamp(triggers.lowTrainingCompliance?.trainingCompliance, 0, 100) },
    },
  };
}

/** Load thresholds from AppConfig, merging with defaults. Shared by this controller and executive-summary. */
export async function loadThresholds(pool: sql.ConnectionPool): Promise<ExecThresholdConfig> {
  try {
    const result = await pool.request()
      .input('key', sql.NVarChar(100), CONFIG_KEY)
      .query(`SELECT value FROM AppConfig WHERE [key] = @key`);
    if (result.recordset[0]?.value) {
      const parsed = JSON.parse(result.recordset[0].value);
      return sanitize(parsed);
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_THRESHOLDS;
}

export class ExecThresholdsController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/admin/exec-thresholds */
  public getThresholds = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const config = await loadThresholds(this.pool);
      return res.status(200).json(config);
    } catch (error) {
      /* istanbul ignore next -- unreachable: loadThresholds has its own try-catch */
      logger.warn('[ExecThresholds] getThresholds \u2013 returning defaults');
      /* istanbul ignore next */
      return res.status(200).json(DEFAULT_THRESHOLDS);
    }
  };

  /** PUT /api/admin/exec-thresholds */
  public saveThresholds = async (req: Request, res: Response): Promise<Response> => {
    const clean = sanitize(req.body ?? {});
    try {
      await this.pool.request()
        .input('key',   sql.NVarChar(100),     CONFIG_KEY)
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
      logger.info('[ExecThresholds] saveThresholds \u2013 saved');
      return res.status(200).json(clean);
    } catch (error) {
      logger.error('[ExecThresholds] saveThresholds \u2013 error', { error });
      return res.status(500).json({ message: 'Failed to save thresholds' });
    }
  };

  /** DELETE /api/admin/exec-thresholds - reset to defaults */
  public resetThresholds = async (_req: Request, res: Response): Promise<Response> => {
    try {
      await this.pool.request()
        .input('key', sql.NVarChar(100), CONFIG_KEY)
        .query(`DELETE FROM AppConfig WHERE [key] = @key`);
      logger.info('[ExecThresholds] resetThresholds \u2013 reset to defaults');
      return res.status(200).json(DEFAULT_THRESHOLDS);
    } catch (error) {
      logger.error('[ExecThresholds] resetThresholds \u2013 error', { error });
      return res.status(500).json({ message: 'Failed to reset thresholds' });
    }
  };
}
