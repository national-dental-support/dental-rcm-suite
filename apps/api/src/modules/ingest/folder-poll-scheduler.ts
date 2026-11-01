/**
 * Folder-poll scheduler - registered alongside existing node-cron schedulers.
 * On each tick: reads every active folder-source IngestConfiguration, scans the
 * configured folder for new files, processes them through the appropriate processor,
 * and moves processed/errored files to dated subfolders.
 */

import * as fs from 'fs';
import * as path from 'path';
import cron from 'node-cron';
import sql from 'mssql';
import logger from '../../utils/logger';
import Database from '../db';
import { runAsSystem } from '../rls-context';
import { parse835 } from '../edi-parser/x12-parser';
import { processEra } from './era-processor';
import { processEFT } from './eft-processor';
import { processEOB } from './eob-processor';

const POLL_DEFAULT_MINUTES = 5;

async function getActiveConfigs(): Promise<any[]> {
  try {
    const pool = Database.getInstance().getPool();
    const r = pool.request();
    const result = await r.query(`
      SELECT id, customer_id, ingest_type, folder_path, file_extensions, poll_interval_minutes
      FROM dbo.IngestConfiguration
      WHERE is_active = 1 AND source_type = 'folder'
        AND folder_path IS NOT NULL AND folder_path <> '';
    `);
    return result.recordset ?? [];
  } catch {
    return [];
  }
}

async function getProcessedFiles(configId: number): Promise<Set<string>> {
  try {
    const pool = Database.getInstance().getPool();
    const r = pool.request();
    r.input('cid', sql.Int, configId);
    const result = await r.query(`
      SELECT source_file FROM dbo.IngestRunLog
      WHERE config_id = @cid AND status IN ('success', 'processing');
    `);
    return new Set((result.recordset ?? []).map((row: any) => row.source_file as string));
  } catch {
    return new Set();
  }
}

function allowedExtensions(config: any): string[] {
  if (!config.file_extensions) return ['.x12', '.835', '.837', '.edi', '.json', '.pdf', '.html'];
  return config.file_extensions.split(',').map((e: string) => e.trim().toLowerCase());
}

function moveTo(src: string, subfolder: string): void {
  try {
    const dir = path.join(path.dirname(src), subfolder, new Date().toISOString().slice(0, 10));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, path.basename(src));
    fs.renameSync(src, dest);
  } catch (e) {
    logger.warn('folder-poll: could not move file', { src, subfolder, err: (e as Error).message });
  }
}

async function processFile(config: any, filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  const fileBuffer = fs.readFileSync(filePath);
  const fileName   = path.basename(filePath);
  const customerId = config.customer_id as number;
  const configId   = config.id as number;

  try {
    if (config.ingest_type === 'era') {
      const raw = fileBuffer.toString('utf-8');
      const parsed = parse835(raw);
      await processEra(parsed, customerId, fileName, configId, 'folder-poll');
    } else if (config.ingest_type === 'eft' && ext === '.json') {
      const eft = JSON.parse(fileBuffer.toString('utf-8'));
      await processEFT(eft, customerId, 'folder-poll', configId);
    } else if (config.ingest_type === 'eob') {
      const mime = ext === '.pdf' ? 'application/pdf' : 'text/html';
      await processEOB('UNKNOWN', fileBuffer, fileName, mime, customerId, 'folder-poll', 'folder-poll', configId);
    } else {
      logger.warn('folder-poll: unhandled ingest_type or extension', { ingest_type: config.ingest_type, ext });
      return;
    }
    moveTo(filePath, 'processed');
    logger.info('folder-poll: processed file', { file: fileName, type: config.ingest_type });
  } catch (err: any) {
    moveTo(filePath, 'errors');
    logger.error('folder-poll: failed to process file', { file: fileName, err: err?.message });
  }
}

async function pollOnce(): Promise<void> {
  const configs = await getActiveConfigs();
  for (const config of configs) {
    try {
      const folderPath = config.folder_path as string;
      if (!fs.existsSync(folderPath)) continue;

      const processed = await getProcessedFiles(config.id);
      const allowed = allowedExtensions(config);
      const entries = fs.readdirSync(folderPath);

      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
        const ext = path.extname(entry).toLowerCase();
        if (!allowed.includes(ext)) continue;
        if (processed.has(entry)) continue;

        await processFile(config, fullPath);
      }
    } catch (err: any) {
      logger.error('folder-poll: error scanning config', { configId: config.id, err: err?.message });
    }
  }
}

export function startFolderPollScheduler(): void {
  // Run every 5 minutes - aligns with the default poll_interval_minutes.
  // Individual configs with different intervals are handled on future enhancement;
  // polling at 5m covers all defaults and shorter intervals.
  cron.schedule('*/5 * * * *', async () => {
    try {
      // G7: background job legitimately operates cross-tenant under RLS
      await runAsSystem(() => pollOnce());
    } catch (err: any) {
      logger.error('folder-poll: unhandled error in scheduler tick', { err: err?.message });
    }
  });
  logger.info('folder-poll-scheduler: started (every 5 minutes)');
}
