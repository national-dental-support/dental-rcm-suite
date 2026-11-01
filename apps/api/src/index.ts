import server from './app';
import config from './config';
import https from 'https';
import fs from 'fs';
import http from 'http';
import { startReportScheduler } from './schedulers/report-scheduler';
import { startPriorityScheduler } from './schedulers/priority-scheduler';
import { startInactivityCheck } from './schedulers/inactivity-check';
import sql from 'mssql';
import Database from './modules/db';
import { registerGracefulShutdown } from './utils/graceful-shutdown';
import { getRedis } from './modules/redis';
import { startSlaViolationCheck } from './schedulers/sla-violation-check';
import { startOverflowCheck } from './schedulers/overflow-check';
import { startPendingExpiryScheduler } from './schedulers/pending-expiry';
import { startAppealOverdueScheduler } from './schedulers/appeal-overdue-check';
import { startEscalationPathScheduler } from './schedulers/escalation-path';
import { startDataQualityScan } from './schedulers/data-quality-scan';
import { startAiAlertDetectionScheduler } from './schedulers/ai-alert-detection';
import { startDenialAutomationScheduler } from './schedulers/denial-automation-scheduler';
import { startClaimVisionScheduler } from './schedulers/claim-vision-scheduler';
import { startFolderPollScheduler } from './modules/ingest/folder-poll-scheduler';

const httpServer = server.listen(Number(config.port), '0.0.0.0', () => {
  console.log(`${config.name} ${config.version}`);
  console.log(
    `Listening on ${config.port} with NODE_ENV=${config.nodeEnv}`,
  );

  // Register graceful shutdown handlers (SIGTERM/SIGINT)
  registerGracefulShutdown(httpServer as unknown as http.Server);

  // Initialize Redis (optional - logs status, no-op if REDIS_URL not set)
  getRedis();

  // Start the scheduled report cron
  startReportScheduler();

  // Start priority recalculation cron
  startPriorityScheduler();

  // Start HIPAA/SOC2 inactivity auto-disable (daily at 2 AM UTC)
  startInactivityCheck();

  // Start cross-service health orchestrator (checks all 5 services every 60s)

  // Start consent form expiration check (daily at 3 AM UTC)

  // Start RPM alert escalation (every 15 minutes)

  // Start SLA violation checker (every 30 minutes)
  startSlaViolationCheck();

  // Start queue overflow checker (every 15 minutes)
  startOverflowCheck();

  // Start pending claim expiry (hourly)
  startPendingExpiryScheduler();

  // Start appeal overdue check (daily 07:15 UTC)
  startAppealOverdueScheduler();


  // Start multi-level escalation path processor (every 30 minutes)
  startEscalationPathScheduler();

  // Start data quality scanner (daily at 4 AM UTC)
  startDataQualityScan();

  // Start AI alert detection - runs for all customers at 6 AM and 12 PM UTC
  startAiAlertDetectionScheduler();

  // Start denial automation - auto-scores denied claims every 5 minutes
  startDenialAutomationScheduler();

  // Start ClaimVision rule evaluation - evaluates custom rules against all claims nightly at 2 AM
  startClaimVisionScheduler();

  // Start ingest folder-poll - checks configured drop folders every 5 minutes
  startFolderPollScheduler();


  // Bootstrap: post-startup tasks run after DB pool is ready.
  // Migrations are handled by startup.sh (scripts/migrate.js) before this
  // process starts; this block handles first-run config and identity reseed only.
  setTimeout(async () => {
    const pool = Database.getInstance().getPool();

    // Start embedded SFTP server and generate print driver crypto material (first-run only)
    try {
    } catch (err: any) {
      console.error('[startup] Print driver setup error:', err?.message ?? err);
    }

    // Fix identity seed gaps on tables that use IDENTITY_INSERT during seeding
    try {
      await pool.request().query(`
        DECLARE @maxId INT;
        SELECT @maxId = ISNULL(MAX(id), 0) FROM dbo.ManagerSpecialistAssignment;
        IF @maxId > 0 DBCC CHECKIDENT ('ManagerSpecialistAssignment', RESEED, @maxId);
      `);
    } catch { /* table may not exist yet */ }

    // Schema and the bootstrap administrator are applied by db/migrate.js,
    // not at startup. This suite ships no demo or sample data, so there is
    // nothing to seed here - see docs/first-install.md.
  }, 4000);
});
