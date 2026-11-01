import { CircuitBreaker } from '../utils/circuit-breaker';
import { retry, isTransientError } from '../utils/retry';
import logger from '../utils/logger';

/**
 * Pre-configured circuit breakers for external services.
 *
 * Usage:
 *   import { ollamaBreaker, supersetBreaker } from '../services/external-services';
 *   const result = await ollamaBreaker.call(() => fetch(url));
 *
 * Or use the resilient fetch helper:
 *   import { resilientFetch } from '../services/external-services';
 *   const data = await resilientFetch('ollama', url, { timeoutMs: 5000 });
 */

export const ollamaBreaker = new CircuitBreaker({
  name: 'Ollama',
  threshold: 5,
  cooldownMs: 60_000,
});

export const supersetBreaker = new CircuitBreaker({
  name: 'Superset',
  threshold: 5,
  cooldownMs: 60_000,
});

export const externalApiBreaker = new CircuitBreaker({
  name: 'ExternalAPI',
  threshold: 10,
  cooldownMs: 30_000,
});

const breakers: Record<string, CircuitBreaker> = {
  ollama: ollamaBreaker,
  superset: supersetBreaker,
  external: externalApiBreaker,
};

export interface ResilientFetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Fetch with circuit breaker + retry + timeout.
 *
 * @param service - Which circuit breaker to use ('ollama', 'superset', 'external')
 * @param url - URL to fetch
 * @param opts - Options
 */
export async function resilientFetch(
  service: string,
  url: string,
  opts: ResilientFetchOptions = {},
): Promise<{ ok: boolean; status: number; body: string }> {
  const { method = 'GET', body, headers, timeoutMs = 10_000, maxRetries = 2 } = opts;
  const breaker = breakers[service] || externalApiBreaker;

  return breaker.call(() =>
    retry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method,
            signal: controller.signal,
            body,
            headers: {
              ...(body ? { 'Content-Type': 'application/json' } : {}),
              ...headers,
            },
          });
          clearTimeout(timer);
          const text = await res.text();
          if (res.status >= 500) {
            const err: any = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          return { ok: res.ok, status: res.status, body: text };
        } catch (err) {
          clearTimeout(timer);
          throw err;
        }
      },
      {
        maxRetries,
        initialDelayMs: 500,
        name: service,
        retryIf: isTransientError,
      },
    ),
  );
}

/** Get status of all circuit breakers. */
export function getCircuitBreakerStatus(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, cb] of Object.entries(breakers)) {
    result[name] = cb.status;
  }
  return result;
}
