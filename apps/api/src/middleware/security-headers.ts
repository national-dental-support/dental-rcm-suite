/**
 * Security middleware - HTTP headers, body size limits, and request sanitization.
 *
 * OWASP compliance:
 * - A01: Access control via existing requireRole + tenantClause
 * - A03: Input sanitization (strip HTML tags from strings)
 * - A04: Rate limiting via express-rate-limit (configured in routes)
 * - A05: Security headers via helmet
 * - A09: Security event logging
 */

import helmet from 'helmet';
import { Request, Response, NextFunction, Express } from 'express';
import logger from '../utils/logger';

/**
 * Apply all security middleware to an Express app.
 */
export function applySecurityMiddleware(app: Express): void {
  // HIPAA Sec.164.312(e)(1) - Transmission security: force HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Trust proxy headers (x-forwarded-proto) behind load balancer
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        return next();
      }
      // Allow health check endpoint over HTTP (Docker/container health probes)
      if (req.path === '/api/health-monitor') {
        return next();
      }
      // Allow local dev proxy (Angular ng serve proxies /api to http://127.0.0.1:8080)
      const host = req.headers.host ?? '';
      if (host.startsWith('127.0.0.1') || host.startsWith('localhost')) {
        return next();
      }
      // Redirect HTTP -> HTTPS
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    });
  }

  // Helmet: comprehensive security headers (OWASP A05)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],  // needed for Angular
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  }));

  // Body size limit - prevent DoS via large payloads
  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] ?? '0');
    if (contentLength > 10 * 1024 * 1024) {  // 10MB max
      return res.status(413).json({ message: 'Request body too large (max 10MB)' });
    }
    next();
  });

  // Sanitize string inputs in request body (strip HTML tags)
  app.use(sanitizeBody);

  // Log security-relevant events
  app.use(securityLogger);
}

/**
 * Recursively sanitize string values in request body.
 * Strips HTML tags to prevent XSS.
 */
function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj && typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[key] = sanitizeObject(value);
    }
    return cleaned;
  }
  return obj;
}

function sanitizeString(str: string): string {
  // Strip HTML tags (prevent stored XSS)
  let sanitized = str.replace(/<[^>]*>/g, '').trim();
  // Also strip javascript: and data: URIs
  sanitized = sanitized.replace(/javascript\s*:/gi, '').replace(/data\s*:\s*text\/html/gi, '');
  return sanitized;
}

/**
 * Log security-relevant request metadata.
 */
function securityLogger(req: Request, res: Response, next: NextFunction): void {
  // Log failed auth attempts
  res.on('finish', () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      logger.warn('Security event: auth failure', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        actor: req.headers['x-actor-email'],
      });
    }
  });
  next();
}
