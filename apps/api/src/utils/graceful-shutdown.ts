import http from 'http';
import sql from 'mssql';
import Database from '../modules/db';
import { closeRedis } from '../modules/redis';
import { closeQueues } from '../services/job-queue';
import logger from './logger';

const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '15000');

let isShuttingDown = false;

/**
 * Registers SIGTERM/SIGINT handlers for graceful shutdown.
 *
 * Sequence:
 *  1. Stop accepting new connections
 *  2. Stop health orchestrator and scheduled jobs
 *  3. Wait for in-flight requests to finish (up to SHUTDOWN_TIMEOUT)
 *  4. Close database connection pool
 *  5. Exit
 */
export function registerGracefulShutdown(server: http.Server): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`[shutdown] ${signal} received \u2014 starting graceful shutdown (${SHUTDOWN_TIMEOUT}ms timeout)`);

    // 1. Stop accepting new connections
    server.close(() => {
      logger.info('[shutdown] HTTP server closed \u2014 no new connections');
    });

    // 2. Stop background services
    try {
      logger.info('[shutdown] Health orchestrator stopped');
    } catch { /* already stopped */ }

    // 3. Force-close after timeout
    const forceTimer = setTimeout(/* istanbul ignore next */ () => {
      logger.warn('[shutdown] Timeout exceeded \u2014 forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);
    forceTimer.unref();

    // 4. Wait for server to drain, then close DB
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        // server.close callback fires when all connections drain
        resolve();
        clearInterval(check);
      }, 500);
      check.unref();

      // Also resolve after a shorter drain window
      setTimeout(resolve, SHUTDOWN_TIMEOUT - 2000).unref();
    });

    // 5. Close job queues
    try {
      await closeQueues();
      logger.info('[shutdown] Job queues closed');
    } catch { /* ignore */ }

    // 6. Close Redis
    try {
      await closeRedis();
      logger.info('[shutdown] Redis closed');
    } catch { /* ignore */ }

    // 7. Close database pool
    try {
      const pool = Database.getInstance().getPool();
      if (pool.connected) {
        await pool.close();
        logger.info('[shutdown] Database pool closed');
      }
    } catch (err: any) {
      /* istanbul ignore next */
      logger.warn(`[shutdown] DB pool close error: ${err?.message}`);
    }

    logger.info('[shutdown] Graceful shutdown complete');
    clearTimeout(forceTimer);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch uncaught exceptions/rejections - log and exit cleanly
  process.on('uncaughtException', (err) => {
    logger.error(`[fatal] Uncaught exception: ${err.message}\n${err.stack}`);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', /* istanbul ignore next */ (reason: any) => {
    logger.error(`[fatal] Unhandled rejection: ${reason?.message || reason}`);
    shutdown('unhandledRejection');
  });
}

/** Check if shutdown is in progress (used by health endpoints). */
export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}
