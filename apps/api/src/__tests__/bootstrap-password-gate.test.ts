import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * The bootstrap account must be able to reach exactly one route - the one that
 * changes its password - and nothing else.
 *
 * This shipped broken, and neither the build nor 2,600 other tests noticed,
 * because both halves of the fault were about routing rather than logic:
 *
 *   1. The allowlist held '/api/auth/change-password' but was compared against
 *      req.path, which inside app.use('/api', ...) is '/auth/change-password'.
 *      So no entry ever matched and the route was blocked like any other.
 *   2. The auth router is mounted in front of the token gate, so that /login is
 *      reachable without a token. That also meant the change-password handler
 *      never received the x-actor-email the gate sets, and answered 401.
 *
 * Together those made a first install impossible to complete: log in, get 403
 * everywhere, and 401 from the one endpoint that would clear it.
 *
 * These tests exercise the middleware through a real express app at both mount
 * depths, because the depth is the thing that broke.
 */

const SECRET = 'test-only-secret';

describe('bootstrap password gate', () => {
  let verifyToken: express.RequestHandler;

  beforeAll(() => {
    process.env['JWT_SECRET'] = SECRET;
    delete process.env['OIDC_ISSUER'];
    delete process.env['OIDC_JWKS_URL'];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    verifyToken = require('../middleware/jwt').default;
  });

  const tokenFor = (mustChangePassword: boolean) =>
    jwt.sign({ email: 'admin@localhost', mustChangePassword }, SECRET, { expiresIn: '1h' });

  /** An app shaped like the real one: gate at /api, auth router mounted under it. */
  function appWithGateAtApi() {
    const app = express();
    app.use('/api', verifyToken);
    app.post('/api/auth/change-password', (req, res) =>
      res.status(200).json({ actor: req.headers['x-actor-email'] }),
    );
    app.post('/api/auth/logout', (_req, res) => res.status(204).send());
    app.get('/api/denial-iq/anything', (_req, res) => res.status(200).json({ ok: true }));
    return app;
  }

  /** The same routes, but with the middleware applied per-route on a router. */
  function appWithRouteLevelGate() {
    const app = express();
    const router = express.Router();
    router.post('/change-password', verifyToken, (req, res) =>
      res.status(200).json({ actor: req.headers['x-actor-email'] }),
    );
    app.use('/api/auth', router);
    return app;
  }

  it('lets a must-change account reach change-password when the gate is at /api', async () => {
    const res = await request(appWithGateAtApi())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokenFor(true)}`);

    expect(res.status).toBe(200);
    // And the handler is told who is calling, which is what it reads.
    expect(res.body.actor).toBe('admin@localhost');
  });

  it('lets a must-change account reach change-password when mounted on a router', async () => {
    const res = await request(appWithRouteLevelGate())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokenFor(true)}`);

    expect(res.status).toBe(200);
    expect(res.body.actor).toBe('admin@localhost');
  });

  it('lets a must-change account log out', async () => {
    const res = await request(appWithGateAtApi())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokenFor(true)}`);

    expect(res.status).toBe(204);
  });

  it('blocks a must-change account everywhere else', async () => {
    const res = await request(appWithGateAtApi())
      .get('/api/denial-iq/anything')
      .set('Authorization', `Bearer ${tokenFor(true)}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
  });

  it('allows everything once the password has been changed', async () => {
    const res = await request(appWithGateAtApi())
      .get('/api/denial-iq/anything')
      .set('Authorization', `Bearer ${tokenFor(false)}`);

    expect(res.status).toBe(200);
  });

  it('refuses a caller-supplied identity header', async () => {
    // The gate deletes inbound actor headers before setting its own, so a
    // caller cannot assert who it is.
    const res = await request(appWithGateAtApi())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokenFor(true)}`)
      .set('x-actor-email', 'someone-else@localhost');

    expect(res.status).toBe(200);
    expect(res.body.actor).toBe('admin@localhost');
  });

  it('refuses a request with no token', async () => {
    const res = await request(appWithGateAtApi()).get('/api/denial-iq/anything');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_MISSING_TOKEN');
  });
});
