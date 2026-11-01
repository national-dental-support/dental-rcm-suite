// pages/analytics/analytics.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsRoutingModule } from './analytics-routing.module';
import { NgApexchartsModule } from 'ng-apexcharts';
import { MaterialModule } from '../../shared/material/material.module';
import { SharedComponentsModule } from '../../shared/shared-components.module';

import { AnalyticsComponent } from './analytics';

// Summary/cards/tables/charts

import { RcmRevenueTableComponent } from './shared/rcm-revenue-table/rcm-revenue-table.component';
import { RcmSummaryCardsComponent } from './shared/rcm-summary-cards/rcm-summary-cards.component';

// If you want to embed Superset inline in a page:

import { RcmModule } from './rcm/rcm.module';
import { RouterModule } from '@angular/router';
import { ArModule } from './ar/ar.module';
import { MedicareDashboardModule } from './medicare-dashboard/medicare-dashboard.module';
import { PayerMixModule } from './payer-mix/payer-mix.module';
import { MatChipsModule } from '@angular/material/chips';

@NgModule({
  declarations: [
    AnalyticsComponent,
    RcmRevenueTableComponent,
    RcmSummaryCardsComponent,
  ],
  imports: [
    CommonModule,
    AnalyticsRoutingModule,
    SharedComponentsModule,
    NgApexchartsModule,
    MaterialModule,
    RcmModule,
    RouterModule,
    ArModule,
    MedicareDashboardModule,
    PayerMixModule,
    MatChipsModule,
    
    
  ],
  exports:[
    AnalyticsComponent,
    RcmRevenueTableComponent,
    RcmSummaryCardsComponent,

  ]
})
export class AnalyticsModule {}
