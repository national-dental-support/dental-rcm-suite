import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { UserService } from '../core/services/user.service';
import { MANAGER_ROLES } from '../core/models/user.models';

export const managerGuard: CanActivateFn = (): Observable<boolean> | boolean => {
  const router = inject(Router);
  const userService = inject(UserService);

  // The cached subscription payload is the authoritative role source.
  try {
    const raw = sessionStorage.getItem('rcm_subscription_state');
    const state = raw ? JSON.parse(raw) : {};
    if (MANAGER_ROLES.includes(state?.role ?? '')) return true;
  } catch { /* ignore malformed cache */ }

  const email =
    localStorage.getItem('xUserEmail') ||
    sessionStorage.getItem('xUserEmail') ||
    '';

  if (!email) {
    router.navigate(['/app/home']);
    return false;
  }

  return userService.checkIfUserExists(email).pipe(
    map((user: Record<string, unknown>) => {
      const role: string = (user?.['role'] as string) ?? '';
      const allowed = MANAGER_ROLES.includes(role);
      if (!allowed) router.navigate(['/app/home']);
      return allowed;
    }),
    catchError(() => {
      router.navigate(['/app/home']);
      return of(false);
    }),
  );
};
