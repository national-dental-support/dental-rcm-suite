/**
 * Unit Test - WebSocket Authentication
 *
 * Tests that the socket.io middleware rejects bad API keys and accepts valid ones.
 *
 * Run: npm test -- --testPathPattern=websocket-auth
 */
import { describe, it, expect } from '@jest/globals';

// Replicate the isValidApiKey logic from websockets/index.ts
function isValidApiKey(key: string, config: { apiKey?: string; secondaryApiKey?: string }): boolean {
  if (!key) return false;
  if (config.apiKey && key === config.apiKey) return true;
  if (config.secondaryApiKey && key === config.secondaryApiKey) return true;
  return false;
}

// Simulate the socket.io auth middleware logic
function authMiddleware(
  config: { apiKey?: string; secondaryApiKey?: string },
  handshake: { auth?: { apiKey?: string }; headers?: { apikey?: string }; query?: { deviceId?: string } },
): { allowed: boolean; error?: string } {
  const apiKey = handshake.auth?.apiKey || handshake.headers?.apikey;
  const deviceId = handshake.query?.deviceId;

  // Devices authenticate via deviceSecret, not API key
  if (deviceId) {
    return { allowed: true };
  }

  if (!apiKey || !isValidApiKey(apiKey, config)) {
    return { allowed: false, error: 'Authentication required' };
  }

  return { allowed: true };
}

const VALID_KEY = 'c3d7wKrJH-lpam1ziM-5CiNKbmGqq-49cdLuM0T6-KVvE98pijUF9d';
const CONFIG = { apiKey: VALID_KEY, secondaryApiKey: 'secondary-test-key' };

describe('WebSocket Auth Middleware', () => {
  it('rejects connection with no API key', () => {
    const result = authMiddleware(CONFIG, { auth: {}, headers: {} });
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('Authentication required');
  });

  it('rejects connection with invalid API key', () => {
    const result = authMiddleware(CONFIG, { auth: { apiKey: 'bad-key' } });
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('Authentication required');
  });

  it('accepts connection with valid primary API key', () => {
    const result = authMiddleware(CONFIG, { auth: { apiKey: VALID_KEY } });
    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts connection with valid secondary API key', () => {
    const result = authMiddleware(CONFIG, { auth: { apiKey: 'secondary-test-key' } });
    expect(result.allowed).toBe(true);
  });

  it('accepts connection with API key in headers', () => {
    const result = authMiddleware(CONFIG, { headers: { apikey: VALID_KEY } });
    expect(result.allowed).toBe(true);
  });

  it('allows device connections without API key (deviceId present)', () => {
    const result = authMiddleware(CONFIG, { auth: {}, query: { deviceId: 'abc-123' } });
    expect(result.allowed).toBe(true);
  });

  it('rejects empty string API key', () => {
    const result = authMiddleware(CONFIG, { auth: { apiKey: '' } });
    expect(result.allowed).toBe(false);
  });
});
