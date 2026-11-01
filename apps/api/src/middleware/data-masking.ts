import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Role-based data masking middleware.
 * Masks sensitive fields based on user role level.
 *
 * Role hierarchy:
 *   User (0) -> AR Specialist (1) -> Manager (2) -> Training Admin (3) -> Admin (4) -> Super Admin (5)
 *
 * Masking rules:
 * - Role 0 (User/Training): SSN fully masked, DOB masked, subscriber ID masked
 * - Role 1 (AR Specialist): SSN last 4, DOB visible, subscriber ID visible
 * - Role 2 (Manager): SSN last 4, all else visible
 * - Role 3+ (Admin): Full access, no masking
 */

export interface MaskingRule {
  field: string;
  /** Role level at or above which the field is fully visible */
  visibleAbove: number;
  /** Masking function */
  mask: (value: string) => string;
}

const DEFAULT_MASKING_RULES: MaskingRule[] = [
  {
    field: 'ssn',
    visibleAbove: 3,
    mask: (v: string) => v.length >= 4 ? `***-**-${v.slice(-4)}` : '***-**-****',
  },
  {
    field: 'SSN',
    visibleAbove: 3,
    mask: (v: string) => v.length >= 4 ? `***-**-${v.slice(-4)}` : '***-**-****',
  },
  {
    field: 'social_security',
    visibleAbove: 3,
    mask: (v: string) => v.length >= 4 ? `***-**-${v.slice(-4)}` : '***-**-****',
  },
  {
    field: 'dob',
    visibleAbove: 1,
    mask: (_v: string) => '**/**/****',
  },
  {
    field: 'DOB',
    visibleAbove: 1,
    mask: (_v: string) => '**/**/****',
  },
  {
    field: 'date_of_birth',
    visibleAbove: 1,
    mask: (_v: string) => '**/**/****',
  },
  {
    field: 'DateOfBirth',
    visibleAbove: 1,
    mask: (_v: string) => '**/**/****',
  },
  {
    field: 'subscriber_id',
    visibleAbove: 1,
    mask: (v: string) => v.length > 4 ? `${'*'.repeat(v.length - 4)}${v.slice(-4)}` : '****',
  },
  {
    field: 'SubscriberID',
    visibleAbove: 1,
    mask: (v: string) => v.length > 4 ? `${'*'.repeat(v.length - 4)}${v.slice(-4)}` : '****',
  },
  {
    field: 'subscriberId',
    visibleAbove: 1,
    mask: (v: string) => v.length > 4 ? `${'*'.repeat(v.length - 4)}${v.slice(-4)}` : '****',
  },
];

const ROLE_LEVELS: Record<string, number> = {
  'User': 0,
  'AR Specialist': 1,
  'Manager': 2,
  'Training Admin': 3,
  'Admin': 4,
  'Super Admin': 5,
};

/**
 * Apply data masking to a single record based on user's role level.
 */
export function maskRecord<T extends Record<string, any>>(
  record: T,
  roleLevel: number,
  rules: MaskingRule[] = DEFAULT_MASKING_RULES,
): T {
  const result = { ...record };
  for (const rule of rules) {
    if (result[rule.field] && typeof result[rule.field] === 'string' && roleLevel < rule.visibleAbove) {
      (result as any)[rule.field] = rule.mask(result[rule.field]);
    }
  }
  return result;
}

/**
 * Apply data masking to an array of records.
 */
export function maskRecords<T extends Record<string, any>>(
  records: T[],
  roleLevel: number,
  rules: MaskingRule[] = DEFAULT_MASKING_RULES,
): T[] {
  return records.map(r => maskRecord(r, roleLevel, rules));
}

/**
 * Get the numeric role level from a role name string.
 */
export function getRoleLevel(roleName: string): number {
  return ROLE_LEVELS[roleName] ?? 0;
}

/**
 * Express middleware that attaches masking function to res.locals.
 * Routes can call `res.locals.maskData(records)` to apply masking.
 *
 * Requires x-actor-role header or reads from req.user.
 */
export function dataMaskingMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const role = (req as any).actor?.role || 'User';
  const level = getRoleLevel(role);
  (req as any).maskData = <T extends Record<string, any>>(records: T[]): T[] => {
    return maskRecords(records, level);
  };
  (req as any).maskRecord = <T extends Record<string, any>>(record: T): T => {
    return maskRecord(record, level);
  };
  (req as any).roleLevel = level;
  next();
}
