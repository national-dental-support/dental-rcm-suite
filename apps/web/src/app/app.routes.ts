// app.routes.ts
import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { LayoutComponent } from './layout/layout';
import { blockEmbedLoginGuard } from './guards/block-embedded-login/block-embedded-login.guard';
import { blockEmbedParamGuard } from './guards/block-embedded-login/block-embedded-param.guard';
import { adminGuard } from './guards/admin.guard';
import { sessionGuard } from './guards/session.guard';
import { subscriptionGuard } from './guards/subscription.guard';

/** If the user already has a session, skip the sign-in page. */
const RedirectIfAuthenticated = () => {
  const router = inject(Router);
  if (localStorage.getItem('xUserEmail') || sessionStorage.getItem('xUserEmail')) {
    return router.createUrlTree(['/app']);
  }
  return true;
};

export const routes: Routes = [
  { path: '', redirectTo: 'signin', pathMatch: 'full' },
  {
    path: 'signin',
    component: LoginComponent,
    canActivate: [RedirectIfAuthenticated, blockEmbedLoginGuard],
  },
  {
    path: 'app',
    component: LayoutComponent,
    canActivate: [sessionGuard],
    children: [
      {
        path: 'home',
        loadChildren: () =>
          import('./pages/home/home.module').then(m => m.HomeModule),
      },
      {
        path: 'insightflow',
        canActivate: [blockEmbedParamGuard, subscriptionGuard],
        data: { productSlug: 'insightflow' },
        loadChildren: () =>
          import('./pages/insightflow/insightflow.module').then(m => m.InsightflowModule),
      },
      {
        path: 'denial-iq',
        canActivate: [subscriptionGuard],
        data: { productSlug: 'denial-iq' },
        loadChildren: () =>
          import('./pages/claim-queue/claim-queue.module').then(m => m.ClaimQueueModule),
      },
      {
        path: 'claim-vision',
        canActivate: [subscriptionGuard],
        data: { productSlug: 'claim-vision' },
        loadChildren: () =>
          import('./pages/claim-vision/claim-vision.module').then(m => m.ClaimVisionModule),
      },
      {
        path: 'payer-iq',
        canActivate: [subscriptionGuard],
        data: { productSlug: 'payer-iq' },
        loadChildren: () =>
          import('./pages/payer-iq/payer-iq.module').then(m => m.PayerIqModule),
      },
      {
        path: 'recon-iq',
        canActivate: [subscriptionGuard],
        data: { productSlug: 'recon-iq' },
        loadChildren: () =>
          import('./pages/recon-iq/recon-iq.module').then(m => m.ReconIqModule),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./pages/admin/admin.module').then(m => m.AdminModule),
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./pages/settings/settings.module').then(m => m.SettingsModule),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: '**', redirectTo: 'home' },
    ],
  },
  { path: '**', redirectTo: 'signin' },
];

export const routingProviders = [];
