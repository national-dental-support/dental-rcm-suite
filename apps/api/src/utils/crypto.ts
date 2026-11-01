import crypto from 'node:crypto';

/**
 * Field-level encryption for data at rest, using AES-256-GCM.
 *
 * The key comes from FIELD_ENCRYPTION_KEY as 64 hex characters (32 bytes). When
 * it is not set, encryption is not configured and callers must decide what to
 * do - nothing here silently stores plaintext.
 *
 * Ciphertext is a self-contained envelope so the IV and auth tag travel with the
 * value and a single string can be stored in one column:
 *
 *   v1.<iv base64>.<authTag base64>.<ciphertext base64>
 */

const ENVELOPE_VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function key(): Buffer {
  const raw = process.env['FIELD_ENCRYPTION_KEY'];
  if (!raw) {
    throw new Error('FIELD_ENCRYPTION_KEY is not set - refusing to encrypt or decrypt');
  }
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`FIELD_ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex characters`);
  }
  return buf;
}

export function isEncryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

function encryptToEnvelope(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

function decryptEnvelope(envelope: string): string {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error('Unrecognised ciphertext envelope');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Encrypts plaintext. Returns the {encrypted, iv} shape callers already expect;
 * iv is the sentinel 'sdk-v1' because the real IV travels inside the envelope.
 */
export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  return { encrypted: encryptToEnvelope(plaintext), iv: 'sdk-v1' };
}

/**
 * Decrypts a value produced by encrypt(), or one stored in the older format
 * where the IV lived in its own column.
 */
export function decrypt(encrypted: string, iv: string): string {
  if (iv === 'sdk-v1') return decryptEnvelope(encrypted);

  // Legacy rows: separate base64 IV column, ciphertext with the auth tag appended.
  const ivBuf = Buffer.from(iv, 'base64');
  const raw = Buffer.from(encrypted, 'base64');
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(0, raw.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), ivBuf);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
