import { Request, Response } from 'express';
import Database from '../../modules/db';
import sql from 'mssql';
import { extractCustomerId } from '../../utils/resolve-user-scope';

/**
 * Org Hierarchy controller - MSO / Region / Department CRUD.
 */

/** GET /denial-iq/org-hierarchy */
export async function getOrgHierarchy(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const xenCustId = extractCustomerId(req);
  const hierReq = pool.request();
  if (xenCustId != null) hierReq.input('_custId', sql.Int, xenCustId);
  const result = await hierReq.query(`SELECT * FROM dbo.vw_org_hierarchy ${xenCustId != null ? 'WHERE customer_id = @_custId' : ''}`);
  res.json({ data: result.recordset });
}

// -- MSO ------------------------------------------------------------------------

/** GET /denial-iq/org-hierarchy/mso */
export async function listMso(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const xenCustId = extractCustomerId(req);
  const msoReq = pool.request();
  if (xenCustId != null) msoReq.input('_custId', sql.Int, xenCustId);
  const result = await msoReq.query(`SELECT * FROM dbo.mso WHERE is_active = 1 ${xenCustId != null ? 'AND customer_id = @_custId' : ''} ORDER BY mso_name`);
  res.json({ data: result.recordset });
}

/** POST /denial-iq/org-hierarchy/mso */
export async function createMso(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const { mso_name } = req.body;
  const scopeFilter = (req as any).scopeFilter;

  const result = await pool.request()
    .input('name', sql.NVarChar(255), mso_name)
    .input('customerId', sql.SmallInt, scopeFilter?.customerId)
    .query(`INSERT INTO dbo.mso (mso_name, customer_id) OUTPUT INSERTED.* VALUES (@name, @customerId)`);
  res.status(201).json({ data: result.recordset[0] });
}

// -- Region ---------------------------------------------------------------------

/** GET /denial-iq/org-hierarchy/regions?msoId= */
export async function listRegions(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const xenCustId = extractCustomerId(req);
  const msoId = req.query.msoId ? parseInt(req.query.msoId as string) : null;

  let where = 'WHERE is_active = 1';
  const request = pool.request();
  if (msoId) { where += ' AND parent_mso_id = @msoId'; request.input('msoId', sql.Int, msoId); }
  if (xenCustId != null) { where += ' AND customer_id = @_custId'; request.input('_custId', sql.Int, xenCustId); }

  const result = await request.query(`SELECT * FROM dbo.region ${where} ORDER BY region_name`);
  res.json({ data: result.recordset });
}

/** POST /denial-iq/org-hierarchy/regions */
export async function createRegion(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const { region_name, parent_mso_id } = req.body;
  const scopeFilter = (req as any).scopeFilter;

  const result = await pool.request()
    .input('name', sql.NVarChar(255), region_name)
    .input('msoId', sql.Int, parent_mso_id || null)
    .input('customerId', sql.SmallInt, scopeFilter?.customerId)
    .query(`INSERT INTO dbo.region (region_name, parent_mso_id, customer_id) OUTPUT INSERTED.* VALUES (@name, @msoId, @customerId)`);
  res.status(201).json({ data: result.recordset[0] });
}

// -- Department -----------------------------------------------------------------

/** GET /denial-iq/org-hierarchy/departments?locationId= */
export async function listDepartments(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const xenCustId = extractCustomerId(req);
  const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : null;

  let where = 'WHERE is_active = 1';
  const request = pool.request();
  if (locationId) { where += ' AND parent_location_id = @locId'; request.input('locId', sql.Int, locationId); }
  if (xenCustId != null) { where += ' AND customer_id = @_custId'; request.input('_custId', sql.Int, xenCustId); }

  const result = await request.query(`SELECT * FROM dbo.department ${where} ORDER BY department_name`);
  res.json({ data: result.recordset });
}

/** POST /denial-iq/org-hierarchy/departments */
export async function createDepartment(req: Request, res: Response) {
  const pool = Database.getInstance().getPool();
  const { department_name, parent_location_id } = req.body;
  const scopeFilter = (req as any).scopeFilter;

  const result = await pool.request()
    .input('name', sql.NVarChar(255), department_name)
    .input('locId', sql.Int, parent_location_id || null)
    .input('customerId', sql.SmallInt, scopeFilter?.customerId)
    .query(`INSERT INTO dbo.department (department_name, parent_location_id, customer_id) OUTPUT INSERTED.* VALUES (@name, @locId, @customerId)`);
  res.status(201).json({ data: result.recordset[0] });
}
