// src/app/pages/payer-iq/payer-iq.module.ts

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RouterModule } from '@angular/router';

// If your app uses Angular Material in feature modules, keep this import.
// Otherwise remove it if PagesModule / Shared handles all Material imports.
import { MaterialModule } from '../../shared/material/material.module';

// Shared components (cards, charts, advanced-table, filter button, etc.)
import { SharedComponentsModule } from '../../shared/shared-components.module';
// import { PayerIqDashboardComponent } from './dashboard/payer-iq-dashboard.component';
import { PayerIQTabsComponent } from './payer-iq-tabs/payer-iq-tabs.component';
import { PayerIQComponent } from './payer-iq.component';
import { PayerIqRoutingModule } from './payer-iq-routing.module';
import { PayerIqDashboardComponent } from './dashboard/payer-iq-dashboard.component';
import { ReactiveFormsModule } from '@angular/forms';
import { NetworkLeasesComponent } from './network-leases/network-leases.component';
import { UnderpaymentsComponent } from './underpayments/underpayments.component';
import { StrategyComponent } from './strategy/strategy.component';
import { ContractComponent } from './contract/contract.component';
import { CompareComponent } from './compare/compare.component';
import { FormsModule } from '@angular/forms';
import { A11yModule } from "@angular/cdk/a11y";


@NgModule({
  declarations: [
    PayerIQComponent,
    PayerIQTabsComponent,
    PayerIqDashboardComponent,
    NetworkLeasesComponent,
    UnderpaymentsComponent,
    StrategyComponent,
    ContractComponent,
    CompareComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    // Shared UI
    SharedComponentsModule,
    MaterialModule,
    // Feature routing
    PayerIqRoutingModule,
    RouterModule,
    A11yModule
],
  exports:[
    PayerIQComponent,
    PayerIQTabsComponent,
    ]
})
export class PayerIqModule {}
