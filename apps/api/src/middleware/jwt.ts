import type { Request, RequestHandler, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

/**
 * Verifies the caller's session token and publishes the acting identity as
 * request headers for the rest of the chain.
 *
 * This is the single point at which "who is calling" is established. Everything
 * downstream - resolveActor, requireRole, requireSubscription, RLS, masking,
 * audit - reads the headers set here and never inspects the token itself.
 *
 * Two token shapes are accepted:
 *
 *   1. A session token issued by POST /api/auth/login, signed with JWT_SECRET.
 *      This is the default and the only path a fresh install needs.
 *   2. An OIDC token from an external identity provider, when one is configured
 *      through OIDC_ISSUER / OIDC_AUDIENCE / OIDC_JWKS_URL. No provider-specific
 *      values are compiled in; single sign-on is entirely a deployment choice.
 *
 * Headers set on success:
 *   x-actor-email      - the acting user's email, lowercased
 *   x-actor-token-iat  - the token's issued-at, used by the idle-session check
 *   x-actor-oid        - the provider subject, in OIDC mode only
 */

export interface SessionClaims {
  email: string;
  /** Set while the seeded bootstrap password is still in place. */
  mustChangePassword?: boolean;
  iat?: number;
  exp?: number;
}

const SESSION_TTL = process.env['SESSION_TTL'] || '12h';

/** Routes reachable before a password change, so the account can be recovered. */
const PASSWORD_CHANGE_ALLOWLIST = ['/api/auth/change-password', '/api/auth/logout'];

function secret(): string {
  const s = process.env['JWT_SECRET'];
  if (!s) {
    // Fail closed: a missing signing secret must never degrade to "allow".
    throw new Error('JWT_SECRET is not set - refusing to verify or issue session tokens');
  }
  return s;
}

/** Mint a session token for an authenticated user. */
export function signSession(claims: SessionClaims): string {
  return jwt.sign(
    { email: claims.email.toLowerCase(), mustChangePassword: !!claims.mustChangePassword },
    secret(),
    { expiresIn: SESSION_TTL as any },
  );
}

function oidcConfigured(): boolean {
  return !!(process.env['OIDC_ISSUER'] && process.env['OIDC_JWKS_URL']);
}

/**
 * Verify an OIDC token against the configured provider's JWKS.
 *
 * Kept deliberately small: the suite does not read roles, groups or tenant
 * claims from a provider token. It establishes the email only - the user's role
 * and tenant still come from this system's own user table.
 */
async function verifyOidc(token: string): Promise<{ email: string; oid?: string; iat?: number }> {
  // Imported lazily so a local-auth install never loads the JWKS client.
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const jwks = createRemoteJWKSet(new URL(process.env['OIDC_JWKS_URL'] as string));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: process.env['OIDC_ISSUER'],
    audience: process.env['OIDC_AUDIENCE'],
  });

  const email =
    (payload['email'] as string) ||
    (payload['preferred_username'] as string) ||
    (payload['upn'] as string);
  if (!email) throw new Error('token carries no email claim');

  return {
    email,
    oid: (payload.sub as string) || undefined,
    iat: typeof payload.iat === 'number' ? payload.iat : undefined,
  };
}

const verifyToken: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ message: 'Authentication required', code: 'AUTH_MISSING_TOKEN' });
    return;
  }

  // Never let a caller assert its own identity.
  delete req.headers['x-actor-email'];
  delete req.headers['x-actor-oid'];
  delete req.headers['x-actor-token-iat'];

  try {
    if (oidcConfigured()) {
      const claims = await verifyOidc(token);
      req.headers['x-actor-email'] = claims.email.toLowerCase();
      if (claims.oid) req.headers['x-actor-oid'] = claims.oid;
      if (claims.iat != null) req.headers['x-actor-token-iat'] = String(claims.iat);
      next();
      return;
    }

    const claims = jwt.verify(token, secret()) as SessionClaims;
    if (!claims?.email) throw new Error('token carries no email claim');

    // A bootstrap account must change its password before reaching anything else.
    //
    // Compared against baseUrl + path, not path alone. Inside
    // app.use('/api', ...) req.path is '/auth/change-password' with the '/api'
    // in baseUrl, so matching on req.path alone never matched any entry in the
    // allowlist - which left the one route a bootstrap account must reach
    // permanently blocked, and the first install impossible to complete.
    // baseUrl + path reconstructs the full path wherever this is mounted.
    const fullPath = `${req.baseUrl || ''}${req.path}`;
    if (claims.mustChangePassword && !PASSWORD_CHANGE_ALLOWLIST.includes(fullPath)) {
      res.status(403).json({
        message: 'Password change required before continuing',
        code: 'AUTH_PASSWORD_CHANGE_REQUIRED',
      });
      return;
    }

    req.headers['x-actor-email'] = claims.email.toLowerCase();
    if (claims.iat != null) req.headers['x-actor-token-iat'] = String(claims.iat);
    next();
  } catch (err) {
    logger.warn('[Auth] token rejected', { error: err instanceof Error ? err.message : String(err) });
    res.status(401).json({ message: 'Invalid or expired session', code: 'AUTH_INVALID_TOKEN' });
  }
};

export default verifyToken;
