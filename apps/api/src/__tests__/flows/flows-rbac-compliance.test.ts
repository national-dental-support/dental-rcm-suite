/**
 * Business Process: Role-Based Access Control Compliance
 *
 * Tests the requireRole middleware end-to-end as a business process:
 *   - Header validation (Scenario A)
 *   - User lookup failures (Scenario B)
 *   - Account lifecycle enforcement - disabled/archived (Scenario C)
 *   - Account lockout enforcement (Scenario D)
 *   - Insufficient role rejection (Scenario E)
 *   - Sufficient role acceptance (Scenario F)
 *   - Super Admin bypass (Scenario G)
 *   - Full role hierarchy correctness (Scenario H)
 *
 * Run: npm test -- --testPathPattern=flows-rbac-compliance
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- DB mock -------------------------------------------------------------------
// require-role.ts calls:  Database.getInstance().getPool().request().input(...).query(...)
// We give each test full control over what query() resolves to via mockQuery.

const mockQuery = jest.fn<any>();

const mockRequestInstance: any = {
  input: (..._a: any[]) => mockRequestInstance,
  query: mockQuery,
};

const mockPool = {
  request: () => mockRequestInstance,
};

jest.mock('../../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => mockPool,
    }),
  },
}));

// --- mssql mock ----------------------------------------------------------------
jest.mock('mssql', () => {
  const typeStub = (n?: any) => ({ type: 'mock', n });
  return {
    __esModule: true,
    default: {
      NVarChar: typeStub,
      Int: typeStub,
    },
    NVarChar: typeStub,
    Int: typeStub,
  };
});

// --- Logger mock ---------------------------------------------------------------
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// --- Import SUT after mocks ----------------------------------------------------
import { requireRole } from '../../middleware/require-role';

// --- Test helpers --------------------------------------------------------------

/** Build a minimal Express-like request object. */
const makeReq = (headers: Record<string, string> = {}): any => ({
  headers: {
    'x-actor-email': 'actor@test.com',
    ...headers,
  },
});

/** Build a minimal Express-like response object with chainable status/json. */
const makeRes = (): any => {
  const res: any = { locals: {} };
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

/** Return a jest.fn() to use as next(). */
const makeNext = () => jest.fn();

/** Build a standard user recordset row. */
const makeUser = (overrides: Record<string, any> = {}) => ({
  userID:      42,
  Role:        'Manager',
  disabled:    0,
  archived:    0,
  locked_until: null,
  customer_id: 'CUST-001',
  ProviderID:  null,
  azure_oid:   null,
  ...overrides,
});

// --- Tests ---------------------------------------------------------------------

describe('Business Process: Role-Based Access Control', () => {

  beforeEach(() => {
    mockQuery.mockReset();
    // requireRole first does a column-check query for azure_oid existence.
    // Pre-load that result so each test only needs to mock the user lookup.
    mockQuery.mockResolvedValueOnce({ recordset: [{ 1: 1 }] }); // column check -> azure_oid exists
  });

  // ==========================================================================
  // Scenario A - Missing actor headers
  // ==========================================================================
  describe('Scenario A: Missing actor headers returns 403', () => {
    it('Given no x-actor-email and no x-actor-oid, Then 403 with header-required message', async () => {
      const req  = makeReq({ 'x-actor-email': '' }); // override to empty
      // Remove both headers so neither is present
      delete req.headers['x-actor-email'];
      delete req.headers['x-actor-oid'];

      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      const body = res.json.mock.calls[0]?.[0] as any;
      expect(body.message).toMatch(/x-actor/i);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Scenario B - User not found in DB
  // ==========================================================================
  describe('Scenario B: User not found in DB returns 403', () => {
    it('Given pool returns empty recordset, Then 403 "Actor account not found"', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      const body = res.json.mock.calls[0]?.[0] as any;
      expect(body.message).toMatch(/not found/i);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Scenario C - Disabled user
  // ==========================================================================
  describe('Scenario C: Disabled user returns 403', () => {
    it('Given user.disabled=1, Then 403 with "inactive" or "disabled"', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Manager', disabled: 1 })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      const body = res.json.mock.calls[0]?.[0] as any;
      expect(body.message).toMatch(/inactive|disabled/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('Given user.archived=1, Then 403 with "inactive" or "disabled"', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Manager', archived: 1 })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      const body = res.json.mock.calls[0]?.[0] as any;
      expect(body.message).toMatch(/inactive|disabled/i);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Scenario D - Locked account
  // ==========================================================================
  describe('Scenario D: Locked account returns 403 with lock info', () => {
    it('Given locked_until is 5 minutes in the future, Then 403 with locked:true', async () => {
      const futureDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Manager', locked_until: futureDate })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      const body = res.json.mock.calls[0]?.[0] as any;
      expect(body.locked).toBe(true);
      expect(body.lockoutExpiresAt).toBeDefined();
      expect(body.message).toMatch(/locked/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('Given locked_until is in the past, Then account is not considered locked', async () => {
      const pastDate = new Date(Date.now() - 60 * 1000).toISOString();
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Manager', locked_until: pastDate })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      // Lockout expired - should proceed normally (next called)
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
    });
  });

  // ==========================================================================
  // Scenario E - Insufficient role (AR Specialist cannot access Manager routes)
  // ==========================================================================
  describe('Scenario E: AR Specialist cannot access Manager routes', () => {
    it('Given Role="AR Specialist", When requireRole("Manager"), Then 403 naming roles', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'AR Specialist' })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      const body = res.json.mock.calls[0]?.[0] as any;
      // Message should name the required role and the actor's actual role
      expect(body.message).toMatch(/Manager/);
      expect(body.message).toMatch(/AR Specialist/);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Scenario F - Sufficient role (Admin can access Manager routes)
  // ==========================================================================
  describe('Scenario F: Admin can access Manager-guarded routes', () => {
    it('Given Role="Admin", When requireRole("Manager"), Then next() is called', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Admin' })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('Given Role="Manager", When requireRole("Manager"), Then next() is called (exact match)', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Manager' })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('Given Role="Admin", When requireRole("Admin"), Then req.actor is populated', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Admin', customer_id: 'CUST-XYZ', ProviderID: 'P99' })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Admin')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.actor).toBeDefined();
      expect(req.actor.role).toBe('Admin');
      expect(req.actor.customer_id).toBe('CUST-XYZ');
      expect(req.actor.isSuperAdmin).toBe(false);
    });
  });

  // ==========================================================================
  // Scenario G - Super Admin bypasses all role requirements
  // ==========================================================================
  describe('Scenario G: Super Admin bypasses all role requirements', () => {
    it('Given Role="Super Admin", When requireRole("Admin"), Then next() called with isSuperAdmin=true', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Super Admin' })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Admin')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.actor.isSuperAdmin).toBe(true);
      expect(req.actor.role).toBe('Super Admin');
    });

    it('Given Role="Super Admin", When requireRole("Super Admin"), Then access granted', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Super Admin' })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Super Admin')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.actor.isSuperAdmin).toBe(true);
    });

    it('Given Role="Super Admin", When requireRole("Manager") on non-Admin route, Then access granted', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Super Admin' })],
      });

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.actor.isSuperAdmin).toBe(true);
    });
  });

  // ==========================================================================
  // Scenario H - Role hierarchy correctness
  // Business compliance: exact hierarchy must be enforced at each boundary
  // AR Specialist(1) < Manager(2) < Admin(4) < Super Admin(5)
  // ==========================================================================
  describe('Business Rule: Role Hierarchy Enforcement', () => {
    const roleHierarchy = ['AR Specialist', 'Manager', 'Admin', 'Super Admin'];

    roleHierarchy.forEach((role, idx) => {
      const higherRole = roleHierarchy[idx + 1];
      if (!higherRole) return;

      describe(`Boundary: ${role} vs ${higherRole}`, () => {

        it(`Given role="${role}", When requireRole("${higherRole}") checks, Then 403 is returned`, async () => {
          mockQuery.mockResolvedValueOnce({
            recordset: [makeUser({ Role: role })],
          });

          const req  = makeReq();
          const res  = makeRes();
          const next = makeNext();

          await requireRole(higherRole)(req, res, next);

          expect(res.status).toHaveBeenCalledWith(403);
          expect(next).not.toHaveBeenCalled();
        });

        it(`Given role="${higherRole}", When requireRole("${role}") checks, Then access is granted`, async () => {
          mockQuery.mockResolvedValueOnce({
            recordset: [makeUser({ Role: higherRole })],
          });

          const req  = makeReq();
          const res  = makeRes();
          const next = makeNext();

          await requireRole(role)(req, res, next);

          expect(next).toHaveBeenCalled();
          expect(res.status).not.toHaveBeenCalledWith(403);
        });

      });
    });

    it('AR Specialist is the lowest role in the business hierarchy (level 1)', async () => {
      // AR Specialist cannot access anything above itself
      // beforeEach pre-loads 1 column check; each iteration needs colCheck + userLookup
      const guardRoles = ['Manager', 'Admin', 'Super Admin'];
      for (let i = 0; i < guardRoles.length; i++) {
        if (i > 0) mockQuery.mockResolvedValueOnce({ recordset: [{ 1: 1 }] }); // extra col check for iter 2+
        mockQuery.mockResolvedValueOnce({
          recordset: [makeUser({ Role: 'AR Specialist' })],
        });

        const req  = makeReq();
        const res  = makeRes();
        const next = makeNext();

        await requireRole(guardRoles[i])(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
      }
    });

    it('Super Admin is the highest role and can access all guarded routes', async () => {
      // beforeEach pre-loads 1 column check; each iteration needs colCheck + userLookup
      const guardRoles = ['AR Specialist', 'Manager', 'Admin'];
      for (let i = 0; i < guardRoles.length; i++) {
        if (i > 0) mockQuery.mockResolvedValueOnce({ recordset: [{ 1: 1 }] }); // extra col check for iter 2+
        mockQuery.mockResolvedValueOnce({
          recordset: [makeUser({ Role: 'Super Admin' })],
        });

        const req  = makeReq();
        const res  = makeRes();
        const next = makeNext();

        await requireRole(guardRoles[i])(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(403);
      }
    });
  });

  // ==========================================================================
  // Additional actor header scenarios
  // ==========================================================================
  describe('Actor header resolution', () => {
    it('Given only x-actor-oid (no email), Then lookup proceeds by OID', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Manager', azure_oid: 'oid-abc-123' })],
      });

      const req  = makeReq({ 'x-actor-oid': 'oid-abc-123' });
      delete req.headers['x-actor-email'];
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('Given both x-actor-email and x-actor-oid, Then lookup proceeds (OID preferred)', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [makeUser({ Role: 'Admin', azure_oid: 'oid-xyz-789' })],
      });

      const req  = makeReq({
        'x-actor-email': 'admin@test.com',
        'x-actor-oid':   'oid-xyz-789',
      });
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('Given DB throws an error, Then 500 is returned', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection pool exhausted'));

      const req  = makeReq();
      const res  = makeRes();
      const next = makeNext();

      await requireRole('Manager')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });

});
