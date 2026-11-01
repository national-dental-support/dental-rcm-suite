import logger from './logger';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  name?: string;
  retryIf?: (err: unknown) => boolean;
}

/** SQL Server and network error shapes that are worth another attempt. */
const TRANSIENT_CODES = new Set([
  'ETIMEOUT', 'ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND',
  'EPIPE', 'EAI_AGAIN', 'ETIMEDOUT',
]);

/** SQL Server error numbers for deadlocks, timeouts and transient failover. */
const TRANSIENT_SQL_NUMBERS = new Set([1205, 1222, 4060, 40197, 40501, 40613, 49918, 49919, 49920, 10928, 10929]);

export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; number?: unknown; message?: unknown };

  if (typeof e.code === 'string' && TRANSIENT_CODES.has(e.code)) return true;
  if (typeof e.number === 'number' && TRANSIENT_SQL_NUMBERS.has(e.number)) return true;

  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return msg.includes('deadlock') || msg.includes('timeout') || msg.includes('connection is closed');
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Runs `fn`, retrying transient failures with exponential backoff.
 *
 * Only retries what `retryIf` accepts - by default, transient transport and
 * SQL Server errors. A deterministic failure is raised immediately rather than
 * being attempted again, and the final failure is always rethrown so no caller
 * mistakes exhaustion for success.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 200,
    backoffMultiplier = 2,
    maxDelayMs = 5_000,
    name = 'operation',
    retryIf = isTransientError,
  } = options;

  let delay = initialDelayMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries || !retryIf(err)) {
        throw err;
      }

      logger.warn(`[Retry] ${name} failed, retrying`, {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });

      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  // Unreachable: the loop either returns or throws.
  throw lastError;
}
