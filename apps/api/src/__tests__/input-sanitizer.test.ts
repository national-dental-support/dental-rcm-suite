/**
 * Unit tests for input-sanitizer utilities.
 * 100% coverage of all validation and sanitization functions.
 */

import {
  sanitizeText, isValidCdtCode, isValidToothNum, isValidDate,
  isPositiveInt, isValidAudioMime, isValidSurface, isValidConditionType,
  hasMinRole, isClinicalRole,
} from '../utils/input-sanitizer';

describe('sanitizeText', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<b>bold</b> text')).toBe('bold text');
  });
  it('strips script tags and content', () => {
    expect(sanitizeText('hello<script>alert("xss")</script>world')).toBe('helloworld');
  });
  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });
  it('enforces max length', () => {
    expect(sanitizeText('abcdefghij', 5)).toBe('abcde');
  });
  it('handles empty string', () => {
    expect(sanitizeText('')).toBe('');
  });
  it('handles non-string input', () => {
    expect(sanitizeText(null as any)).toBe('');
    expect(sanitizeText(123 as any)).toBe('');
    expect(sanitizeText(undefined as any)).toBe('');
  });
  it('preserves clinical text with special chars', () => {
    expect(sanitizeText('Patient has 2+ caries (MOD)')).toBe('Patient has 2+ caries (MOD)');
  });
  it('handles nested HTML', () => {
    expect(sanitizeText('<div><p>text</p></div>')).toBe('text');
  });
  it('handles unicode/emoji', () => {
    expect(sanitizeText('Tooth \uD83E\uDDB7 pain')).toBe('Tooth \uD83E\uDDB7 pain');
  });
});

describe('isValidCdtCode', () => {
  it('accepts valid codes', () => {
    expect(isValidCdtCode('D2392')).toBe(true);
    expect(isValidCdtCode('D0120')).toBe(true);
    expect(isValidCdtCode('D9999')).toBe(true);
  });
  it('rejects invalid codes', () => {
    expect(isValidCdtCode('D123')).toBe(false);   // too short
    expect(isValidCdtCode('D12345')).toBe(false);  // too long
    expect(isValidCdtCode('X2392')).toBe(false);   // wrong prefix
    expect(isValidCdtCode('2392')).toBe(false);    // no prefix
    expect(isValidCdtCode('')).toBe(false);
    expect(isValidCdtCode('DABCD')).toBe(false);   // non-numeric
  });
  it('rejects non-string', () => {
    expect(isValidCdtCode(null as any)).toBe(false);
    expect(isValidCdtCode(2392 as any)).toBe(false);
  });
});

describe('isValidToothNum', () => {
  it('accepts 1-32', () => {
    expect(isValidToothNum(1)).toBe(true);
    expect(isValidToothNum(16)).toBe(true);
    expect(isValidToothNum(32)).toBe(true);
  });
  it('rejects out of range', () => {
    expect(isValidToothNum(0)).toBe(false);
    expect(isValidToothNum(33)).toBe(false);
    expect(isValidToothNum(-1)).toBe(false);
    expect(isValidToothNum(100)).toBe(false);
  });
  it('rejects non-integer', () => {
    expect(isValidToothNum(1.5)).toBe(false);
    expect(isValidToothNum(NaN)).toBe(false);
  });
});

describe('isValidDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(isValidDate('2026-03-29')).toBe(true);
    expect(isValidDate('2025-01-01')).toBe(true);
    expect(isValidDate('2026-12-31')).toBe(true);
  });
  it('rejects wrong format', () => {
    expect(isValidDate('03/29/2026')).toBe(false);
    expect(isValidDate('2026-3-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('not-a-date')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });
  it('rejects non-string', () => {
    expect(isValidDate(null as any)).toBe(false);
    expect(isValidDate(20260329 as any)).toBe(false);
  });
});

describe('isPositiveInt', () => {
  it('accepts positive integers', () => {
    expect(isPositiveInt(1)).toBe(true);
    expect(isPositiveInt(999999)).toBe(true);
  });
  it('rejects zero and negative', () => {
    expect(isPositiveInt(0)).toBe(false);
    expect(isPositiveInt(-1)).toBe(false);
  });
  it('rejects non-integer', () => {
    expect(isPositiveInt(1.5)).toBe(false);
    expect(isPositiveInt(NaN)).toBe(false);
    expect(isPositiveInt('1')).toBe(false);
    expect(isPositiveInt(null)).toBe(false);
  });
});

describe('isValidAudioMime', () => {
  it('accepts allowed types', () => {
    expect(isValidAudioMime('audio/wav')).toBe(true);
    expect(isValidAudioMime('audio/webm')).toBe(true);
    expect(isValidAudioMime('audio/ogg')).toBe(true);
    expect(isValidAudioMime('audio/mpeg')).toBe(true);
    expect(isValidAudioMime('audio/mp4')).toBe(true);
    expect(isValidAudioMime('application/octet-stream')).toBe(true);
  });
  it('rejects disallowed types', () => {
    expect(isValidAudioMime('video/mp4')).toBe(false);
    expect(isValidAudioMime('text/html')).toBe(false);
    expect(isValidAudioMime('application/javascript')).toBe(false);
    expect(isValidAudioMime('')).toBe(false);
  });
});

describe('isValidSurface', () => {
  it('accepts valid surfaces', () => {
    expect(isValidSurface('M')).toBe(true);
    expect(isValidSurface('MOD')).toBe(true);
    expect(isValidSurface('MODBL')).toBe(true);
    expect(isValidSurface('DI')).toBe(true);
  });
  it('rejects invalid surfaces', () => {
    expect(isValidSurface('')).toBe(false);
    expect(isValidSurface('X')).toBe(false);
    expect(isValidSurface('MODBLIX')).toBe(false); // too long
    expect(isValidSurface('mod')).toBe(true); // case insensitive via toUpperCase
  });
  it('rejects non-string', () => {
    expect(isValidSurface(null as any)).toBe(false);
    expect(isValidSurface(123 as any)).toBe(false);
  });
});

describe('isValidConditionType', () => {
  it('accepts all valid conditions', () => {
    const valid = ['caries', 'fracture', 'missing', 'impacted', 'crown', 'filling',
      'rct', 'implant', 'bridge', 'veneer', 'sealant', 'extraction',
      'periapical', 'abscess', 'recession', 'mobility'];
    for (const c of valid) expect(isValidConditionType(c)).toBe(true);
  });
  it('rejects invalid conditions', () => {
    expect(isValidConditionType('invalid')).toBe(false);
    expect(isValidConditionType('')).toBe(false);
    expect(isValidConditionType('CARIES')).toBe(true); // case insensitive
  });
  it('rejects non-string', () => {
    expect(isValidConditionType(null as any)).toBe(false);
  });
});

describe('hasMinRole', () => {
  it('checks role hierarchy correctly', () => {
    expect(hasMinRole('Super Admin', 'AR Specialist')).toBe(true);
    expect(hasMinRole('Admin', 'AR Specialist')).toBe(true);
    expect(hasMinRole('AR Specialist', 'AR Specialist')).toBe(true);
    expect(hasMinRole('User', 'AR Specialist')).toBe(false);
    expect(hasMinRole('Manager', 'Admin')).toBe(false);
    expect(hasMinRole('Admin', 'Admin')).toBe(true);
    expect(hasMinRole('Super Admin', 'Super Admin')).toBe(true);
  });
  it('handles unknown roles', () => {
    expect(hasMinRole('Unknown', 'AR Specialist')).toBe(false);
  });
});

describe('isClinicalRole', () => {
  it('accepts clinical roles', () => {
    expect(isClinicalRole('Admin')).toBe(true);
    expect(isClinicalRole('Super Admin')).toBe(true);
    expect(isClinicalRole('Manager')).toBe(true);
    expect(isClinicalRole('AR Specialist')).toBe(true);
  });
  it('rejects non-clinical roles', () => {
    expect(isClinicalRole('User')).toBe(false);
    expect(isClinicalRole('')).toBe(false);
    expect(isClinicalRole('Patient')).toBe(false);
  });
});
