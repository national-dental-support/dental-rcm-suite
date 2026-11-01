import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/*
  DDL for reference. The schema is created by db/migrations - see 904_deferred_schema.sql.

  CREATE TABLE DataMaskingRule (
    id INT IDENTITY(1,1) PRIMARY KEY,
    field_name NVARCHAR(100) NOT NULL,
    display_label NVARCHAR(200) NOT NULL,
    category NVARCHAR(50) NOT NULL,            -- 'phi' | 'pii' | 'financial'
    mask_type NVARCHAR(50) NOT NULL,           -- 'full' | 'last4' | 'date' | 'partial'
    visible_above_role INT DEFAULT 3,          -- role level at/above which field is fully visible
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE()
  );

  -- Seed default rules
  INSERT INTO DataMaskingRule (field_name, display_label, category, mask_type, visible_above_role) VALUES
    ('SSN', 'Social Security Number', 'phi', 'last4', 3),
    ('DOB', 'Date of Birth', 'phi', 'date', 1),
    ('DateOfBirth', 'Date of Birth', 'phi', 'date', 1),
    ('SubscriberID', 'Subscriber ID', 'phi', 'last4', 1),
    ('subscriber_id', 'Subscriber ID', 'phi', 'last4', 1);

  CREATE TABLE EncryptionConfig (
    id INT IDENTITY(1,1) PRIMARY KEY,
    config_key NVARCHAR(100) NOT NULL UNIQUE,
    config_value NVARCHAR(MAX),
    updated_at DATETIME2 DEFAULT GETDATE()
  );

  INSERT INTO EncryptionConfig (config_key, config_value) VALUES
    ('tde_enabled', 'false'),
    ('field_encryption_enabled', 'false'),
    ('encrypted_fields', '["SSN","DOB","SubscriberID"]');
*/

export class SecurityController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/admin/security/masking-rules - list data masking rules */
  getMaskingRules = async (_req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const result = await pool.request().query(`
        SELECT id, field_name AS fieldName, display_label AS displayLabel,
               category, mask_type AS maskType,
               visible_above_role AS visibleAboveRole,
               is_active AS isActive
        FROM dbo.DataMaskingRule
        ORDER BY category, field_name
      `);
      res.json(result.recordset);
    } catch (err: any) {
      logger.error('security masking-rules error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/admin/security/masking-rules - create masking rule */
  createMaskingRule = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const { fieldName, displayLabel, category, maskType, visibleAboveRole } = req.body;

      const result = await pool.request()
        .input('FieldName', sql.NVarChar(100), fieldName)
        .input('Label', sql.NVarChar(200), displayLabel)
        .input('Category', sql.NVarChar(50), category)
        .input('MaskType', sql.NVarChar(50), maskType)
        .input('RoleLevel', sql.Int, visibleAboveRole ?? 3)
        .query(`
          INSERT INTO dbo.DataMaskingRule
            (field_name, display_label, category, mask_type, visible_above_role)
          VALUES (@FieldName, @Label, @Category, @MaskType, @RoleLevel);
          SELECT SCOPE_IDENTITY() AS id;
        `);

      res.json({ id: result.recordset[0].id });
    } catch (err: any) {
      logger.error('security create-rule error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/admin/security/masking-rules/:id - update masking rule */
  updateMaskingRule = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      const { fieldName, displayLabel, category, maskType, visibleAboveRole, isActive } = req.body;

      await pool.request()
        .input('Id', sql.Int, id)
        .input('FieldName', sql.NVarChar(100), fieldName)
        .input('Label', sql.NVarChar(200), displayLabel)
        .input('Category', sql.NVarChar(50), category)
        .input('MaskType', sql.NVarChar(50), maskType)
        .input('RoleLevel', sql.Int, visibleAboveRole ?? 3)
        .input('Active', sql.Bit, isActive ? 1 : 0)
        .query(`
          UPDATE dbo.DataMaskingRule
          SET field_name = @FieldName, display_label = @Label,
              category = @Category, mask_type = @MaskType,
              visible_above_role = @RoleLevel, is_active = @Active
          WHERE id = @Id
        `);

      res.json({ success: true });
    } catch (err: any) {
      logger.error('security update-rule error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/admin/security/masking-rules/:id */
  deleteMaskingRule = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      await pool.request().input('Id', sql.Int, id)
        .query(`DELETE FROM dbo.DataMaskingRule WHERE id = @Id`);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('security delete-rule error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/security/encryption - encryption configuration */
  getEncryptionConfig = async (_req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const result = await pool.request().query(`
        SELECT config_key AS [key], config_value AS [value]
        FROM dbo.EncryptionConfig
      `);
      const config: Record<string, string> = {};
      for (const row of result.recordset) {
        config[row.key] = row.value;
      }
      res.json(config);
    } catch (err: any) {
      logger.error('security encryption-config error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/admin/security/encryption - update encryption config */
  updateEncryptionConfig = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const updates = req.body as Record<string, string>;

      for (const [key, value] of Object.entries(updates)) {
        await pool.request()
          .input('Key', sql.NVarChar(100), key)
          .input('Value', sql.NVarChar(sql.MAX), typeof value === 'string' ? value : JSON.stringify(value))
          .query(`
            MERGE dbo.EncryptionConfig AS target
            USING (SELECT @Key AS config_key) AS source
            ON target.config_key = source.config_key
            WHEN MATCHED THEN UPDATE SET config_value = @Value, updated_at = GETDATE()
            WHEN NOT MATCHED THEN INSERT (config_key, config_value) VALUES (@Key, @Value);
          `);
      }

      res.json({ success: true });
    } catch (err: any) {
      logger.error('security update-encryption error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/security/status - overall security status summary */
  getSecurityStatus = async (_req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;

      const [encResult, maskResult] = await Promise.all([
        pool.request().query(`SELECT config_key, config_value FROM dbo.EncryptionConfig`),
        pool.request().query(`SELECT COUNT(*) AS cnt FROM dbo.DataMaskingRule WHERE is_active = 1`),
      ]);

      const encConfig: Record<string, string> = {};
      for (const row of encResult.recordset) {
        encConfig[row.config_key] = row.config_value;
      }

      res.json({
        encryption: {
          tdeEnabled: encConfig.tde_enabled === 'true',
          fieldEncryptionEnabled: encConfig.field_encryption_enabled === 'true',
          encryptedFields: JSON.parse(encConfig.encrypted_fields || '[]'),
        },
        masking: {
          activeMaskingRules: maskResult.recordset[0].cnt,
        },
        fieldEncryptionKeyConfigured: !!process.env.FIELD_ENCRYPTION_KEY,
      });
    } catch (err: any) {
      logger.error('security status error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
