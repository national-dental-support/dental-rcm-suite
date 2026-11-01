/**
 * Unit Tests - feature-audit.ts (logFeatureAction utility)
 *
 * Run: npm test -- --testPathPattern=feature-audit
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { logFeatureAction, FeatureAuditPayload } from '../utils/feature-audit';

// -- Mock ConnectionPool ------------------------------------------------------

function createMockPool(shouldThrow = false) {
  const capturedInputs: Array<{ name: string; type: any; value: any }> = [];
  let queryCalled = false;
  let queryText = '';

  const mockRequest = {
    input(name: string, type: any, value: any) {
      capturedInputs.push({ name, type, value });
      return mockRequest;
    },
    async query(sql: string) {
      queryCalled = true;
      queryText = sql;
      if (shouldThrow) {
        throw new Error('DB connection failed');
      }
      return { rowsAffected: [1] };
    },
  };

  const pool = {
    request() {
      return mockRequest;
    },
  };

  return { pool, capturedInputs, isQueryCalled: () => queryCalled, getQueryText: () => queryText };
}

describe('logFeatureAction', () => {
  it('writes audit entry to the pool with correct inputs', async () => {
    const { pool, capturedInputs, isQueryCalled, getQueryText } = createMockPool();

    const payload: FeatureAuditPayload = {
      feature: 'payments',
      action: 'charge_created',
      actorId: 5,
      actorEmail: 'dr@clinic.com',
      targetId: 'TXN-123',
      targetType: 'transaction',
      details: { amount: 150, currency: 'USD' },
      ip: '10.0.0.1',
    };

    await logFeatureAction(pool as any, payload);

    expect(isQueryCalled()).toBe(true);
    expect(getQueryText()).toContain('INSERT INTO FeatureAuditLog');

    const inputNames = capturedInputs.map(i => i.name);
    expect(inputNames).toContain('feature');
    expect(inputNames).toContain('action');
    expect(inputNames).toContain('actor_id');
    expect(inputNames).toContain('actor_email');
    expect(inputNames).toContain('target_id');
    expect(inputNames).toContain('target_type');
    expect(inputNames).toContain('details');
    expect(inputNames).toContain('ip_address');

    const featureInput = capturedInputs.find(i => i.name === 'feature');
    expect(featureInput!.value).toBe('payments');

    const detailsInput = capturedInputs.find(i => i.name === 'details');
    expect(detailsInput!.value).toBe(JSON.stringify({ amount: 150, currency: 'USD' }));
  });

  it('handles string details without double-serialization', async () => {
    const { pool, capturedInputs } = createMockPool();

    await logFeatureAction(pool as any, {
      feature: 'auth',
      action: 'login',
      details: 'User logged in from mobile',
    });

    const detailsInput = capturedInputs.find(i => i.name === 'details');
    expect(detailsInput!.value).toBe('User logged in from mobile');
  });

  it('sends null for optional fields when not provided', async () => {
    const { pool, capturedInputs } = createMockPool();

    await logFeatureAction(pool as any, {
      feature: 'kiosk',
      action: 'check_in',
    });

    const actorId = capturedInputs.find(i => i.name === 'actor_id');
    expect(actorId!.value).toBeNull();

    const actorEmail = capturedInputs.find(i => i.name === 'actor_email');
    expect(actorEmail!.value).toBeNull();

    const details = capturedInputs.find(i => i.name === 'details');
    expect(details!.value).toBeNull();

    const ip = capturedInputs.find(i => i.name === 'ip_address');
    expect(ip!.value).toBeNull();
  });

  it('does not throw when the pool query fails', async () => {
    const { pool } = createMockPool(true);

    // Should not throw - errors are swallowed with a warning log
    await expect(
      logFeatureAction(pool as any, {
        feature: 'payments',
        action: 'charge_failed',
      })
    ).resolves.toBeUndefined();
  });

  it('handles null details', async () => {
    const { pool, capturedInputs } = createMockPool();

    await logFeatureAction(pool as any, {
      feature: 'fax',
      action: 'send',
      details: null,
    });

    const details = capturedInputs.find(i => i.name === 'details');
    expect(details!.value).toBeNull();
  });
});
