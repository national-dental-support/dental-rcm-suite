import { Request, Response, Router } from 'express';
import { requireRole } from '../../middleware/require-role';
import { writeAuditLog } from '../../utils/audit-log';
import sql from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';

const databaseInstance = Database.getInstance();
const pool = databaseInstance.getPool();
const router = Router();

// Get all users that belong to the actor's customer (Admin only)
router.get('/all', requireRole('Admin'), async (req, res) => {
  const customer_id = (req as any).actor?.customer_id;

  if (!customer_id) {
    return res.status(403).send({ message: 'Unable to determine your tenant.' });
  }

  try {
    if (pool) {
      const result = await pool
        .request()
        .input('customer_id', sql.Int, customer_id)
        .query('SELECT * FROM dbo.Users WHERE customer_id = @customer_id');

      res.status(200).send({ message: 'Fetched users successfully', data: result.recordset });
    } else {
      res.status(500).send({ message: 'Database connection not established' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Internal Server Error' });
  }
});

router.get('/get-by-email', async (req: Request, res: Response) => {
  try {
    const email = req.query.email as string;
    const actorCustId = (req as any).actor?.customer_id;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (!actorCustId) {
      return res.status(403).json({ message: "Unable to determine your tenant." });
    }

    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .input('actorCustId', sql.Int, actorCustId)
      .query(`
        SELECT TOP 1
          userID,
          FirstName,
          LastName,
          Designation,
          Location,
          Operations,
          Role,
          Organization,
          Email,
          disabled,
          archived
        FROM dbo.Users
        WHERE Email = @email
          AND customer_id = @actorCustId`);

    if (!result.recordset.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.recordset[0];

    return res.status(200).json({
      uid: user.userID,
      firstName: user.FirstName,
      lastName: user.LastName,
      designation: user.Designation,
      location: user.Location,
      operations: user.Operations,
      role: user.Role,
      organization: user.Organization,
      email: user.Email
    });

  } catch (err) {
    console.error("GET /users/get-by-email error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/users/login-failed
 * Increments failed_login_count and locks account after 5 failures (30 min lockout).
 * Called by the web app when authentication succeeds but the user is not authorized.
 */
router.post('/login-failed', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query(`
        UPDATE dbo.Users
        SET failed_login_count = ISNULL(failed_login_count, 0) + 1,
            locked_until = CASE
              WHEN ISNULL(failed_login_count, 0) + 1 >= 5 THEN DATEADD(MINUTE, 30, GETUTCDATE())
              ELSE locked_until
            END
        OUTPUT INSERTED.failed_login_count, INSERTED.locked_until
        WHERE LOWER(Email) = LOWER(@email)
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updated = result.recordset[0];

    const isLocked = !!updated.locked_until && new Date() < new Date(updated.locked_until);
    const action = isLocked ? 'auth.lockout' : 'auth.login_failed';

    writeAuditLog(pool, {
      actor_id: email,
      actor_role: 'unknown',
      action,
      target_id: email,
      after_state: { failed_login_count: updated.failed_login_count, locked_until: updated.locked_until },
      ip_address: req.ip,
      cause: isLocked ? `Account locked after ${updated.failed_login_count} consecutive failures` : 'Authentication failure',
      outcome: 'failure',
    });

    return res.json({
      failedCount: updated.failed_login_count,
      locked: isLocked,
    });
  } catch (err: any) {
    console.error('POST /users/login-failed error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/users/login-success
 * Updates last_login_at and resets failed_login_count on successful auth.
 * Called by the web app after authentication completes.
 */
router.post('/login-success', async (req: Request, res: Response) => {
  try {
    const { email, oid } = req.body;
    if (!email && !oid) return res.status(400).json({ message: 'Email or OID is required' });

    const request = pool.request();

    if (email) request.input('email', sql.NVarChar, email);
    if (oid) request.input('oid', sql.NVarChar(36), oid);

    // Match by email (canonical identity). Never use OR with azure_oid - that
    // can update multiple rows and mis-link the OID to the wrong account.
    let whereClause = '';
    if (email) {
      whereClause = 'WHERE LOWER(Email) = LOWER(@email)';
    } else {
      whereClause = 'WHERE azure_oid = @oid';
    }

    const result = await request.query(`
      UPDATE dbo.Users
      SET last_login_at = GETUTCDATE(),
          failed_login_count = 0,
          locked_until = NULL
          ${oid ? ', azure_oid = COALESCE(azure_oid, @oid)' : ''}
      ${whereClause}
    `);

    if (!result.rowsAffected[0]) {
      return res.status(404).json({ message: 'User not found' });
    }

    writeAuditLog(pool, {
      actor_id: email || oid || 'unknown',
      actor_role: 'user',
      action: 'auth.login',
      target_id: email || oid || 'unknown',
      ip_address: req.ip,
      cause: 'authentication completed',
      outcome: 'success',
    });

    return res.json({ message: 'Login recorded' });
  } catch (err: any) {
    console.error('POST /users/login-success error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/create', requireRole('Admin'), async (req, res) => {
  const { email, first_name, last_name, customer_id, role_id } = req.body;
  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

  if (!email) {
    console.error(
      chalk.white.bgRed(
        'Users Route; Unabled to get the email needed to create a new user.',
      ),
    );

    return res.status(400).send({
      message:
        'Users Route; Unabled to get the email needed to create a new user.',
    });
  }

  if (!first_name) {
    console.error(
      chalk.white.bgRed(
        'Users Route; Unabled to get the first_name needed to create a new user.',
      ),
    );

    return res.status(400).send({
      message:
        'Users Route; Unabled to get the first_name needed to create a new user.',
    });
  }

  if (!last_name) {
    console.error(
      chalk.white.bgRed(
        'Users Route; Unabled to get the last_name needed to create a new user.',
      ),
    );

    return res.status(400).send({
      message:
        'Users Route; Unabled to get the last_name needed to create a new user.',
    });
  }

  if (!customer_id) {
    console.error(
      chalk.white.bgRed(
        'Users Route; Unabled to get the customer_id needed to create a new user.',
      ),
    );

    return res.status(400).send({
      message:
        'Users Route; Unabled to get the customer_id needed to create a new user.',
    });
  }

  try {
    if (pool) {
      console.log('Users route; Connected to pool');

      const lowercasedEmail = email.toLowerCase();

      const checkDuplicateQuery =
        'SELECT COUNT(*) AS count FROM Users WHERE LOWER(email) = @lowercasedEmail';

      const checkDuplicateRequest = new sql.Request(pool);

      checkDuplicateRequest.input(
        'lowercasedEmail',
        sql.NVarChar,
        lowercasedEmail,
      );

      const { recordset } =
        await checkDuplicateRequest.query(checkDuplicateQuery);

      // If there is a user, return the function. Client will proced with logging the user into the application
      if (recordset[0].count > 0) {
        res
          .status(409)
          .send({ message: 'A record for this user already exists.' });

        return;
      }

      const insertQuery =
        'INSERT INTO Users (email, first_name, last_name, customer_id, role_id) VALUES (@email, @first_name, @last_name, @customer_id, @role_id)';

      const insertRequest = new sql.Request(pool);

      insertRequest.input('email', sql.NVarChar, email);

      insertRequest.input('first_name', sql.NVarChar, first_name);

      insertRequest.input('last_name', sql.NVarChar, last_name);

      insertRequest.input('customer_id', sql.NVarChar, customer_id);

      insertRequest.input('role_id', sql.NVarChar, role_id);

      await insertRequest.query(insertQuery);

      writeAuditLog(pool, {
        actor_id: actor.email,
        actor_role: actor.role,
        action: 'user.create',
        target_id: email,
        before_state: null,
        after_state: { email, first_name, last_name, customer_id, role_id },
        ip_address: req.ip,
        session_id: req.headers['x-session-id'] as string ?? undefined,
      });

      res.status(200).send({
        message: 'User created successfully.',
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

router.patch(
  '/disable',
  requireRole('Admin'),
  async (req: Request, res: Response) => {
    const { email, disabled } = req.body;
    const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

    if (!email || disabled === undefined) {
      console.error(
        chalk.white.bgRed(
          'Users Route; Unable to get the email or disabled status needed to update the user.',
        ),
      );

      return res.status(400).send({
        message:
          'Users Route; Unable to get the email or archived status needed to update the user.',
      });
    }

    try {
      if (pool) {
        // Update the archived status in the database
        const result = await pool
          .request()
          .input('email', sql.NVarChar, email)
          .input('disabled', sql.Bit, disabled).query(`
          UPDATE Users
          SET disabled = @disabled
          WHERE email = @email
        `);

        // Check if any rows were affected
        if (result.rowsAffected[0] > 0) {
          writeAuditLog(pool, {
            actor_id: actor.email,
            actor_role: actor.role,
            action: 'user.disable',
            target_id: email,
            before_state: { disabled: !disabled },
            after_state: { disabled },
            ip_address: req.ip,
            session_id: req.headers['x-session-id'] as string ?? undefined,
          });
          res.status(200).send({
            message: 'User updated successfully.',
          });
        } else {
          res.status(404).send({
            message: 'User not found.',
          });
        }
      }
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: 'Internal server error' });
    }
  },
);

router.patch('/delete', requireRole('Admin'), async (req: Request, res: Response) => {
  const { email, archived } = req.body;
  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

  if (!email || archived === undefined) {
    console.error(
      chalk.white.bgRed(
        'Users Route; Unable to get the email or archived status needed to update the user.',
      ),
    );

    return res.status(400).send({
      message:
        'Users Route; Unable to get the email or archived status needed to update the user.',
    });
  }

  try {
    if (pool) {
      // Update the archived status in the database
      const result = await pool
        .request()
        .input('email', sql.NVarChar, email)
        .input('archived', sql.Bit, archived).query(`
          UPDATE Users
          SET archived = @archived
          WHERE email = @email
        `);

      // Check if any rows were affected
      if (result.rowsAffected[0] > 0) {
        writeAuditLog(pool, {
          actor_id: actor.email,
          actor_role: actor.role,
          action: 'user.delete',
          target_id: email,
          before_state: { archived: !archived },
          after_state: { archived },
          ip_address: req.ip,
          session_id: req.headers['x-session-id'] as string ?? undefined,
        });
        res.status(200).send({
          message: 'User updated successfully.',
        });
      } else {
        res.status(404).send({
          message: 'User not found.',
        });
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * PATCH /api/users/terminate
 * Sets disabled=1, archived=1 and writes a termination audit log entry.
 * Requires Admin role. Accepts optional `termination_reason` in the body.
 */
router.patch('/terminate', requireRole('Admin'), async (req: Request, res: Response) => {
  const { email, termination_reason } = req.body;
  const actor = (req as any).actor ?? { email: 'unknown', role: 'unknown' };

  if (!email) {
    return res.status(400).send({ message: 'Users Route; email is required to terminate a user.' });
  }

  try {
    if (pool) {
      // Capture before state
      const beforeResult = await pool.request()
        .input('email', sql.NVarChar, email)
        .query(`SELECT TOP 1 Email, disabled, archived, Role FROM Users WHERE LOWER(Email) = LOWER(@email)`);

      if (!beforeResult.recordset.length) {
        return res.status(404).send({ message: 'User not found.' });
      }

      const beforeState = beforeResult.recordset[0];

      const result = await pool.request()
        .input('email', sql.NVarChar, email)
        .query(`
          UPDATE Users
          SET disabled = 1, archived = 1
          WHERE LOWER(Email) = LOWER(@email)
        `);

      if (result.rowsAffected[0] > 0) {
        writeAuditLog(pool, {
          actor_id: actor.email,
          actor_role: actor.role,
          action: 'user.terminate',
          target_id: email,
          before_state: beforeState,
          after_state: { disabled: 1, archived: 1, termination_reason: termination_reason ?? null },
          ip_address: req.ip,
          session_id: req.headers['x-session-id'] as string ?? undefined,
        });

        return res.status(204).send();
      } else {
        return res.status(404).send({ message: 'User not found.' });
      }
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: 'Internal server error' });
  }
});

export default router;
