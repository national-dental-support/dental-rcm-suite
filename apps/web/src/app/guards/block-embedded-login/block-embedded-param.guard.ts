import { CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';

export const blockEmbedParamGuard: CanActivateFn = (route: ActivatedRouteSnapshot): boolean => {
  if (route.queryParamMap.has('uiConfig')) {
    console.warn('Blocked navigation with uiConfig query param (from embedded iframe)');
    return false;
  }
  return true;
};
