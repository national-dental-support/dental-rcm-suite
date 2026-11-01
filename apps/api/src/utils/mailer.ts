import nodemailer from 'nodemailer';
import logger from './logger';
import { enqueue, registerWorker } from '../services/job-queue';

// Derived from createTransport rather than written as nodemailer.Transporter,
// which is not exposed as a namespace by the current type definitions.
type MailTransporter = ReturnType<typeof nodemailer.createTransport>;

let transporter: MailTransporter | null = null;
let workerRegistered = false;

function getTransporter(): MailTransporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

/**
 * Register the email worker for processing queued emails.
 * Call once at startup.
 */
export function initMailWorker(): void {
  if (workerRegistered) return;
  workerRegistered = true;

  registerWorker('send-email', async (data: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) => {
    const t = getTransporter();
    if (!t) {
      logger.warn('[Mailer] SMTP_HOST not configured \u2014 dropping queued email');
      return;
    }
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'alerts@rcm.local',
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });
    logger.info(`[Mailer] Sent "${data.subject}" to ${data.to}`);
  });

  logger.info('[Mailer] Email worker registered (retry-enabled via job queue)');
}

/**
 * Send an email with automatic retry via the job queue.
 *
 * If the queue is available (Redis or in-memory), the email is enqueued
 * for reliable delivery with 3 retries and exponential backoff.
 * Falls back to direct send if queue is unavailable.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  // Ensure worker is registered
  if (!workerRegistered) initMailWorker();

  const t = getTransporter();
  if (!t) {
    logger.warn('[Mailer] SMTP_HOST not configured \u2014 skipping email');
    return;
  }

  // Try to enqueue for reliable delivery with retries
  try {
    await enqueue('send-email', opts);
    return;
  } catch {
    // Queue unavailable - fall through to direct send
  }

  // Direct send fallback (no retry)
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'alerts@rcm.local',
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    logger.info(`[Mailer] Sent "${opts.subject}" to ${opts.to}`);
  } catch (err: any) {
    /* istanbul ignore next */
    logger.error('[Mailer] Send failed: ' + (err?.message || ''));
  }
}
