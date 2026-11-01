import crypto from 'crypto';
import logger from '../utils/logger';

/**
 * Field-level encryption for PHI fields (SSN, DOB, subscriber ID).
 * Uses AES-256-GCM with a key from environment variable FIELD_ENCRYPTION_KEY.
 * FIELD_ENCRYPTION_KEY is required in all environments - missing key is fatal.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

let encryptionKey: Buffer | null = null;

function getKey(): Buffer | null {
  if (encryptionKey) return encryptionKey;
  const keyHex = process.env.FIELD_ENCRYPTION_KEY;
  if (!keyHex) {
    // HIPAA Sec.164.312(a)(2)(iv) - encryption of ePHI at rest is required in all environments.
    logger.error('FATAL: FIELD_ENCRYPTION_KEY not set \u2014 server cannot start without PHI encryption');
    process.exit(1);
  }
  encryptionKey = Buffer.from(keyHex, 'hex');
  if (encryptionKey.length !== 32) {
    logger.error('FATAL: FIELD_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)');
    process.exit(1);
  }
  return encryptionKey;
}

/**
 * Encrypt a plaintext value. Returns `enc:<iv>:<tag>:<ciphertext>` (all hex).
 * Returns original value if no key configured.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  if (!key || !plaintext) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `enc:${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypt a value previously encrypted with encryptField.
 * If value doesn't start with 'enc:', returns as-is (legacy unencrypted data).
 */
export function decryptField(ciphertext: string): string {
  const key = getKey();
  if (!key || !ciphertext || !ciphertext.startsWith('enc:')) return ciphertext;

  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 4) return ciphertext;

    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encrypted = parts[3];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    logger.error('Field decryption failed', err);
    return '[decryption error]';
  }
}

/** List of PHI field names that should be encrypted at rest */
export const PHI_ENCRYPTED_FIELDS = [
  'ssn', 'SSN', 'social_security',
  'dob', 'DOB', 'date_of_birth', 'DateOfBirth',
  'subscriber_id', 'SubscriberID', 'subscriberId',
];

/**
 * Encrypt all PHI fields in an object before INSERT/UPDATE.
 * Operates on a shallow copy - does not mutate input.
 */
export function encryptPHIFields<T extends Record<string, any>>(data: T): T {
  const result = { ...data };
  for (const field of PHI_ENCRYPTED_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      (result as any)[field] = encryptField(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt all PHI fields in query result records.
 */
export function decryptPHIFields<T extends Record<string, any>>(records: T[]): T[] {
  return records.map(record => {
    const result = { ...record };
    for (const field of PHI_ENCRYPTED_FIELDS) {
      if (result[field] && typeof result[field] === 'string' && result[field].startsWith('enc:')) {
        (result as any)[field] = decryptField(result[field]);
      }
    }
    return result;
  });
}
