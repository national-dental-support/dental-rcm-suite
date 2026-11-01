/**
 * Authorization Test Suite - Suites 1-4, 6-7
 *
 * Tests API key validation, role hierarchy, OID auth flow,
 * subscription gating, patient portal roles, and unprotected endpoints.
 *
 * Run: npm test -- --testPathPattern=authorization
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

/* ------------------------------------------------------------------ */
/*  Mock: Database module                                             */
/* ------------------------------------------------------------------ */
const mockQuery = jest.fn<any>();
const mockInput = jest.fn<any>();

jest.mock('../modules/db', () => {
  const makeRequest = () => {
    const r: any = {
      input: (...a: any[]) => { mockInput(...a); return r; },
      query: mockQuery,
    };
    return r;
  };
  return {
    __esModule: true,
    default: {
      getInstance: () => ({
        getPool: () => ({
          request: makeRequest,
        }),
      }),
    },
    databaseInstance: {
      getPool: () => ({
        request: makeRequest,
      }),
    },
  };
});

/* ------------------------------------------------------------------ */
/*  Mock: logger (suppress output during tests)                       */
/* ------------------------------------------------------------------ */
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/* ------------------------------------------------------------------ */
/*  Mock: config (provide deterministic API keys)                     */
/* ------------------------------------------------------------------ */
jest.mock('../config', () => ({
  __esModule: true,
  default: {
    apiKey: 'test-valid-api-key-12345',
    secondaryApiKey: 'test-secondary-key-67890',
  },
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks are registered)                              */
/* ------------------------------------------------------------------ */
import { requireRole } from '../middleware/require-role';
import { requireSubscription } from '../middleware/require-subscription';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): Response & { _status: number; _json: any } {
  const res: any = {
    _status: 0,
    _json: null,
    status(code: number) { res._status = code; return res; },
    json(body: any) { res._json = body; return res; },
  };
  return res;
}

function mockNext(): NextFunction & { called: boolean } {
  const fn: any = () => { fn.called = true; };
  fn.called = false;
  return fn;
}

/** Helper to build a mock DB user row */
function userRow(overrides: Record<string, any> = {}) {
  return {
    userID: 1,
    Role: 'Admin',
    disabled: false,
    archived: false,
    locked_until: null,
    customer_id: 1,
    ProviderID: null,
    azure_oid: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Suite 2: Role Hierarchy                                           */
/* ------------------------------------------------------------------ */
describe('Suite 2: Role Hierarchy', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    // requireRole now checks azure_oid column existence on every call (no cache)
    mockQuery.mockResolvedValueOnce({ recordset: [{ 1: 1 }] });
  });

  const roles = ['User', 'AR Specialist', 'Manager', 'Training Admin', 'Admin', 'Super Admin'];

  it.each([
    ['Super Admin', 'Admin', true],
    ['Admin', 'Admin', true],
    ['Manager', 'Admin', false],
    ['User', 'Admin', false],
    ['Super Admin', 'Manager', true],
    ['Manager', 'Manager', true],
    ['AR Specialist', 'Manager', false],
    ['User', 'Manager', false],
  ])('user with role "%s" accessing route requiring "%s" \u2192 allowed=%s', async (userRole, requiredRole, shouldAllow) => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: userRole })] });

    const middleware = requireRole(requiredRole);
    const req = mockReq({ 'x-actor-email': 'test@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(shouldAllow);
    if (!shouldAllow) {
      expect(res._status).toBe(403);
    }
  });

  it('rejects a disabled user even with sufficient role', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'Super Admin', disabled: true })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'disabled@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json.message).toContain('inactive');
    expect(next.called).toBe(false);
  });

  it('rejects an archived user even with sufficient role', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'Admin', archived: true })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'archived@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json.message).toContain('inactive');
    expect(next.called).toBe(false);
  });

  it('rejects a locked user with lockout info in response', async () => {
    const futureDate = new Date(Date.now() + 600_000).toISOString(); // 10 min from now
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'Admin', locked_until: futureDate })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'locked@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json.locked).toBe(true);
    expect(res._json.lockoutExpiresAt).toBe(futureDate);
    expect(next.called).toBe(false);
  });

  it('allows a user whose lockout has expired', async () => {
    const pastDate = new Date(Date.now() - 600_000).toISOString(); // 10 min ago
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'Admin', locked_until: pastDate })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'unlocked@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Suite 3: OID Auth Flow                                            */
/* ------------------------------------------------------------------ */
describe('Suite 3: OID Auth Flow', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    // requireRole now checks azure_oid column existence on every call (no cache)
    mockQuery.mockResolvedValueOnce({ recordset: [{ 1: 1 }] });
  });

  it('returns 403 when both x-actor-oid and x-actor-email are missing', async () => {
    const middleware = requireRole('User');
    const req = mockReq({});
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json.message).toContain('x-actor-email or x-actor-oid header required');
    expect(next.called).toBe(false);
  });

  it('authenticates by OID alone (no email header)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ azure_oid: 'oid-123', Role: 'Admin' })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-oid': 'oid-123' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    // Verify OID was passed as input
    expect(mockInput).toHaveBeenCalledWith('oid', expect.anything(), 'oid-123');
  });

  it('authenticates by email alone (no OID header)', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'Admin' })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'user@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    expect(mockInput).toHaveBeenCalledWith('email', expect.anything(), 'user@example.com');
  });

  it('uses OID-first matching when both headers are present', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ azure_oid: 'oid-456', Role: 'Admin' })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-oid': 'oid-456', 'x-actor-email': 'user@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    // Both OID and email should be passed as inputs
    expect(mockInput).toHaveBeenCalledWith('oid', expect.anything(), 'oid-456');
    expect(mockInput).toHaveBeenCalledWith('email', expect.anything(), 'user@example.com');
  });

  it('auto-links OID when user has no azure_oid stored', async () => {
    // First call (from beforeEach): column check
    // Second call: user lookup returns user with no azure_oid
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ azure_oid: null, Role: 'Admin' })] });
    // Third call: UPDATE for auto-link - resolved to prevent unhandled rejection
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-oid': 'new-oid-789', 'x-actor-email': 'user@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    // column check + user lookup + auto-link UPDATE = 3
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('does NOT auto-link OID when user already has azure_oid', async () => {
    // First call (from beforeEach): column check
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ azure_oid: 'existing-oid', Role: 'Admin' })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-oid': 'new-oid-789', 'x-actor-email': 'user@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    // column check + user lookup only, no UPDATE = 2
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('attaches actor info to request after successful auth', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [userRow({ Role: 'Admin', customer_id: 42, ProviderID: 'P100' })],
    });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'admin@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    const actor = (req as any).actor;
    expect(actor).toBeDefined();
    expect(actor.email).toBe('admin@example.com');
    expect(actor.role).toBe('Admin');
    expect(actor.customer_id).toBe(42);
    expect(actor.providerId).toBe('P100');
    expect(actor.isSuperAdmin).toBe(false);
  });

  it('sets isSuperAdmin=true for Super Admin role', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'Super Admin' })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'superadmin@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    expect((req as any).actor.isSuperAdmin).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Suite 4: Subscription Gating                                      */
/* ------------------------------------------------------------------ */
describe('Suite 4: Subscription Gating', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
  });

  it('returns 403 when no identity headers are present', async () => {
    const middleware = requireSubscription('denial-iq');
    const req = mockReq({});
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(next.called).toBe(false);
  });

  it('returns 403 when user is not found', async () => {
    // requireSubscription checks azure_oid column on first DB-hitting call (module-level cache)
    mockQuery.mockResolvedValueOnce({ recordset: [{ 1: 1 }] }); // column check
    mockQuery.mockResolvedValueOnce({ recordset: [] }); // user lookup -> empty

    const middleware = requireSubscription('denial-iq');
    const req = mockReq({ 'x-actor-email': 'nobody@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json.message).toContain('User not found');
    expect(next.called).toBe(false);
  });

  it('Super Admin bypasses subscription check', async () => {
    // User lookup
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 1, Role: 'Super Admin', customer_id: 1, azure_oid: 'oid-sa' }],
    });

    const middleware = requireSubscription('denial-iq');
    const req = mockReq({ 'x-actor-email': 'superadmin@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    // Only user lookup query should run, no subscription queries
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('allows user with user-level subscription (UserProducts)', async () => {
    // User lookup
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 10, Role: 'Admin', customer_id: 1, azure_oid: null }],
    });
    // UserProducts check - has access
    mockQuery.mockResolvedValueOnce({ recordset: [{ has_access: 1 }] });

    const middleware = requireSubscription('denial-iq');
    const req = mockReq({ 'x-actor-email': 'subscribed@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
  });

  it('allows user with customer-level subscription (ProductSubscriptions)', async () => {
    // User lookup
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 10, Role: 'Admin', customer_id: 5, azure_oid: null }],
    });
    // UserProducts check - no access
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // ProductSubscriptions check - has access
    mockQuery.mockResolvedValueOnce({ recordset: [{ has_access: 1 }] });

    const middleware = requireSubscription('denial-iq');
    const req = mockReq({ 'x-actor-email': 'custlevel@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
  });

  it('denies user with no subscription at any level', async () => {
    // User lookup
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 10, Role: 'Admin', customer_id: 5, azure_oid: null }],
    });
    // UserProducts - no access
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // ProductSubscriptions - no access
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const middleware = requireSubscription('denial-iq');
    const req = mockReq({ 'x-actor-email': 'notsub@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json.subscriptionRequired).toBe(true);
    expect(res._json.product).toBe('denial-iq');
    expect(next.called).toBe(false);
  });

  it('skips customer-level check when user has no customer_id', async () => {
    // User lookup - no customer_id
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 10, Role: 'Admin', customer_id: null, azure_oid: null }],
    });
    // UserProducts - no access
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const middleware = requireSubscription('denial-iq');
    const req = mockReq({ 'x-actor-email': 'nocust@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(next.called).toBe(false);
    // Only 2 queries: user lookup + UserProducts. No ProductSubscriptions.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

    const middleware = requireSubscription('denial-iq');
    const req = mockReq({ 'x-actor-email': 'user@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(500);
    expect(next.called).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Suite 6: Patient Portal Roles                                     */
/* ------------------------------------------------------------------ */
describe('Suite 6: Patient Portal Roles', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    // requireRole now checks azure_oid column existence on every call (no cache)
    mockQuery.mockResolvedValueOnce({ recordset: [{ 1: 1 }] });
  });

  it('grants access to a User-role user when minimum is User', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'User' })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'patient@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
  });

  it('denies User-role when minimum is AR Specialist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'User' })] });

    const middleware = requireRole('AR Specialist');
    const req = mockReq({ 'x-actor-email': 'patient@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(next.called).toBe(false);
  });

  it('denies AR Specialist when minimum is Manager', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'AR Specialist' })] });

    const middleware = requireRole('Manager');
    const req = mockReq({ 'x-actor-email': 'specialist@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(next.called).toBe(false);
  });

  it('grants Training Admin access to Training Admin route', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'Training Admin' })] });

    const middleware = requireRole('Training Admin');
    const req = mockReq({ 'x-actor-email': 'trainer@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
  });

  it('attaches actor with correct role for downstream middleware', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [userRow({ Role: 'User', customer_id: 99 })] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'patient@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next.called).toBe(true);
    expect((req as any).actor.role).toBe('User');
    expect((req as any).actor.customer_id).toBe(99);
  });

  it('returns 403 when user not found in DB', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const middleware = requireRole('User');
    const req = mockReq({ 'x-actor-email': 'ghost@example.com' });
    const res = mockRes();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json.message).toContain('not found');
    expect(next.called).toBe(false);
  });
});

