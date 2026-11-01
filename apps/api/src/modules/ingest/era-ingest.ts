import type { ConnectionPool } from 'mssql';
import { parse835 } from '../edi-parser/x12-parser';
import { processEra } from './era-processor';

/**
 * Thin bridge used by the ERA auto-fetch scheduler.
 * Parses raw 835 EDI text and delegates to the existing processEra pipeline.
 */
export async function ingestRaw835(
  pool: ConnectionPool,
  raw835: string,
  connectionId: number,
): Promise<void> {
  const parsed = parse835(raw835);
  await processEra(parsed, 0, `sftp-connection-${connectionId}`, connectionId, 'auto');
}
