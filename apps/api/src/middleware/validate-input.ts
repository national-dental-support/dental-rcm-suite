import { Request, Response, NextFunction } from 'express';

export interface FieldRule {
  required?: boolean;
  maxLength?: number;
  type?: 'string' | 'number' | 'boolean' | 'email';
  min?: number;
  max?: number;
}

export interface ValidationSchema {
  [field: string]: FieldRule;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Express middleware factory that validates req.body against a schema.
 *
 * Usage:
 *   router.post('/thing', validateBody({ name: { required: true, maxLength: 100 } }), handler);
 */
export function validateBody(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    const body = req.body ?? {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = body[field];

      // --- required ---
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue; // skip further checks for missing required fields
      }

      // If value not provided and not required, skip remaining checks
      if (value === undefined || value === null) {
        continue;
      }

      // --- type checks ---
      if (rules.type) {
        switch (rules.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`${field} must be a string`);
              continue;
            }
            break;
          case 'number':
            if (typeof value !== 'number' || Number.isNaN(value)) {
              errors.push(`${field} must be a number`);
              continue;
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`${field} must be a boolean`);
              continue;
            }
            break;
          case 'email':
            if (typeof value !== 'string' || !EMAIL_REGEX.test(value)) {
              errors.push(`${field} must be a valid email address`);
              continue;
            }
            break;
        }
      }

      // --- maxLength ---
      if (rules.maxLength !== undefined && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }

      // --- min / max (numeric) ---
      if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ message: 'Validation failed', errors });
      return;
    }

    next();
  };
}
