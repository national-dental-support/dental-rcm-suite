/**
 * Simple circuit breaker for external API calls.
 *
 * States:
 *  CLOSED     - normal operation; failures increment counter
 *  OPEN       - after threshold failures; all calls rejected immediately
 *  HALF_OPEN  - after cooldown; one probe call allowed through
 *
 * Usage:
 *   const cb = new CircuitBreaker({ threshold: 5, cooldownMs: 30_000 });
 *   const result = await cb.call(() => fetch('https://external-api/...'));
 */
import logger from './logger';

export class CircuitBreaker {
  private failures = 0;
  private lastFailureAt = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly name: string;

  constructor(opts: { threshold?: number; cooldownMs?: number; name?: string } = {}) {
    this.threshold = opts.threshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.name = opts.name ?? 'CircuitBreaker';
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    this.evaluateState();

    if (this.state === 'OPEN') {
      throw new Error(`[${this.name}] Circuit is OPEN \u2014 fast-failing request`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  get isOpen(): boolean {
    this.evaluateState();
    return this.state === 'OPEN';
  }

  get status(): string { return this.state; }

  private evaluateState(): void {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureAt >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        logger.warn(`[${this.name}] \u2192 HALF_OPEN (probe call allowed)`);
      }
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.warn(`[${this.name}] Probe succeeded \u2192 CLOSED`);
    }
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureAt = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Probe failed - stay OPEN
      this.state = 'OPEN';
      logger.warn(`[${this.name}] Probe failed \u2192 OPEN (cooldown reset)`);
    } else if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      logger.warn(`[${this.name}] Threshold reached (${this.failures} failures) \u2192 OPEN`);
    }
  }
}
