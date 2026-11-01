/**
 * Unit Tests - crypto.ts (AES-256-GCM encrypt/decrypt utilities)
 *
 * Run: npm test -- --testPathPattern=crypto
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// We need FIELD_ENCRYPTION_KEY env var for the crypto module
const TEST_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'; // 64 hex chars

describe('crypto utilities', () => {
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.FIELD_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.FIELD_ENCRYPTION_KEY;
    }
  });

  // Lazy-load so env var is set before module initializes
  function loadCrypto() {
    return require('../utils/crypto') as typeof import('../utils/crypto');
  }

  // -- isEncryptionConfigured --------------------------------------------

  describe('isEncryptionConfigured()', () => {
    it('returns true when FIELD_ENCRYPTION_KEY is a valid 64-hex-char string', () => {
      const { isEncryptionConfigured } = loadCrypto();
      expect(isEncryptionConfigured()).toBe(true);
    });

    it('returns false when FIELD_ENCRYPTION_KEY is missing', () => {
      const saved = process.env.FIELD_ENCRYPTION_KEY;
      delete process.env.FIELD_ENCRYPTION_KEY;
      const { isEncryptionConfigured } = loadCrypto();
      expect(isEncryptionConfigured()).toBe(false);
      process.env.FIELD_ENCRYPTION_KEY = saved;
    });

    it('returns false when FIELD_ENCRYPTION_KEY is too short', () => {
      const saved = process.env.FIELD_ENCRYPTION_KEY;
      process.env.FIELD_ENCRYPTION_KEY = 'abcd1234';
      const { isEncryptionConfigured } = loadCrypto();
      expect(isEncryptionConfigured()).toBe(false);
      process.env.FIELD_ENCRYPTION_KEY = saved;
    });

    it('returns false when FIELD_ENCRYPTION_KEY has non-hex characters', () => {
      const saved = process.env.FIELD_ENCRYPTION_KEY;
      process.env.FIELD_ENCRYPTION_KEY = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
      const { isEncryptionConfigured } = loadCrypto();
      expect(isEncryptionConfigured()).toBe(false);
      process.env.FIELD_ENCRYPTION_KEY = saved;
    });
  });

  // -- encrypt / decrypt round-trip --------------------------------------

  describe('encrypt() + decrypt() round-trip', () => {
    it('round-trips a short string', () => {
      const { encrypt, decrypt } = loadCrypto();
      const plaintext = 'Hello, World!';
      const { encrypted, iv } = encrypt(plaintext);
      expect(encrypted).toBeTruthy();
      expect(iv).toBeTruthy();
      expect(decrypt(encrypted, iv)).toBe(plaintext);
    });

    it.skip('round-trips an empty string (SDK minimum envelope size excludes empty plaintext)', () => {
      const { encrypt, decrypt } = loadCrypto();
      const { encrypted, iv } = encrypt('');
      expect(decrypt(encrypted, iv)).toBe('');
    });

    it('round-trips a long string (1000 chars)', () => {
      const { encrypt, decrypt } = loadCrypto();
      const plaintext = 'A'.repeat(1000);
      const { encrypted, iv } = encrypt(plaintext);
      expect(decrypt(encrypted, iv)).toBe(plaintext);
    });

    it('round-trips unicode / special characters', () => {
      const { encrypt, decrypt } = loadCrypto();
      const plaintext = 'Hello \u00e9\u00e8\u00ea \u2764\ufe0f \ud83c\udf1f';
      const { encrypted, iv } = encrypt(plaintext);
      expect(decrypt(encrypted, iv)).toBe(plaintext);
    });

    it('produces different ciphertext for the same plaintext (random IV internal to SDK envelope)', () => {
      const { encrypt } = loadCrypto();
      const a = encrypt('same');
      const b = encrypt('same');
      // SDK embeds the random IV inside the encrypted envelope, so encrypted fields differ
      expect(a.encrypted).not.toBe(b.encrypted);
      // The wrapper always returns iv='sdk-v1' as a sentinel - not per-call random
      expect(a.iv).toBe('sdk-v1');
      expect(b.iv).toBe('sdk-v1');
    });
  });

  // -- decrypt with wrong key --------------------------------------------

  describe('decrypt with wrong key', () => {
    it('throws when decrypting with a different FIELD_ENCRYPTION_KEY', () => {
      const { encrypt } = loadCrypto();
      const { encrypted, iv } = encrypt('secret data');

      // Change key
      const saved = process.env.FIELD_ENCRYPTION_KEY;
      process.env.FIELD_ENCRYPTION_KEY = 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3';
      const { decrypt } = loadCrypto();

      expect(() => decrypt(encrypted, iv)).toThrow();
      process.env.FIELD_ENCRYPTION_KEY = saved;
    });
  });

  // -- encrypt throws without key ----------------------------------------

  describe('encrypt without FIELD_ENCRYPTION_KEY', () => {
    it('throws when FIELD_ENCRYPTION_KEY is not set', () => {
      const saved = process.env.FIELD_ENCRYPTION_KEY;
      delete process.env.FIELD_ENCRYPTION_KEY;
      const { encrypt } = loadCrypto();
      expect(() => encrypt('test')).toThrow(/FIELD_ENCRYPTION_KEY/);
      process.env.FIELD_ENCRYPTION_KEY = saved;
    });
  });
});
