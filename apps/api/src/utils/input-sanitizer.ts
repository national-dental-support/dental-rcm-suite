/**
 * Input sanitization utilities for HIPAA/SOC2 compliant endpoints.
 *
 * - sanitizeText: strip HTML/script tags, limit length
 * - validateCdtCode: D followed by 4 digits
 * - validateToothNum: 1-32
 * - validateDate: YYYY-MM-DD format
 * - validatePatientId: positive integer
 * - validateAudioMime: allowed audio MIME types
 * - requireRole: role-based access guard
 */

/** Strip HTML tags and script content. Preserves clinical text. */
export function sanitizeText(input: string, maxLength = 10000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>') // restore legitimate chars
    .trim()
    .slice(0, maxLength);
}

/** Validate CDT/ADA code format: D followed by 4 digits */
export function isValidCdtCode(code: string): boolean {
  return typeof code === 'string' && /^D\d{4}$/.test(code);
}

/** Validate tooth number: 1-32 */
export function isValidToothNum(num: number): boolean {
  return Number.isInteger(num) && num >= 1 && num <= 32;
}

/** Validate date format: YYYY-MM-DD and parseable */
export function isValidDate(date: string): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

/** Validate positive integer (patient IDs, provider IDs, etc.) */
export function isPositiveInt(val: any): val is number {
  return Number.isInteger(val) && val > 0;
}

/** Validate audio MIME type against whitelist */
const ALLOWED_AUDIO_MIMES = new Set([
  'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3',
  'audio/mp4', 'audio/x-m4a', 'audio/aac',
  'application/octet-stream', // browsers sometimes use this
]);

export function isValidAudioMime(mime: string): boolean {
  return ALLOWED_AUDIO_MIMES.has(mime);
}

/** Validate surface code: uppercase letters M,O,D,B,L,I only, max 6 chars */
export function isValidSurface(surface: string): boolean {
  if (typeof surface !== 'string') return false;
  return /^[MODBLI]{1,6}$/.test(surface.toUpperCase());
}

/** Allowed condition types for odontogram */
const VALID_CONDITIONS = new Set([
  'caries', 'fracture', 'missing', 'impacted', 'crown', 'filling',
  'rct', 'implant', 'bridge', 'veneer', 'sealant', 'extraction',
  'periapical', 'abscess', 'recession', 'mobility',
]);

export function isValidConditionType(type: string): boolean {
  return typeof type === 'string' && VALID_CONDITIONS.has(type.toLowerCase());
}

/** Role hierarchy check - returns true if actor's role meets minimum requirement */
const ROLE_HIERARCHY: Record<string, number> = {
  'User': 0, 'AR Specialist': 1, 'Manager': 2, 'Admin': 3, 'Super Admin': 4,
};

export function hasMinRole(actorRole: string, minRole: string): boolean {
  return (ROLE_HIERARCHY[actorRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 99);
}

/** Clinical roles that should access clinical endpoints */
const CLINICAL_ROLES = new Set(['Admin', 'Super Admin', 'Manager', 'AR Specialist']);

export function isClinicalRole(role: string): boolean {
  return CLINICAL_ROLES.has(role);
}
