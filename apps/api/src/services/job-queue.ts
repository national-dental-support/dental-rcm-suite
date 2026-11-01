import logger from '../utils/logger';

/**
 * Async job queue abstraction.
 *
 * When REDIS_URL is set: uses Bull (Redis-backed) for distributed, persistent job processing.
 * When not set: uses an in-memory queue with basic retry support.
 *
 * Usage:
 *   import { enqueue, registerWorker } from '../services/job-queue';
 *
 *   // Producer
 *   await enqueue('priority-recalc', { customerId: 1 });
 *
 *   // Consumer (call once at startup)
 *   registerWorker('priority-recalc', async (data) => { ... });
 */

interface QueueJob {
  name: string;
  data: any;
  attempts: number;
  maxAttempts: number;
}

type WorkerFn = (data: any) => Promise<void>;

// -- In-memory fallback ------------------------------------------------------
const workers = new Map<string, WorkerFn>();
const pendingJobs: QueueJob[] = [];
let processingInterval: ReturnType<typeof setInterval> | null = null;

function startInMemoryProcessor(): void {
  if (processingInterval) return;
  processingInterval = setInterval(async () => {
    if (pendingJobs.length === 0) return;
    const job = pendingJobs.shift()!;
    const worker = workers.get(job.name);
    if (!worker) {
      logger.warn(`[JobQueue] No worker for job: ${job.name}`);
      return;
    }
    try {
      await worker(job.data);
    } catch (err: any) {
      /* istanbul ignore next */
      job.attempts++;
      /* istanbul ignore next */
      if (job.attempts < job.maxAttempts) {
        logger.warn(`[JobQueue] Job ${job.name} failed (attempt ${job.attempts}/${job.maxAttempts}): ${err?.message} \u2014 retrying`);
        pendingJobs.push(job);
      } else {
        logger.error(`[JobQueue] Job ${job.name} failed permanently after ${job.maxAttempts} attempts: ${err?.message}`);
      }
    }
  }, 1000);
  if (processingInterval.unref) processingInterval.unref();
}

// -- Bull (Redis) backend ----------------------------------------------------
let bullQueues: Map<string, any> | null = null;

function getBullQueue(name: string): any | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    if (!bullQueues) bullQueues = new Map();
    if (bullQueues.has(name)) return bullQueues.get(name);

    const Bull = require('bull');
    const queue = new Bull(name, redisUrl, {
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
    bullQueues.set(name, queue);

    /* istanbul ignore next */
    queue.on('failed', (job: any, err: any) => {
      logger.warn(`[JobQueue:Bull] Job ${name}#${job.id} failed: ${err?.message}`);
    });
    /* istanbul ignore next */
    queue.on('completed', (job: any) => {
      logger.info(`[JobQueue:Bull] Job ${name}#${job.id} completed`);
    });

    return queue;
  } catch {
    return null;
  }
}

// -- Public API --------------------------------------------------------------

export async function enqueue(name: string, data: any, opts?: { delay?: number }): Promise<void> {
  const bull = getBullQueue(name);
  if (bull) {
    await bull.add(data, { delay: opts?.delay });
    return;
  }

  // In-memory fallback
  pendingJobs.push({ name, data, attempts: 0, maxAttempts: 3 });
  startInMemoryProcessor();
}

export function registerWorker(name: string, fn: WorkerFn, concurrency = 1): void {
  const bull = getBullQueue(name);
  if (bull) {
    /* istanbul ignore next */
    bull.process(concurrency, async (job: any) => fn(job.data));
    logger.info(`[JobQueue:Bull] Worker registered: ${name} (concurrency=${concurrency})`);
    return;
  }

  // In-memory fallback
  workers.set(name, fn);
  startInMemoryProcessor();
  logger.info(`[JobQueue:InMemory] Worker registered: ${name}`);
}

export async function closeQueues(): Promise<void> {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
  if (bullQueues) {
    for (const [, queue] of bullQueues) {
      try { await queue.close(); } catch { /* ignore */ }
    }
    bullQueues = null;
  }
}
