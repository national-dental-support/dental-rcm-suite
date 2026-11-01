import { Router, Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';

const router = Router();
const db = Database.getInstance();

function userId(req: Request): number {
  return (req as any).actor?.userId ?? 0;
}

function custId(req: Request): number {
  return (req as any).actor?.customer_id ?? 0;
}

/** GET / - return all layouts for the user + which one is active */
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await db.getPool().request()
      .input('uid',  sql.Int, userId(req))
      .input('cid',  sql.Int, custId(req))
      .query(`
        SELECT id, name, config, is_default AS isDefault, is_active AS isActive,
               created_at AS createdAt, updated_at AS updatedAt
        FROM dbo.DashboardLayouts
        WHERE user_id = @uid AND customer_id = @cid
        ORDER BY created_at ASC
      `);

    const rows = result.recordset;
    const layouts = rows.map((r: any) => ({
      id:        r.id,
      name:      r.name,
      config:    JSON.parse(r.config),
      isDefault: !!r.isDefault,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    const activeRow = rows.find((r: any) => r.isActive);

    res.json({ layouts, activeId: activeRow?.id ?? null });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/** POST / - create a new layout */
router.post('/', async (req: Request, res: Response) => {
  const { name, config, isDefault } = req.body ?? {};
  if (!name || !config) {
    return res.status(400).json({ message: 'name and config are required' });
  }

  try {
    const pool = db.getPool();

    // If this is the default, clear existing defaults for this user
    if (isDefault) {
      await pool.request()
        .input('uid', sql.Int, userId(req))
        .input('cid', sql.Int, custId(req))
        .query(`UPDATE dbo.DashboardLayouts SET is_default = 0 WHERE user_id = @uid AND customer_id = @cid`);
    }

    const result = await pool.request()
      .input('uid',       sql.Int,           userId(req))
      .input('cid',       sql.Int,           custId(req))
      .input('name',      sql.NVarChar(100), name)
      .input('config',    sql.NVarChar(sql.MAX), JSON.stringify(config))
      .input('isDefault', sql.Bit,           isDefault ? 1 : 0)
      .query(`
        INSERT INTO dbo.DashboardLayouts (user_id, customer_id, name, config, is_default)
        OUTPUT INSERTED.id
        VALUES (@uid, @cid, @name, @config, @isDefault)
      `);

    res.status(201).json({ id: result.recordset[0].id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /active - set which layout is currently active (null clears it) */
router.put('/active', async (req: Request, res: Response) => {
  const { id } = req.body ?? {};

  try {
    const pool = db.getPool();

    // Clear active for all user layouts
    await pool.request()
      .input('uid', sql.Int, userId(req))
      .input('cid', sql.Int, custId(req))
      .query(`UPDATE dbo.DashboardLayouts SET is_active = 0 WHERE user_id = @uid AND customer_id = @cid`);

    // Set the requested one active (if id is provided)
    if (id != null) {
      await pool.request()
        .input('id',  sql.Int, id)
        .input('uid', sql.Int, userId(req))
        .input('cid', sql.Int, custId(req))
        .query(`
          UPDATE dbo.DashboardLayouts SET is_active = 1
          WHERE id = @id AND user_id = @uid AND customer_id = @cid
        `);
    }

    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /:id - update an existing layout */
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'], 10);
  const { name, config, isDefault } = req.body ?? {};

  if (!name || !config) {
    return res.status(400).json({ message: 'name and config are required' });
  }

  try {
    const pool = db.getPool();

    if (isDefault) {
      await pool.request()
        .input('uid', sql.Int, userId(req))
        .input('cid', sql.Int, custId(req))
        .query(`UPDATE dbo.DashboardLayouts SET is_default = 0 WHERE user_id = @uid AND customer_id = @cid`);
    }

    const result = await pool.request()
      .input('id',        sql.Int,               id)
      .input('uid',       sql.Int,               userId(req))
      .input('cid',       sql.Int,               custId(req))
      .input('name',      sql.NVarChar(100),      name)
      .input('config',    sql.NVarChar(sql.MAX),  JSON.stringify(config))
      .input('isDefault', sql.Bit,                isDefault ? 1 : 0)
      .query(`
        UPDATE dbo.DashboardLayouts
        SET name = @name, config = @config, is_default = @isDefault, updated_at = GETUTCDATE()
        WHERE id = @id AND user_id = @uid AND customer_id = @cid
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Layout not found' });
    }
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /:id - delete a layout */
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'], 10);

  try {
    const result = await db.getPool().request()
      .input('id',  sql.Int, id)
      .input('uid', sql.Int, userId(req))
      .input('cid', sql.Int, custId(req))
      .query(`
        DELETE FROM dbo.DashboardLayouts
        WHERE id = @id AND user_id = @uid AND customer_id = @cid
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Layout not found' });
    }
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
