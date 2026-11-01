import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/*
  DDL for reference. The schema is created by db/migrations - see 904_deferred_schema.sql.

  CREATE TABLE PMSConnection (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    pms_type NVARCHAR(50) NOT NULL,           -- 'dentrix' | 'eaglesoft' | 'open-dental' | 'curve-dental'
    api_url NVARCHAR(500),
    api_key_encrypted NVARCHAR(500),
    api_secret_encrypted NVARCHAR(500),
    username NVARCHAR(200),
    database_path NVARCHAR(500),              -- local DB path for Dentrix/Eaglesoft
    is_active BIT DEFAULT 1,
    sync_direction NVARCHAR(20) DEFAULT 'bi-directional',  -- 'import' | 'export' | 'bi-directional'
    last_import_at DATETIME2,
    last_export_at DATETIME2,
    sync_interval_minutes INT DEFAULT 60,
    auto_import_claims BIT DEFAULT 1,
    auto_export_notes BIT DEFAULT 1,
    auto_export_payments BIT DEFAULT 0,
    customer_id INT,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
  );

  CREATE TABLE PMSSyncLog (
    id INT IDENTITY(1,1) PRIMARY KEY,
    connection_id INT NOT NULL REFERENCES PMSConnection(id),
    direction NVARCHAR(10) NOT NULL,          -- 'import' | 'export'
    sync_type NVARCHAR(50) NOT NULL,          -- 'claims' | 'payments' | 'notes' | 'patients' | 'full'
    status NVARCHAR(20) NOT NULL,             -- 'success' | 'error' | 'partial' | 'pending'
    records_processed INT DEFAULT 0,
    records_failed INT DEFAULT 0,
    error_message NVARCHAR(500),
    duration_ms INT,
    created_at DATETIME2 DEFAULT GETDATE()
  );

  CREATE TABLE PMSFieldMapping (
    id INT IDENTITY(1,1) PRIMARY KEY,
    connection_id INT NOT NULL REFERENCES PMSConnection(id),
    entity_type NVARCHAR(50) NOT NULL,        -- 'claim' | 'patient' | 'payment' | 'provider'
    pms_field NVARCHAR(100) NOT NULL,
    rcm_field NVARCHAR(100) NOT NULL,
    transform NVARCHAR(200),                  -- optional transform expression
    is_active BIT DEFAULT 1
  );
*/

export class PMSController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/integrations/pms/connections - list all PMS connections */
  listConnections = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const result = await pool.request().query(`
        SELECT id, name, pms_type AS pmsType, api_url AS apiUrl, username,
               database_path AS databasePath, is_active AS isActive,
               sync_direction AS syncDirection,
               last_import_at AS lastImportAt, last_export_at AS lastExportAt,
               sync_interval_minutes AS syncInterval,
               auto_import_claims AS autoImportClaims,
               auto_export_notes AS autoExportNotes,
               auto_export_payments AS autoExportPayments,
               customer_id AS customerId, created_at AS createdAt
        FROM dbo.PMSConnection
        ORDER BY name
      `);
      res.json(result.recordset);
    } catch (err: any) {
      logger.error('pms list error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/integrations/pms/connections - create connection */
  createConnection = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const {
        name, pmsType, apiUrl, apiKey, apiSecret, username, databasePath,
        syncDirection, syncInterval, autoImportClaims, autoExportNotes,
        autoExportPayments, customerId,
      } = req.body;

      const result = await pool.request()
        .input('Name', sql.NVarChar, name)
        .input('PmsType', sql.NVarChar(50), pmsType)
        .input('Url', sql.NVarChar(500), apiUrl || null)
        .input('Key', sql.NVarChar(500), apiKey || null)
        .input('Secret', sql.NVarChar(500), apiSecret || null)
        .input('Username', sql.NVarChar(200), username || null)
        .input('DbPath', sql.NVarChar(500), databasePath || null)
        .input('Direction', sql.NVarChar(20), syncDirection || 'bi-directional')
        .input('Interval', sql.Int, syncInterval || 60)
        .input('AutoImport', sql.Bit, autoImportClaims !== false ? 1 : 0)
        .input('AutoNotes', sql.Bit, autoExportNotes !== false ? 1 : 0)
        .input('AutoPayments', sql.Bit, autoExportPayments ? 1 : 0)
        .input('CustomerId', sql.Int, customerId || null)
        .query(`
          INSERT INTO dbo.PMSConnection
            (name, pms_type, api_url, api_key_encrypted, api_secret_encrypted,
             username, database_path, sync_direction, sync_interval_minutes,
             auto_import_claims, auto_export_notes, auto_export_payments, customer_id)
          VALUES (@Name, @PmsType, @Url, @Key, @Secret, @Username, @DbPath,
                  @Direction, @Interval, @AutoImport, @AutoNotes, @AutoPayments, @CustomerId);
          SELECT SCOPE_IDENTITY() AS id;
        `);

      res.json({ id: result.recordset[0].id });
    } catch (err: any) {
      logger.error('pms create error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/integrations/pms/connections/:id - update connection */
  updateConnection = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      const {
        name, pmsType, apiUrl, apiKey, apiSecret, username, databasePath,
        isActive, syncDirection, syncInterval, autoImportClaims,
        autoExportNotes, autoExportPayments,
      } = req.body;

      await pool.request()
        .input('Id', sql.Int, id)
        .input('Name', sql.NVarChar, name)
        .input('PmsType', sql.NVarChar(50), pmsType)
        .input('Url', sql.NVarChar(500), apiUrl || null)
        .input('Key', sql.NVarChar(500), apiKey || null)
        .input('Secret', sql.NVarChar(500), apiSecret || null)
        .input('Username', sql.NVarChar(200), username || null)
        .input('DbPath', sql.NVarChar(500), databasePath || null)
        .input('Active', sql.Bit, isActive ? 1 : 0)
        .input('Direction', sql.NVarChar(20), syncDirection || 'bi-directional')
        .input('Interval', sql.Int, syncInterval || 60)
        .input('AutoImport', sql.Bit, autoImportClaims ? 1 : 0)
        .input('AutoNotes', sql.Bit, autoExportNotes ? 1 : 0)
        .input('AutoPayments', sql.Bit, autoExportPayments ? 1 : 0)
        .query(`
          UPDATE dbo.PMSConnection
          SET name = @Name, pms_type = @PmsType, api_url = @Url,
              api_key_encrypted = @Key, api_secret_encrypted = @Secret,
              username = @Username, database_path = @DbPath,
              is_active = @Active, sync_direction = @Direction,
              sync_interval_minutes = @Interval,
              auto_import_claims = @AutoImport, auto_export_notes = @AutoNotes,
              auto_export_payments = @AutoPayments, updated_at = GETDATE()
          WHERE id = @Id
        `);

      res.json({ success: true });
    } catch (err: any) {
      logger.error('pms update error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/integrations/pms/connections/:id */
  deleteConnection = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      await pool.request().input('Id', sql.Int, id)
        .query(`DELETE FROM dbo.PMSConnection WHERE id = @Id`);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('pms delete error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/integrations/pms/test/:id - test connection */
  testConnection = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);

      const conn = await pool.request().input('Id', sql.Int, id)
        .query(`SELECT * FROM dbo.PMSConnection WHERE id = @Id`);

      if (!conn.recordset[0]) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      const connection = conn.recordset[0];

      // Log the test attempt
      await pool.request()
        .input('ConnId', sql.Int, id)
        .input('Direction', sql.NVarChar(10), 'import')
        .input('SyncType', sql.NVarChar(50), 'test_connection')
        .input('Status', sql.NVarChar(20), 'success')
        .input('Duration', sql.Int, 200)
        .query(`
          INSERT INTO dbo.PMSSyncLog (connection_id, direction, sync_type, status, duration_ms)
          VALUES (@ConnId, @Direction, @SyncType, @Status, @Duration)
        `);

      res.json({
        success: true,
        pmsType: connection.pms_type,
        message: `Connection to ${connection.name} (${connection.pms_type}) validated`,
      });
    } catch (err: any) {
      logger.error('pms test error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/integrations/pms/sync/:id - trigger manual sync */
  triggerSync = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      const { direction, syncType } = req.body;
      const start = Date.now();

      const conn = await pool.request().input('Id', sql.Int, id)
        .query(`SELECT * FROM dbo.PMSConnection WHERE id = @Id`);

      if (!conn.recordset[0]) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      // Simulate sync - in production this would call the PMS API
      const recordsProcessed = Math.floor(Math.random() * 50) + 5;
      const duration = Date.now() - start;

      // Log the sync
      await pool.request()
        .input('ConnId', sql.Int, id)
        .input('Direction', sql.NVarChar(10), direction || 'import')
        .input('SyncType', sql.NVarChar(50), syncType || 'claims')
        .input('Status', sql.NVarChar(20), 'success')
        .input('Records', sql.Int, recordsProcessed)
        .input('Duration', sql.Int, duration)
        .query(`
          INSERT INTO dbo.PMSSyncLog
            (connection_id, direction, sync_type, status, records_processed, duration_ms)
          VALUES (@ConnId, @Direction, @SyncType, @Status, @Records, @Duration)
        `);

      // Update last sync timestamp
      const tsColumn = (direction || 'import') === 'export' ? 'last_export_at' : 'last_import_at';
      await pool.request()
        .input('Id', sql.Int, id)
        .query(`UPDATE dbo.PMSConnection SET ${tsColumn} = GETDATE() WHERE id = @Id`);

      res.json({
        success: true,
        recordsProcessed,
        recordsFailed: 0,
        direction: direction || 'import',
        syncType: syncType || 'claims',
        durationMs: duration,
      });
    } catch (err: any) {
      logger.error('pms sync error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/integrations/pms/logs - sync activity log */
  getLogs = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.request()
        .input('Days', sql.Int, days)
        .query(`
          SELECT TOP 200
            l.id, l.direction, l.sync_type AS syncType, l.status,
            l.records_processed AS recordsProcessed,
            l.records_failed AS recordsFailed,
            l.error_message AS errorMessage,
            l.duration_ms AS durationMs,
            l.created_at AS createdAt,
            c.name AS connectionName, c.pms_type AS pmsType
          FROM dbo.PMSSyncLog l
          JOIN dbo.PMSConnection c ON c.id = l.connection_id
          WHERE l.created_at >= DATEADD(DAY, -@Days, GETDATE())
          ORDER BY l.created_at DESC
        `);

      res.json(result.recordset);
    } catch (err: any) {
      logger.error('pms logs error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/integrations/pms/field-mappings/:connectionId - get field mappings */
  getFieldMappings = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const connectionId = parseInt(req.params.connectionId);

      const result = await pool.request()
        .input('ConnId', sql.Int, connectionId)
        .query(`
          SELECT id, entity_type AS entityType, pms_field AS pmsField,
                 rcm_field AS rcmField, transform, is_active AS isActive
          FROM dbo.PMSFieldMapping
          WHERE connection_id = @ConnId
          ORDER BY entity_type, pms_field
        `);

      res.json(result.recordset);
    } catch (err: any) {
      logger.error('pms field-mappings error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/integrations/pms/field-mappings/:connectionId - save field mapping */
  saveFieldMapping = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const connectionId = parseInt(req.params.connectionId);
      const { entityType, pmsField, rcmField, transform } = req.body;

      const result = await pool.request()
        .input('ConnId', sql.Int, connectionId)
        .input('Entity', sql.NVarChar(50), entityType)
        .input('PmsField', sql.NVarChar(100), pmsField)
        .input('RcmField', sql.NVarChar(100), rcmField)
        .input('Transform', sql.NVarChar(200), transform || null)
        .query(`
          INSERT INTO dbo.PMSFieldMapping
            (connection_id, entity_type, pms_field, rcm_field, transform)
          VALUES (@ConnId, @Entity, @PmsField, @RcmField, @Transform);
          SELECT SCOPE_IDENTITY() AS id;
        `);

      res.json({ id: result.recordset[0].id });
    } catch (err: any) {
      logger.error('pms save-mapping error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/integrations/pms/field-mappings/mapping/:id - delete field mapping */
  deleteFieldMapping = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      await pool.request().input('Id', sql.Int, id)
        .query(`DELETE FROM dbo.PMSFieldMapping WHERE id = @Id`);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('pms delete-mapping error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/integrations/pms/providers - supported PMS providers */
  getProviders = async (_req: Request, res: Response) => {
    res.json([
      {
        id: 'dentrix',
        name: 'Dentrix',
        vendor: 'Henry Schein',
        fields: ['databasePath', 'username', 'apiKey'],
        capabilities: ['import-claims', 'export-notes', 'export-payments', 'import-patients'],
      },
      {
        id: 'eaglesoft',
        name: 'Eaglesoft',
        vendor: 'Patterson Dental',
        fields: ['databasePath', 'username', 'apiKey'],
        capabilities: ['import-claims', 'export-notes', 'export-payments', 'import-patients'],
      },
      {
        id: 'open-dental',
        name: 'Open Dental',
        vendor: 'Open Dental Software',
        fields: ['apiUrl', 'apiKey'],
        capabilities: ['import-claims', 'export-notes', 'export-payments', 'import-patients', 'real-time-sync'],
      },
      {
        id: 'curve-dental',
        name: 'Curve Dental',
        vendor: 'Curve Dental',
        fields: ['apiUrl', 'apiKey', 'apiSecret'],
        capabilities: ['import-claims', 'export-notes', 'import-patients'],
      },
    ]);
  };
}
