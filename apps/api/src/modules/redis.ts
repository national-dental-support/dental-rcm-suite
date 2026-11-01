import logger from '../utils/logger';

/**
 * Optional Redis client for distributed rate limiting, caching, and session store.
 *
 * When REDIS_URL is set, provides a shared ioredis client.
 * When not set, falls back gracefully - all consumers must handle null.
 *
 * Usage:
 *   import { getRedis } from '../modules/redis';
 *   const redis = getRedis();
 *   if (redis) { await redis.set('key', 'value', 'EX', 60); }
 */

let client: any = null;
let connectionAttempted = false;

export function getRedis(): any {
  if (connectionAttempted) return client;
  connectionAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info('[Redis] REDIS_URL not set \u2014 running without Redis (in-memory fallbacks active)');
    return null;
  }

  try {
    // Dynamic import to avoid hard dependency
    const Redis = require('ioredis');
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      /* istanbul ignore next */
      retryStrategy(times: number) {
        if (times > 10) return null; // stop retrying
        return Math.min(times * 200, 5000);
      },
      lazyConnect: false,
      enableReadyCheck: true,
    });

    client.on('connect', /* istanbul ignore next */ () => logger.info('[Redis] Connected'));
    client.on('error', /* istanbul ignore next */ (err: any) => logger.warn(`[Redis] Error: ${err?.message}`));
    client.on('close', /* istanbul ignore next */ () => logger.warn('[Redis] Connection closed'));

    return client;
  } catch (err: any) /* istanbul ignore next */ {
    logger.warn(`[Redis] Failed to initialize: ${err?.message} \u2014 falling back to in-memory`);
    client = null;
    return null;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
      logger.info('[Redis] Disconnected');
    } catch { /* ignore */ }
    client = null;
  }
}
