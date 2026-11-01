import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../modules/redis';
import logger from '../utils/logger';

interface DistributedRateLimitOptions {
  /** Time window in seconds */
  windowSec: number;
  /** Max requests per window per IP */
  max: number;
  /** Redis key prefix */
  prefix?: string;
  /** Custom message returned on 429 */
  message?: string;
}

/**
 * Distributed rate limiter using Redis sliding window.
 *
 * Falls back to the in-memory rate limiter if Redis is unavailable.
 * Compatible with multi-instance deployments behind a load balancer.
 *
 * Usage:
 *   app.use('/api', distributedRateLimit({ windowSec: 60, max: 1000 }));
 */
export function distributedRateLimit(options: DistributedRateLimitOptions) {
  const { windowSec, max, prefix = 'rl:', message } = options;

  // In-memory fallback store (for when Redis is unavailable)
  const memStore = new Map<string, { count: number; resetAt: number }>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memStore) {
      if (now >= v.resetAt) memStore.delete(k);
    }
  }, 60_000);
  if (cleanup.unref) cleanup.unref();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const redis = getRedis();

    if (redis) {
      // Redis sliding window counter
      try {
        const key = `${prefix}${ip}`;
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, windowSec);
        }
        const ttl = await redis.ttl(key);

        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + Math.max(ttl, 0)));

        if (count > max) {
          res.setHeader('Retry-After', String(Math.max(ttl, 1)));
          res.status(429).json({ message: message || 'Too many requests, try again later' });
          return;
        }
        next();
        return;
      } catch (err) {
        logger.warn('[RateLimit] Redis error \u2014 falling back to in-memory store', { ip, error: String(err) });
      }
    }

    // In-memory fallback
    const now = Date.now();
    let entry = memStore.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowSec * 1000 };
      memStore.set(ip, entry);
      next();
      return;
    }
    entry.count++;
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ message: message || 'Too many requests, try again later' });
      return;
    }
    next();
  };
}
