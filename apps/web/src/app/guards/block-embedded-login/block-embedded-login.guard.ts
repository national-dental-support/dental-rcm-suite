import { CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';

export const blockEmbedLoginGuard: CanActivateFn = (route: ActivatedRouteSnapshot): boolean => {
  if (route.queryParamMap.has('uiConfig')) {
    console.warn('Blocked spurious /login?uiConfig=... navigation from embedded iframe');
    return false;
  }
  return true;
};
