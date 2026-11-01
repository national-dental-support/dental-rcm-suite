import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const HEADER = 'x-correlation-id';

/**
 * Distributed tracing middleware.
 *
 * - If the incoming request has an x-correlation-id header, it is preserved.
 * - Otherwise, a new UUID is generated.
 * - The correlation ID is attached to req, set on the response header,
 *   and available via getCorrelationId(req) for downstream logging.
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers[HEADER] as string) || crypto.randomUUID();
  (req as any).correlationId = id;
  res.setHeader(HEADER, id);
  next();
}

/** Extract correlation ID from a request. */
export function getCorrelationId(req: Request): string {
  return (req as any).correlationId || 'unknown';
}
