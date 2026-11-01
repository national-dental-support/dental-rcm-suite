import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId, buildClaimsCustomerWhere } from '../../utils/resolve-user-scope';

/*
  DDL for reference. The schema is created by db/migrations - see 904_deferred_schema.sql.

  CREATE TABLE SavedReport (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    description NVARCHAR(500),
    dimensions NVARCHAR(MAX) NOT NULL,
    measures NVARCHAR(MAX) NOT NULL,
    filters NVARCHAR(MAX),
    owner_id INT NOT NULL,
    is_shared BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
  );
*/

export class ReportBuilderController extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /api/insightflow/report-builder/schema - available dimensions and measures */
  getSchema = async (_req: Request, res: Response) => {
    try {
      const dimensions = [
        { key: 'payer', label: 'Payer', table: 'claims', column: 'PayerID' },
        { key: 'provider', label: 'Provider', table: 'claims', column: 'ProviderID' },
        { key: 'carcCode', label: 'Denial Code (CARC)', table: 'claimhistory', column: 'CarcCode' },
        { key: 'claimStatus', label: 'Claim Status', table: 'claimhistory', column: 'ClaimStatus' },
        { key: 'month', label: 'Month', table: 'claims', column: 'MONTH' },
        { key: 'quarter', label: 'Quarter', table: 'claims', column: 'QUARTER' },
        { key: 'specialist', label: 'Specialist', table: 'claimhistory', column: 'AssignedTo' },
      ];
      const measures = [
        { key: 'claimCount', label: 'Claim Count', agg: 'COUNT' },
        { key: 'totalCharge', label: 'Total Charge Amount', agg: 'SUM', format: 'currency' },
        { key: 'avgCharge', label: 'Avg Charge Amount', agg: 'AVG', format: 'currency' },
        { key: 'avgDaysToResolve', label: 'Avg Days to Resolve', agg: 'AVG', format: 'number' },
        { key: 'avgMinutesPerClaim', label: 'Avg Minutes per Claim', agg: 'AVG', format: 'number' },
        { key: 'totalRevenue', label: 'Total Revenue Recovered', agg: 'SUM', format: 'currency' },
        { key: 'denialRate', label: 'Denial Rate %', agg: 'CALC', format: 'percent' },
      ];
      res.json({ dimensions, measures });
    } catch (err: any) {
      logger.error('report-builder schema error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/insightflow/report-builder/run - execute custom report query */
  runReport = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const { dimensions, measures, days } = req.body;
      const periodDays = days || 90;

      if (!dimensions?.length || !measures?.length) {
        return res.status(400).json({ error: 'At least one dimension and one measure required' });
      }

      // Build dynamic query safely using whitelisted columns
      // specialist/payer/provider resolve to human-readable names via JOINs
      const needsSpecialist = dimensions.includes('specialist');
      const needsPayer      = dimensions.includes('payer');
      const needsProvider   = dimensions.includes('provider');

      // Each dimension has separate select and group expressions.
      // Subqueries/aggregates cannot appear in GROUP BY in SQL Server,
      // so payer/provider group by the raw ID and select the resolved name via MAX().
      type DimExpr = { sel: string; grp: string };
      const dimExprMap: Record<string, DimExpr> = {
        payer:       { sel: `ISNULL(MAX(rr.InsuranceName), CAST(c.PayerID AS NVARCHAR))`,   grp: `c.PayerID` },
        provider:    { sel: `ISNULL(MAX(rr.ProviderName), CAST(c.ProviderID AS NVARCHAR))`, grp: `c.ProviderID` },
        carcCode:    { sel: `ch.CarcCode`,    grp: `ch.CarcCode` },
        claimStatus: { sel: `ch.ClaimStatus`, grp: `ch.ClaimStatus` },
        month:       { sel: `FORMAT(c.DateOfService, 'yyyy-MM')`,
                       grp: `FORMAT(c.DateOfService, 'yyyy-MM')` },
        quarter:     { sel: `CONCAT(YEAR(c.DateOfService), '-Q', DATEPART(QUARTER, c.DateOfService))`,
                       grp: `CONCAT(YEAR(c.DateOfService), '-Q', DATEPART(QUARTER, c.DateOfService))` },
        specialist:  { sel: needsSpecialist ? `ISNULL(MAX(u.FirstName + ' ' + u.LastName), CAST(ch.AssignedTo AS NVARCHAR))` : `CAST(ch.AssignedTo AS NVARCHAR)`,
                       grp: `ch.AssignedTo` },
      };

      const validDims = dimensions.filter((d: string) => dimExprMap[d]);
      if (validDims.length === 0) {
        return res.status(400).json({ error: 'No valid dimensions' });
      }

      const finalSelectDims = validDims.map((d: string) => `${dimExprMap[d].sel} AS [${d}]`);
      const finalGroupDims  = validDims.map((d: string) => dimExprMap[d].grp);

      const measureMap: Record<string, string> = {
        claimCount:         `COUNT(DISTINCT c.ClaimID)`,
        totalCharge:        `SUM(c.ChargeAmt)`,
        avgCharge:          `AVG(c.ChargeAmt)`,
        avgDaysToResolve:   `AVG(CAST(DATEDIFF(DAY, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS FLOAT))`,
        avgMinutesPerClaim: `AVG(CAST(DATEDIFF(MINUTE, ch.ClaimWorkStartedTime, ch.ClaimWorkEndedTime) AS FLOAT))`,
        totalRevenue:       `SUM(CASE WHEN ch.ClaimStatus IN ('Accepted','Completed') THEN c.ChargeAmt ELSE 0 END)`,
        denialRate:         `CAST(COUNT(DISTINCT CASE WHEN ch.CarcCode IS NOT NULL AND ch.CarcCode <> '' THEN c.ClaimID END) AS FLOAT) / NULLIF(COUNT(DISTINCT c.ClaimID), 0) * 100`,
      };

      const selectMeasures = measures
        .filter((m: string) => measureMap[m])
        .map((m: string) => `${measureMap[m]} AS [${m}]`);

      if (selectMeasures.length === 0) {
        return res.status(400).json({ error: 'No valid measures' });
      }

      // Join recon_report once (pre-aggregated per ClaimID) for payer/provider name lookup
      const rrJoin = (needsPayer || needsProvider)
        ? `LEFT JOIN (SELECT ClaimID, MAX(InsuranceName) AS InsuranceName, MAX(ProviderName) AS ProviderName FROM dbo.recon_report WHERE TrxType='Charge' GROUP BY ClaimID) rr ON rr.ClaimID = c.ClaimID`
        : '';
      const userJoin = needsSpecialist
        ? `LEFT JOIN dbo.Users u ON u.userID = ch.AssignedTo`
        : '';

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custC = buildClaimsCustomerWhere(xenCustId, 'c');

      const query = `
        SELECT TOP 500
          ${finalSelectDims.join(', ')},
          ${selectMeasures.join(', ')}
        FROM dbo.claims c
        LEFT JOIN dbo.claimhistory ch ON ch.ClaimID = c.ClaimID
        ${rrJoin}
        ${userJoin}
        WHERE c.DateOfService >= DATEADD(DAY, -${parseInt(periodDays)}, GETDATE())
          ${custC.where}
        GROUP BY ${finalGroupDims.join(', ')}
        ORDER BY 1 ASC
      `;

      const rbReq = pool.request();
      custC.addInputs(rbReq);
      const result = await rbReq.query(query);
      res.json({
        rows: result.recordset,
        rowCount: result.recordset.length,
        dimensions,
        measures,
      });
    } catch (err: any) {
      logger.error('report-builder run error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/insightflow/report-builder/saved - list saved reports */
  listSaved = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const userEmail = (req as any).actor?.email || '';
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? 'AND r.customer_id = @_custId' : '';

      const lsReq = pool.request()
        .input('Email', sql.NVarChar, userEmail);
      if (xenCustId != null) lsReq.input('_custId', sql.Int, xenCustId);

      const result = await lsReq.query(`
          SELECT r.id, r.name, r.description, r.dimensions, r.measures, r.filters,
                 r.is_shared AS isShared, r.created_at AS createdAt, r.updated_at AS updatedAt,
                 u.FirstName + ' ' + u.LastName AS ownerName
          FROM dbo.SavedReport r
          JOIN dbo.Users u ON u.userID = r.owner_id
          WHERE (r.owner_id = (SELECT TOP 1 userID FROM dbo.Users WHERE Email = @Email)
             OR r.is_shared = 1)
            ${custFilter}
          ORDER BY r.updated_at DESC
        `);

      res.json(result.recordset);
    } catch (err: any) {
      logger.error('report-builder saved list error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** POST /api/insightflow/report-builder/saved - save a report */
  saveReport = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const { name, description, dimensions, measures, filters, isShared } = req.body;
      const userEmail = (req as any).actor?.email || '';
      const xenCustId = extractCustomerId(req);

      const svReq = pool.request()
        .input('Name', sql.NVarChar, name)
        .input('Desc', sql.NVarChar, description || '')
        .input('Dims', sql.NVarChar, JSON.stringify(dimensions))
        .input('Measures', sql.NVarChar, JSON.stringify(measures))
        .input('Filters', sql.NVarChar, filters ? JSON.stringify(filters) : null)
        .input('Shared', sql.Bit, isShared ? 1 : 0)
        .input('Email', sql.NVarChar, userEmail)
        .input('_custId', sql.Int, xenCustId ?? null);

      const result = await svReq.query(`
          DECLARE @OwnerId INT = (SELECT TOP 1 userID FROM dbo.Users WHERE Email = @Email);
          INSERT INTO dbo.SavedReport (name, description, dimensions, measures, filters, owner_id, is_shared, customer_id)
          VALUES (@Name, @Desc, @Dims, @Measures, @Filters, @OwnerId, @Shared, @_custId);
          SELECT SCOPE_IDENTITY() AS id;
        `);

      res.json({ id: result.recordset[0].id });
    } catch (err: any) {
      logger.error('report-builder save error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** DELETE /api/insightflow/report-builder/saved/:id */
  deleteSaved = async (req: Request, res: Response) => {
    try {
      const pool = (this as any).pool as sql.ConnectionPool;
      const id = parseInt(req.params.id);
      const xenCustId = extractCustomerId(req);
      const custFilter = xenCustId != null ? 'AND customer_id = @_custId' : '';

      const delReq = pool.request().input('Id', sql.Int, id);
      if (xenCustId != null) delReq.input('_custId', sql.Int, xenCustId);

      await delReq.query(`
        DELETE FROM dbo.SavedReport WHERE id = @Id ${custFilter}
      `);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('report-builder delete error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
