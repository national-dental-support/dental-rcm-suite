/**
 * Generic Zod validation middleware for Express routes.
 *
 * Usage:
 *   import { validate, z } from '../middleware/validate';
 *   router.post('/items', validate(z.object({ name: z.string().min(1).max(200) })), handler);
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export { z } from 'zod';

/**
 * Express middleware that validates req.body against a Zod schema.
 * Returns 400 with descriptive errors on validation failure.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data;
      next();
    } else {
      const errors = ((result.error as any).issues ?? []).map((e: any) => ({
        field: (e.path ?? []).join('.'),
        message: e.message,
      }));
      return res.status(400).json({ message: 'Validation failed', errors });
    }
  };
}

/**
 * Validate query parameters.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (result.success) {
      req.query = result.data as any;
      next();
    } else {
      const errors = ((result.error as any).issues ?? []).map((e: any) => ({
        field: (e.path ?? []).join('.'),
        message: e.message,
      }));
      return res.status(400).json({ message: 'Invalid query parameters', errors });
    }
  };
}

// -- Common Schemas ----------------------------------------------------------

/** Positive integer (for IDs) */
export const positiveInt = z.number().int().positive();
export const positiveIntString = z.string().regex(/^\d+$/).transform(Number);

/** Safe string (trimmed, max length, no HTML) */
export const safeString = (maxLen: number = 500) =>
  z.string().trim().max(maxLen);

/** ISO date string */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Optional ISO date */
export const optionalDate = isoDate.optional().nullable();

/** Pagination params */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});
