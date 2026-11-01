import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../core/services/auth.services';

/**
 * Requires an authenticated session.
 *
 * Replaces the identity-provider session guard: there is no provider account
 * cache to consult, only a session token issued by this API.
 */
export const sessionGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated) return true;

  return router.createUrlTree(['/signin']);
};
