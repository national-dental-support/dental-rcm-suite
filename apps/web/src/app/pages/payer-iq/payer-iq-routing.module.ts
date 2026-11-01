// src/app/pages/payer-iq/payer-iq-routing.module.ts
// OPTIONAL: Use this if your codebase prefers a dedicated routing module.
// If not, you can delete this file and keep routes inside payer-iq.module.ts.

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PayerIqDashboardComponent } from './dashboard/payer-iq-dashboard.component';
import { PayerIQTabsComponent } from './payer-iq-tabs/payer-iq-tabs.component';
import { PayerIQComponent } from './payer-iq.component';
import { StrategyComponent } from './strategy/strategy.component';
import { UnderpaymentsComponent } from './underpayments/underpayments.component';
import { NetworkLeasesComponent } from './network-leases/network-leases.component';
import { ContractComponent } from './contract/contract.component';
import { CompareComponent } from './compare/compare.component';


const routes: Routes = [

  {
    path: '',
    component: PayerIQComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      { path: 'dashboard', component: PayerIqDashboardComponent },
      { path: 'network-and-leases', component: NetworkLeasesComponent },
      { path: 'underpayments', component: UnderpaymentsComponent },
      { path: 'strategy', component: StrategyComponent },
      { path: 'contracts', component: ContractComponent },
      { path: 'compare', component: CompareComponent },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PayerIqRoutingModule {}
