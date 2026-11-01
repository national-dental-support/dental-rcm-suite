import { getRedis } from '../modules/redis';
import Database from '../modules/db';
import logger from './logger';

/**
 * Distributed lock for preventing duplicate scheduler execution across pods.
 *
 * Strategy:
 *  - If Redis is available: uses Redis SET NX EX (atomic lock with TTL)
 *  - If Redis is unavailable: uses SQL Server sp_getapplock (database-level advisory lock)
 *
 * Usage:
 *   const release = await acquireLock('report-scheduler', 300);
 *   if (!release) return; // another pod has the lock
 *   try {
 *     await doWork();
 *   } finally {
 *     await release();
 *   }
 *
 * Or use the helper:
 *   await withLock('priority-recalc', 600, async () => { ... });
 */

const LOCK_PREFIX = 'rcm:lock:';

export type ReleaseFn = () => Promise<void>;

/**
 * Acquire a distributed lock.
 * @param name - Lock name (unique per job)
 * @param ttlSeconds - Lock auto-expires after this many seconds (prevents deadlocks)
 * @returns Release function if lock acquired, null if already held
 */
export async function acquireLock(name: string, ttlSeconds: number): Promise<ReleaseFn | null> {
  const redis = getRedis();

  if (redis) {
    return acquireRedisLock(redis, name, ttlSeconds);
  }
  return acquireSqlLock(name, ttlSeconds);
}

/**
 * Execute a function while holding a distributed lock.
 * No-ops if lock is already held by another instance.
 */
export async function withLock(name: string, ttlSeconds: number, fn: () => Promise<void>): Promise<boolean> {
  const release = await acquireLock(name, ttlSeconds);
  if (!release) {
    return false; // Lock held by another instance
  }
  try {
    await fn();
    return true;
  } finally {
    await release();
  }
}

// -- Redis implementation ----------------------------------------------------

async function acquireRedisLock(redis: any, name: string, ttlSeconds: number): Promise<ReleaseFn | null> {
  const key = `${LOCK_PREFIX}${name}`;
  const value = `${process.pid}-${Date.now()}`;

  // SET key value NX EX ttl - atomic acquire
  const result = await redis.set(key, value, 'EX', ttlSeconds, 'NX');

  if (result !== 'OK') {
    return null; // Lock already held
  }

  // Return release function (only deletes if we still own the lock)
  return async () => {
    try {
      // Lua script: only delete if value matches (prevents releasing someone else's lock)
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(script, 1, key, value);
    } catch (err: any) { /* istanbul ignore next */
      logger.warn(`[Lock:Redis] Release failed for ${name}: ${err?.message}`);
    }
  };
}

// -- SQL Server implementation (fallback) ------------------------------------

async function acquireSqlLock(name: string, ttlSeconds: number): Promise<ReleaseFn | null> {
  try {
    const pool = Database.getInstance().getPool();
    if (!pool.connected) return null;

    // sp_getapplock with NOWAIT - returns 0 if acquired, negative if not
    const result = await pool.request()
      .input('Resource', name)
      .input('LockMode', 'Exclusive')
      .input('LockOwner', 'Session')
      .input('LockTimeout', 0) // NOWAIT
      .execute('sp_getapplock');

    const returnValue = result.returnValue;
    if (returnValue < 0) {
      return null; // Lock held by another session
    }

    // Auto-release after TTL (safety net)
    const timer = setTimeout(async () => {
      try {
        await pool.request()
          .input('Resource', name)
          .input('LockOwner', 'Session')
          .execute('sp_releaseapplock');
      } catch { /* ignore */ }
    }, ttlSeconds * 1000);
    timer.unref();

    return async () => {
      clearTimeout(timer);
      try {
        await pool.request()
          .input('Resource', name)
          .input('LockOwner', 'Session')
          .execute('sp_releaseapplock');
      } catch (err: any) { /* istanbul ignore next */
        logger.warn(`[Lock:SQL] Release failed for ${name}: ${err?.message}`);
      }
    };
  } catch (err: any) { /* istanbul ignore next */
    logger.warn(`[Lock:SQL] Acquire failed for ${name}: ${err?.message}`);
    return null;
  }
}
