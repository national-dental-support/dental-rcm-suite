import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AnalyticsComponent } from './analytics';
import { PayerMixComponent } from './payer-mix/payer-mix.component';
import { RcmComponent } from './rcm/rcm.component';
import { ARComponent } from './ar/ar.component';
import { MedicareDashboardComponent } from './medicare-dashboard/medicare-dashboard.component';

const routes: Routes = [
   { path: '', component: AnalyticsComponent, children: [
    // { path: 'payer-mix', component: PayerMixComponent },
    // { path: 'rcm', component: RcmComponent },
    // { path: 'ar', component: ARComponent },
    // { path: 'medicare-dashboard', component: MedicareDashboardComponent },
    // { path: '', pathMatch: 'full', redirectTo: 'payer-mix' },
  ]},
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AnalyticsRoutingModule {}
