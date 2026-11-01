import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/*
  DDL for reference. The schema is created by db/migrations - see 904_deferred_schema.sql.

  CREATE TABLE CustomerSSOConfig (
    id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id INT NOT NULL,
    provider_type NVARCHAR(20) NOT NULL,           -- 'saml' | 'oidc' | 'azure-ad'
    display_name NVARCHAR(200) NOT NULL,
    domain NVARCHAR(200) NOT NULL,                 -- e.g. 'acmedental.com' - for email domain matching
    client_id NVARCHAR(500),                       -- OIDC client_id or SAML entity_id
    client_secret_encrypted NVARCHAR(500),
    metadata_url NVARCHAR(500),                    -- SAML metadata URL or OIDC discovery URL
    issuer NVARCHAR(500),
    authorization_url NVARCHAR(500),
    token_url NVARCHAR(500),
    certificate NVARCHAR(MAX),                     -- SAML x509 cert (PEM)
    attribute_mapping NVARCHAR(MAX),               -- JSON: { email, firstName, lastName, role }
    is_active BIT DEFAULT 0,
    auto_provision_users BIT DEFAULT 0,
    default_role NVARCHAR(50) DEFAULT 'User',
    enforce_sso BIT DEFAULT 0,                     -- if true, block password login for this domain
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT UQ_CustomerSSO_Domain UNIQUE (domain)
  );
*/

export class CustomerSSOController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/admin/sso/configs - list all SSO configurations */
  listConfigs = async (_req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const result = await pool.request().query(`
        SELECT s.id, s.customer_id AS customerId, s.provider_type AS providerType,
               s.display_name AS displayName, s.domain,
               s.client_id AS clientId, s.metadata_url AS metadataUrl,
               s.issuer, s.authorization_url AS authorizationUrl,
               s.token_url AS tokenUrl, s.attribute_mapping AS attributeMapping,
               s.is_active AS isActive, s.auto_provision_users AS autoProvisionUsers,
               s.default_role AS defaultRole, s.enforce_sso AS enforceSso,
               s.created_at AS createdAt, s.updated_at AS updatedAt,
               c.name AS customerName
        FROM dbo.CustomerSSOConfig s
        LEFT JOIN dbo.Customers c ON c.id = s.customer_id
        ORDER BY s.display_name
      `);
      res.json(result.recordset);
    } catch (err: any) {
      logger.error('sso list error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/sso/configs/:id - get single SSO config */
  getConfig = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      const result = await pool.request().input('Id', sql.Int, id).query(`
        SELECT s.id, s.customer_id AS customerId, s.provider_type AS providerType,
               s.display_name AS displayName, s.domain,
               s.client_id AS clientId, s.metadata_url AS metadataUrl,
               s.issuer, s.authorization_url AS authorizationUrl,
               s.token_url AS tokenUrl, s.certificate,
               s.attribute_mapping AS attributeMapping,
               s.is_active AS isActive, s.auto_provision_users AS autoProvisionUsers,
               s.default_role AS defaultRole, s.enforce_sso AS enforceSso,
               s.created_at AS createdAt
        FROM dbo.CustomerSSOConfig s
        WHERE s.id = @Id
      `);
      if (!result.recordset[0]) return res.status(404).json({ error: 'SSO config not found' });
      res.json(result.recordset[0]);
    } catch (err: any) {
      logger.error('sso get error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/admin/sso/configs - create SSO config */
  createConfig = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const {
        customerId, providerType, displayName, domain, clientId, clientSecret,
        metadataUrl, issuer, authorizationUrl, tokenUrl, certificate,
        attributeMapping, autoProvisionUsers, defaultRole, enforceSso,
      } = req.body;

      const result = await pool.request()
        .input('CustomerId', sql.Int, customerId)
        .input('ProviderType', sql.NVarChar(20), providerType)
        .input('DisplayName', sql.NVarChar(200), displayName)
        .input('Domain', sql.NVarChar(200), domain)
        .input('ClientId', sql.NVarChar(500), clientId || null)
        .input('ClientSecret', sql.NVarChar(500), clientSecret || null)
        .input('MetadataUrl', sql.NVarChar(500), metadataUrl || null)
        .input('Issuer', sql.NVarChar(500), issuer || null)
        .input('AuthUrl', sql.NVarChar(500), authorizationUrl || null)
        .input('TokenUrl', sql.NVarChar(500), tokenUrl || null)
        .input('Cert', sql.NVarChar(sql.MAX), certificate || null)
        .input('AttrMap', sql.NVarChar(sql.MAX), attributeMapping ? JSON.stringify(attributeMapping) : null)
        .input('AutoProvision', sql.Bit, autoProvisionUsers ? 1 : 0)
        .input('DefaultRole', sql.NVarChar(50), defaultRole || 'User')
        .input('EnforceSSO', sql.Bit, enforceSso ? 1 : 0)
        .query(`
          INSERT INTO dbo.CustomerSSOConfig
            (customer_id, provider_type, display_name, domain, client_id,
             client_secret_encrypted, metadata_url, issuer, authorization_url,
             token_url, certificate, attribute_mapping, auto_provision_users,
             default_role, enforce_sso)
          VALUES (@CustomerId, @ProviderType, @DisplayName, @Domain, @ClientId,
                  @ClientSecret, @MetadataUrl, @Issuer, @AuthUrl, @TokenUrl,
                  @Cert, @AttrMap, @AutoProvision, @DefaultRole, @EnforceSSO);
          SELECT SCOPE_IDENTITY() AS id;
        `);

      res.json({ id: result.recordset[0].id });
    } catch (err: any) {
      logger.error('sso create error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** PUT /api/admin/sso/configs/:id - update SSO config */
  updateConfig = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      const {
        customerId, providerType, displayName, domain, clientId, clientSecret,
        metadataUrl, issuer, authorizationUrl, tokenUrl, certificate,
        attributeMapping, isActive, autoProvisionUsers, defaultRole, enforceSso,
      } = req.body;

      await pool.request()
        .input('Id', sql.Int, id)
        .input('CustomerId', sql.Int, customerId)
        .input('ProviderType', sql.NVarChar(20), providerType)
        .input('DisplayName', sql.NVarChar(200), displayName)
        .input('Domain', sql.NVarChar(200), domain)
        .input('ClientId', sql.NVarChar(500), clientId || null)
        .input('ClientSecret', sql.NVarChar(500), clientSecret || null)
        .input('MetadataUrl', sql.NVarChar(500), metadataUrl || null)
        .input('Issuer', sql.NVarChar(500), issuer || null)
        .input('AuthUrl', sql.NVarChar(500), authorizationUrl || null)
        .input('TokenUrl', sql.NVarChar(500), tokenUrl || null)
        .input('Cert', sql.NVarChar(sql.MAX), certificate || null)
        .input('AttrMap', sql.NVarChar(sql.MAX), attributeMapping ? JSON.stringify(attributeMapping) : null)
        .input('Active', sql.Bit, isActive ? 1 : 0)
        .input('AutoProvision', sql.Bit, autoProvisionUsers ? 1 : 0)
        .input('DefaultRole', sql.NVarChar(50), defaultRole || 'User')
        .input('EnforceSSO', sql.Bit, enforceSso ? 1 : 0)
        .query(`
          UPDATE dbo.CustomerSSOConfig
          SET customer_id = @CustomerId, provider_type = @ProviderType,
              display_name = @DisplayName, domain = @Domain,
              client_id = @ClientId, client_secret_encrypted = @ClientSecret,
              metadata_url = @MetadataUrl, issuer = @Issuer,
              authorization_url = @AuthUrl, token_url = @TokenUrl,
              certificate = @Cert, attribute_mapping = @AttrMap,
              is_active = @Active, auto_provision_users = @AutoProvision,
              default_role = @DefaultRole, enforce_sso = @EnforceSSO,
              updated_at = GETDATE()
          WHERE id = @Id
        `);

      res.json({ success: true });
    } catch (err: any) {
      logger.error('sso update error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/admin/sso/configs/:id */
  deleteConfig = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      await pool.request().input('Id', sql.Int, id)
        .query(`DELETE FROM dbo.CustomerSSOConfig WHERE id = @Id`);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('sso delete error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/admin/sso/lookup?domain=acmedental.com - check if domain has SSO */
  lookupByDomain = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const domain = req.query.domain as string;
      if (!domain) return res.status(400).json({ error: 'domain query param required' });

      const result = await pool.request()
        .input('Domain', sql.NVarChar(200), domain.toLowerCase())
        .query(`
          SELECT id, provider_type AS providerType, display_name AS displayName,
                 domain, client_id AS clientId, metadata_url AS metadataUrl,
                 authorization_url AS authorizationUrl, enforce_sso AS enforceSso
          FROM dbo.CustomerSSOConfig
          WHERE domain = @Domain AND is_active = 1
        `);

      if (!result.recordset[0]) {
        return res.json({ hasSso: false });
      }

      const config = result.recordset[0];
      res.json({
        hasSso: true,
        enforceSso: config.enforceSso,
        provider: {
          type: config.providerType,
          displayName: config.displayName,
          authorizationUrl: config.authorizationUrl,
          clientId: config.clientId,
          metadataUrl: config.metadataUrl,
        },
      });
    } catch (err: any) {
      logger.error('sso lookup error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/admin/sso/test/:id - test SSO configuration */
  testConfig = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);

      const config = await pool.request().input('Id', sql.Int, id)
        .query(`SELECT * FROM dbo.CustomerSSOConfig WHERE id = @Id`);

      if (!config.recordset[0]) {
        return res.status(404).json({ error: 'SSO config not found' });
      }

      const sso = config.recordset[0];
      const checks: { check: string; status: string; detail?: string }[] = [];

      // Validate required fields based on provider type
      if (sso.provider_type === 'saml') {
        checks.push({
          check: 'Metadata URL',
          status: sso.metadata_url ? 'pass' : 'fail',
          detail: sso.metadata_url || 'Missing SAML metadata URL',
        });
        checks.push({
          check: 'Certificate',
          status: sso.certificate ? 'pass' : 'warn',
          detail: sso.certificate ? 'Certificate configured' : 'No certificate \u2014 will use metadata',
        });
      } else {
        checks.push({
          check: 'Client ID',
          status: sso.client_id ? 'pass' : 'fail',
          detail: sso.client_id ? 'Configured' : 'Missing client ID',
        });
        checks.push({
          check: 'Authorization URL',
          status: sso.authorization_url ? 'pass' : 'fail',
          detail: sso.authorization_url || 'Missing authorization URL',
        });
        checks.push({
          check: 'Token URL',
          status: sso.token_url ? 'pass' : 'fail',
          detail: sso.token_url || 'Missing token URL',
        });
      }

      checks.push({
        check: 'Domain',
        status: sso.domain ? 'pass' : 'fail',
        detail: sso.domain || 'Missing domain',
      });

      const allPass = checks.every(c => c.status !== 'fail');

      res.json({
        success: allPass,
        providerType: sso.provider_type,
        displayName: sso.display_name,
        checks,
      });
    } catch (err: any) {
      logger.error('sso test error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
