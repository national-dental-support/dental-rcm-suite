/**
 * Unit Tests - rate-limit.ts (in-memory per-IP rate limiter middleware)
 *
 * Run: npm test -- --testPathPattern=rate-limit
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { rateLimit } from '../middleware/rate-limit';

function mockReq(ip = '127.0.0.1'): Partial<Request> {
  return {
    ip,
    socket: { remoteAddress: ip } as any,
  };
}

function mockRes(): Partial<Response> & { statusCode: number; body: any; headers: Record<string, string> } {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
    set(key: string, value: string) {
      res.headers[key] = value;
      return res;
    },
  };
  return res;
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 5 });
    let called = 0;
    const next: NextFunction = () => { called++; };

    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      limiter(mockReq() as Request, res as any as Response, next);
      expect(res.statusCode).toBe(200);
    }
    expect(called).toBe(5);
  });

  it('blocks requests over the limit with 429', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3 });
    const next: NextFunction = () => {};

    // Use up the limit
    for (let i = 0; i < 3; i++) {
      limiter(mockReq() as Request, mockRes() as any as Response, next);
    }

    // 4th request should be blocked
    const res = mockRes();
    limiter(mockReq() as Request, res as any as Response, next);
    expect(res.statusCode).toBe(429);
    expect(res.body.message).toContain('Too many requests');
    expect(res.headers['Retry-After']).toBeTruthy();
  });

  it('uses custom message when provided', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, message: 'Slow down!' });
    const next: NextFunction = () => {};

    limiter(mockReq() as Request, mockRes() as any as Response, next);

    const res = mockRes();
    limiter(mockReq() as Request, res as any as Response, next);
    expect(res.statusCode).toBe(429);
    expect(res.body.message).toBe('Slow down!');
  });

  it('tracks different IPs separately', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    let called = 0;
    const next: NextFunction = () => { called++; };

    // IP A uses 2 requests
    limiter(mockReq('10.0.0.1') as Request, mockRes() as any as Response, next);
    limiter(mockReq('10.0.0.1') as Request, mockRes() as any as Response, next);

    // IP A is now at limit - 3rd request should be blocked
    const resA = mockRes();
    limiter(mockReq('10.0.0.1') as Request, resA as any as Response, next);
    expect(resA.statusCode).toBe(429);

    // IP B should still be allowed
    const resB = mockRes();
    limiter(mockReq('10.0.0.2') as Request, resB as any as Response, next);
    expect(resB.statusCode).toBe(200);
    expect(called).toBe(3); // 2 for A + 1 for B
  });

  it('resets after window expires', async () => {
    const limiter = rateLimit({ windowMs: 100, max: 1 }); // 100ms window
    const next: NextFunction = () => {};

    // Use the limit
    limiter(mockReq() as Request, mockRes() as any as Response, next);

    // Should be blocked
    const res1 = mockRes();
    limiter(mockReq() as Request, res1 as any as Response, next);
    expect(res1.statusCode).toBe(429);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should be allowed again
    let allowed = false;
    const next2: NextFunction = () => { allowed = true; };
    const res2 = mockRes();
    limiter(mockReq() as Request, res2 as any as Response, next2);
    expect(allowed).toBe(true);
    expect(res2.statusCode).toBe(200);
  });

  it('sets Retry-After header with correct seconds', () => {
    const limiter = rateLimit({ windowMs: 30_000, max: 1 });
    const next: NextFunction = () => {};

    limiter(mockReq() as Request, mockRes() as any as Response, next);

    const res = mockRes();
    limiter(mockReq() as Request, res as any as Response, next);
    expect(res.statusCode).toBe(429);
    const retryAfter = parseInt(res.headers['Retry-After'], 10);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(30);
  });
});
