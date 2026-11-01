import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import logger from '../utils/logger';

/**
 * Global error handler that strips internal details from 500 responses.
 * Catches unhandled exceptions thrown by route handlers and returns a
 * generic error message in production. Stack traces are logged but never
 * sent to the client.
 */
export const safeErrorHandler: ErrorRequestHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // JSON parse errors - return generic message without internal details
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    res.status(400).json({ message: 'Invalid request body' });
    return;
  }

  logger.error(`Unhandled error: ${err?.stack || err}`);

  const statusCode = err?.statusCode || err?.status || 500;

  if (statusCode >= 500) {
    res.status(statusCode).json({ message: 'Internal server error' });
  } else {
    // For 4xx errors, pass through the message (these are intentional)
    res.status(statusCode).json({ message: err?.message || 'Request error' });
  }
};

/**
 * Wraps an async route handler to catch rejected promises and forward
 * them to the Express error handler instead of crashing the process.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
