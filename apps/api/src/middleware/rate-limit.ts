import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window per IP */
  max: number;
  /** Custom message returned on 429 */
  message?: string;
}

/**
 * In-memory per-IP rate limiter middleware factory.
 *
 * Usage:
 *   app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, message } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodically purge expired entries to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000);

  // Don't prevent Node from exiting
  if (cleanup.unref) {
    cleanup.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = store.get(ip);

    // If no entry or window expired, start fresh
    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      store.set(ip, entry);
      next();
      return;
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({
        message: message || 'Too many requests, try again later',
      });
      return;
    }

    next();
  };
}
