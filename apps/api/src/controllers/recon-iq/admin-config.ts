import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';

const DEFAULTS = {
  autoMatchEnabled:        false,
  autoMatchThreshold:      85.0,
  autoPostEnabled:         false,
  statementMinBalance:     5.00,
  statementDefaultAgingDays: 90,
  eraAutoImportEnabled:    false,
  eraMatchTolerance:       1.00,
  unmatchedEscalationDays: 30,
  autoEscalateEnabled:     false,
  defaultNotifyEmail:      '',
  statementFrequency:      'monthly',
  storageType:             'local',
  storageConnectionString: '',
  storagePath:             '',
  storageRetentionDays:    365,
};

export class AdminConfigController extends DatabaseConnectionController {
  constructor() { super(); }

  getConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      if (xenCustId == null) { res.json({ ...DEFAULTS }); return; }

      const result = await this.pool.request()
        .input('CustId', sql.Int, xenCustId)
        .query(`SELECT * FROM dbo.ReconIqConfig WHERE customer_id = @CustId`);

      if (!result.recordset.length) { res.json({ ...DEFAULTS }); return; }
      const row = result.recordset[0];
      res.json({
        autoMatchEnabled:          !!row.auto_match_enabled,
        autoMatchThreshold:        parseFloat(row.auto_match_threshold),
        autoPostEnabled:           !!row.auto_post_enabled,
        statementMinBalance:       parseFloat(row.statement_min_balance),
        statementDefaultAgingDays: row.statement_default_aging_days,
        eraAutoImportEnabled:      row.era_auto_import_enabled != null ? !!row.era_auto_import_enabled : DEFAULTS.eraAutoImportEnabled,
        eraMatchTolerance:         row.era_match_tolerance     != null ? parseFloat(row.era_match_tolerance) : DEFAULTS.eraMatchTolerance,
        unmatchedEscalationDays:   row.unmatched_escalation_days != null ? row.unmatched_escalation_days : DEFAULTS.unmatchedEscalationDays,
        autoEscalateEnabled:       row.auto_escalate_enabled   != null ? !!row.auto_escalate_enabled : DEFAULTS.autoEscalateEnabled,
        defaultNotifyEmail:        row.default_notify_email    ?? '',
        statementFrequency:        row.statement_frequency     ?? 'monthly',
        storageType:               row.storage_type             ?? 'local',
        storageConnectionString:   row.storage_connection_string ?? '',
        storagePath:               row.storage_path              ?? '',
        storageRetentionDays:      row.storage_retention_days    ?? 365,
      });
    } catch (err: any) {
      logger.error('[AdminConfig] getConfig error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  updateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const {
        autoMatchEnabled        = false,
        autoMatchThreshold      = 85.0,
        autoPostEnabled         = false,
        statementMinBalance     = 5.00,
        statementDefaultAgingDays = 90,
        eraAutoImportEnabled    = false,
        eraMatchTolerance       = 1.00,
        unmatchedEscalationDays = 30,
        autoEscalateEnabled     = false,
        defaultNotifyEmail      = '',
        statementFrequency      = 'monthly',
        storageType              = 'local',
        storageConnectionString  = '',
        storagePath              = '',
        storageRetentionDays     = 365,
      } = req.body as {
        autoMatchEnabled?: boolean; autoMatchThreshold?: number; autoPostEnabled?: boolean;
        statementMinBalance?: number; statementDefaultAgingDays?: number;
        eraAutoImportEnabled?: boolean; eraMatchTolerance?: number;
        unmatchedEscalationDays?: number; autoEscalateEnabled?: boolean;
        defaultNotifyEmail?: string; statementFrequency?: string;
        storageType?: string; storageConnectionString?: string;
        storagePath?: string; storageRetentionDays?: number;
      };

      const r = this.pool.request();
      r.input('CustId',        sql.Int,           xenCustId ?? 0);
      r.input('AMe',           sql.Bit,           autoMatchEnabled ? 1 : 0);
      r.input('AMT',           sql.Decimal(5, 2), autoMatchThreshold);
      r.input('APe',           sql.Bit,           autoPostEnabled ? 1 : 0);
      r.input('MinBal',        sql.Decimal(10, 2), statementMinBalance);
      r.input('AgingDays',     sql.Int,           statementDefaultAgingDays);
      r.input('EraAuto',       sql.Bit,           eraAutoImportEnabled ? 1 : 0);
      r.input('EraTol',        sql.Decimal(8, 2), eraMatchTolerance);
      r.input('EscDays',       sql.Int,           unmatchedEscalationDays);
      r.input('AutoEsc',       sql.Bit,           autoEscalateEnabled ? 1 : 0);
      r.input('NotifyEmail',   sql.NVarChar(500), defaultNotifyEmail || null);
      r.input('StmtFreq',      sql.NVarChar(20),  statementFrequency);
      r.input('StoreType',     sql.NVarChar(20),  storageType);
      r.input('StoreConn',     sql.NVarChar(1000), storageConnectionString || null);
      r.input('StorePath',     sql.NVarChar(500),  storagePath || null);
      r.input('StoreRetention', sql.Int,           storageRetentionDays);

      await r.query(`
        MERGE dbo.ReconIqConfig AS target
        USING (SELECT @CustId AS customer_id) AS src ON target.customer_id = src.customer_id
        WHEN MATCHED THEN UPDATE SET
          auto_match_enabled         = @AMe,
          auto_match_threshold       = @AMT,
          auto_post_enabled          = @APe,
          statement_min_balance      = @MinBal,
          statement_default_aging_days = @AgingDays,
          era_auto_import_enabled    = @EraAuto,
          era_match_tolerance        = @EraTol,
          unmatched_escalation_days  = @EscDays,
          auto_escalate_enabled      = @AutoEsc,
          default_notify_email       = @NotifyEmail,
          statement_frequency        = @StmtFreq,
          storage_type               = @StoreType,
          storage_connection_string  = @StoreConn,
          storage_path               = @StorePath,
          storage_retention_days     = @StoreRetention,
          updated_at                 = GETDATE()
        WHEN NOT MATCHED THEN INSERT
          (customer_id,
           auto_match_enabled, auto_match_threshold, auto_post_enabled,
           statement_min_balance, statement_default_aging_days,
           era_auto_import_enabled, era_match_tolerance, unmatched_escalation_days,
           auto_escalate_enabled, default_notify_email, statement_frequency,
           storage_type, storage_connection_string, storage_path, storage_retention_days)
        VALUES
          (@CustId,
           @AMe, @AMT, @APe, @MinBal, @AgingDays,
           @EraAuto, @EraTol, @EscDays, @AutoEsc, @NotifyEmail, @StmtFreq,
           @StoreType, @StoreConn, @StorePath, @StoreRetention);
      `);

      res.json({ message: 'Config updated' });
    } catch (err: any) {
      logger.error('[AdminConfig] updateConfig error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
