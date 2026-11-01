/**
 * Unit Test - Session Timeout Middleware
 *
 * Tests that expired sessions are blocked and active sessions are allowed through.
 *
 * Run: npm test -- --testPathPattern=session-timeout
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any>>();

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => ({
        request: () => {
          const req: any = {
            input: (..._args: any[]) => req,
            query: mockQuery,
          };
          return req;
        },
      }),
    }),
  },
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { sessionTimeout } from '../middleware/session-timeout';

function mockReq(email?: string): any {
  return {
    headers: email ? { 'x-actor-email': email } : {},
  };
}

function mockRes(): any {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) { res.statusCode = code; return res; },
    json(data: any) { res.body = data; return res; },
  };
  return res;
}

describe('sessionTimeout middleware', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('blocks expired session with 401', async () => {
    // Last activity 60 minutes ago (> 30 min default)
    const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000);
    mockQuery.mockResolvedValueOnce({
      recordset: [{ last_activity_at: sixtyMinAgo }],
    });

    const middleware = sessionTimeout();
    const req = mockReq('expired@test.com');
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
    expect(nextCalled).toBe(false);
  });

  it('allows active session (recent activity)', async () => {
    // Last activity 5 minutes ago (< 30 min default)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ last_activity_at: fiveMinAgo }] })
      .mockResolvedValueOnce({ rowsAffected: [1] }); // update last_activity_at

    const middleware = sessionTimeout();
    const req = mockReq('active@test.com');
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('allows first-time request (null last_activity_at)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ last_activity_at: null }] })
      .mockResolvedValueOnce({ rowsAffected: [1] });

    const middleware = sessionTimeout();
    const req = mockReq('new@test.com');
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('skips session check when no x-actor-email header', async () => {
    const middleware = sessionTimeout();
    const req = mockReq(); // no email
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('continues on DB error (non-fatal)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

    const middleware = sessionTimeout();
    const req = mockReq('error@test.com');
    const res = mockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });
});
