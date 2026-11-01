/**
 * Tenant Isolation Test Suite - Suite 5
 *
 * Verifies that SQL queries include proper tenant (customer_id) filters,
 * scope filters (location/provider/payer), and Super Admin bypass behavior.
 *
 * Tests the `resolveUserScope` and `buildScopeFilter` utilities directly.
 *
 * Run: npm test -- --testPathPattern=tenant-isolation
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import sql from 'mssql';

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
/*  Mock: logger                                                      */
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
/*  Imports                                                           */
/* ------------------------------------------------------------------ */
import { resolveUserScope, buildScopeFilter, UserScope } from '../utils/resolve-user-scope';

/** Default values for the new team/group scoping fields on UserScope */
const SCOPE_DEFAULTS = {
  role: '',
  groupIds: [] as number[],
  groupLocations: [] as string[],
  teamMemberIds: [] as number[],
  teamLocations: [] as string[],
  isManager: false,
  isAdmin: false,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Create a mock pool whose .request() returns chainable input/query.
 * Each call to mockQuery can be pre-loaded with mockResolvedValueOnce.
 */
function createMockPool(): any {
  return {
    request: () => {
      const r: any = {
        input: (...a: any[]) => { mockInput(...a); return r; },
        query: mockQuery,
      };
      return r;
    },
  };
}

/** Builds a mock sql.Request that records inputs */
function createMockRequest(): sql.Request & { _inputs: Record<string, any> } {
  const inputs: Record<string, any> = {};
  const req: any = {
    _inputs: inputs,
    input(name: string, type: any, value: any) {
      inputs[name] = value;
      return req;
    },
  };
  return req;
}

/* ------------------------------------------------------------------ */
/*  Suite 5a: resolveUserScope                                        */
/* ------------------------------------------------------------------ */
describe('Suite 5a: resolveUserScope', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
  });

  it('returns empty scope when neither email nor OID is provided', async () => {
    const pool = createMockPool();
    const scope = await resolveUserScope(pool, '', null, null);

    expect(scope.userId).toBeNull();
    expect(scope.customerId).toBeNull();
    expect(scope.isSuperAdmin).toBe(false);
    expect(scope.locations).toEqual([]);
    expect(scope.providers).toEqual([]);
    expect(scope.payers).toEqual([]);
    // No DB queries should have been made
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns correct scope for a regular user (customer_id=1)', async () => {
    // User lookup
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 10, customer_id: 1, Role: 'Admin', azure_oid: null }],
    });
    // Scope assignments
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { scope_type: 'location', scope_value: 'LOC-A' },
        { scope_type: 'provider', scope_value: 'PROV-1' },
      ],
    });

    const pool = createMockPool();
    const scope = await resolveUserScope(pool, 'user@example.com');

    expect(scope.userId).toBe(10);
    expect(scope.customerId).toBe(1);
    expect(scope.isSuperAdmin).toBe(false);
    expect(scope.locations).toEqual(['LOC-A']);
    expect(scope.providers).toEqual(['PROV-1']);
    expect(scope.payers).toEqual([]);
  });

  it('Super Admin gets isSuperAdmin=true and no customer_id override by default', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 1, customer_id: null, Role: 'Super Admin', azure_oid: 'sa-oid' }],
    });
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const pool = createMockPool();
    const scope = await resolveUserScope(pool, 'sa@example.com');

    expect(scope.isSuperAdmin).toBe(true);
    expect(scope.customerId).toBeNull();
  });

  it('Super Admin with x-xen-customer-id override scopes to that tenant', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 1, customer_id: null, Role: 'Super Admin', azure_oid: 'sa-oid' }],
    });
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const pool = createMockPool();
    const scope = await resolveUserScope(pool, 'sa@example.com', 42);

    // When Super Admin overrides to a specific customer, they should be treated as non-super for tenant filtering
    expect(scope.customerId).toBe(42);
    expect(scope.isSuperAdmin).toBe(false);
  });

  it('returns empty scope when user is not found in DB', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const pool = createMockPool();
    const scope = await resolveUserScope(pool, 'ghost@example.com');

    expect(scope.userId).toBeNull();
    expect(scope.customerId).toBeNull();
  });

  it('auto-links OID when user has no azure_oid stored', async () => {
    // User lookup - no azure_oid (Admin role triggers extra admin scoping queries)
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 10, customer_id: 1, Role: 'Admin', azure_oid: null }],
    });
    // Auto-link UPDATE (fire-and-forget but mockQuery is still called)
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // Scope lookup (UserQueueScope)
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // Admin group scoping: UserGroupAssignment
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    // Admin transitive: AdminManagerAssignment
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const pool = createMockPool();
    const scope = await resolveUserScope(pool, 'user@example.com', null, 'new-oid-123');

    expect(scope.userId).toBe(10);
    // column check + user lookup + auto-link UPDATE + scope + admin group + admin managers = 5
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });

  it('resolves scope with multiple payer assignments', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ userID: 10, customer_id: 1, Role: 'Manager', azure_oid: null }],
    });
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { scope_type: 'payer', scope_value: 'AETNA' },
        { scope_type: 'payer', scope_value: 'BCBS' },
        { scope_type: 'payer', scope_value: 'CIGNA' },
      ],
    });

    const pool = createMockPool();
    const scope = await resolveUserScope(pool, 'manager@example.com');

    expect(scope.payers).toEqual(['AETNA', 'BCBS', 'CIGNA']);
    expect(scope.locations).toEqual([]);
    expect(scope.providers).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Suite 5b: buildScopeFilter - tenantClause behavior                */
/* ------------------------------------------------------------------ */
describe('Suite 5b: buildScopeFilter \u2014 tenant clause', () => {
  it('returns empty SQL for Super Admin (no tenant filter)', () => {
    const scope: UserScope = {
      userId: 1,
      customerId: null,
      isSuperAdmin: true,
      locations: [],
      providers: [],
      payers: [],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'c');
    expect(filter.sql).toBe('');
  });

  it('includes customer_id filter for non-Super-Admin with customer_id', () => {
    const scope: UserScope = {
      userId: 10,
      customerId: 5,
      isSuperAdmin: false,
      locations: [],
      providers: [],
      payers: [],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'c');
    expect(filter.sql).toContain('customer_id = @_scopeCustId');

    // Verify addInputs binds the correct value
    const req = createMockRequest();
    filter.addInputs(req as any);
    expect(req._inputs['_scopeCustId']).toBe(5);
  });

  it('returns empty SQL when customerId is null and not Super Admin', () => {
    const scope: UserScope = {
      userId: 10,
      customerId: null,
      isSuperAdmin: false,
      locations: [],
      providers: [],
      payers: [],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'c');
    expect(filter.sql).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/*  Suite 5c: buildScopeFilter - location/provider/payer filters      */
/* ------------------------------------------------------------------ */
describe('Suite 5c: buildScopeFilter \u2014 scope dimensions', () => {
  it('includes location filter when scope has locations', () => {
    const scope: UserScope = {
      userId: 10,
      customerId: 1,
      isSuperAdmin: false,
      locations: ['LOC-A', 'LOC-B'],
      providers: [],
      payers: [],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'c');
    expect(filter.sql).toContain('customer_id = @_scopeCustId');
    expect(filter.sql).toContain('rr_loc');
    expect(filter.sql).toContain('@_scopeLoc0');
    expect(filter.sql).toContain('@_scopeLoc1');

    const req = createMockRequest();
    filter.addInputs(req as any);
    expect(req._inputs['_scopeLoc0']).toBe('LOC-A');
    expect(req._inputs['_scopeLoc1']).toBe('LOC-B');
  });

  it('includes provider filter when scope has providers', () => {
    const scope: UserScope = {
      userId: 10,
      customerId: 1,
      isSuperAdmin: false,
      locations: [],
      providers: ['Dr. Smith', 'Dr. Jones'],
      payers: [],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'cl');
    expect(filter.sql).toContain('rr_prov');
    expect(filter.sql).toContain('ProviderName');
    expect(filter.sql).toContain('@_scopeProv0');
    expect(filter.sql).toContain('@_scopeProv1');

    const req = createMockRequest();
    filter.addInputs(req as any);
    expect(req._inputs['_scopeProv0']).toBe('Dr. Smith');
    expect(req._inputs['_scopeProv1']).toBe('Dr. Jones');
  });

  it('includes payer filter when scope has payers', () => {
    const scope: UserScope = {
      userId: 10,
      customerId: 1,
      isSuperAdmin: false,
      locations: [],
      providers: [],
      payers: ['AETNA', 'BCBS'],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'd');
    expect(filter.sql).toContain('rr_pay');
    expect(filter.sql).toContain('InsuranceName');
    expect(filter.sql).toContain('@_scopePay0');
    expect(filter.sql).toContain('@_scopePay1');

    const req = createMockRequest();
    filter.addInputs(req as any);
    expect(req._inputs['_scopePay0']).toBe('AETNA');
    expect(req._inputs['_scopePay1']).toBe('BCBS');
  });

  it('skips all scope filters when arrays are empty', () => {
    const scope: UserScope = {
      userId: 10,
      customerId: 3,
      isSuperAdmin: false,
      locations: [],
      providers: [],
      payers: [],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'c');
    // Should only have tenant clause, no scope subqueries
    expect(filter.sql).toContain('customer_id');
    expect(filter.sql).not.toContain('rr_loc');
    expect(filter.sql).not.toContain('rr_prov');
    expect(filter.sql).not.toContain('rr_pay');
  });

  it('combines all scope dimensions together', () => {
    const scope: UserScope = {
      userId: 10,
      customerId: 2,
      isSuperAdmin: false,
      locations: ['LOC-X'],
      providers: ['Dr. Z'],
      payers: ['CIGNA'],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'c');
    expect(filter.sql).toContain('customer_id = @_scopeCustId');
    expect(filter.sql).toContain('rr_loc');
    expect(filter.sql).toContain('rr_prov');
    expect(filter.sql).toContain('rr_pay');

    const req = createMockRequest();
    filter.addInputs(req as any);
    expect(req._inputs['_scopeCustId']).toBe(2);
    expect(req._inputs['_scopeLoc0']).toBe('LOC-X');
    expect(req._inputs['_scopeProv0']).toBe('Dr. Z');
    expect(req._inputs['_scopePay0']).toBe('CIGNA');
  });

  it('uses the provided claimAlias in SQL fragments', () => {
    const scope: UserScope = {
      userId: 10,
      customerId: 1,
      isSuperAdmin: false,
      locations: ['LOC-A'],
      providers: [],
      payers: [],
      ...SCOPE_DEFAULTS,
    };

    const filter = buildScopeFilter(scope, 'myAlias');
    expect(filter.sql).toContain('myAlias.customer_id');
    expect(filter.sql).toContain('myAlias.ClaimID');
  });
});
