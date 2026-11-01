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
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ReconIQComponent } from './recon-iq.component';
import { ReconIQTabsComponent } from './recon-iq-tabs/recon-iq-tabs.component';
import { DashboardShellComponent } from './dashboard/dashboard-shell.component';
import { ReconIQDashboardComponent } from './dashboard/recon-iq-dashboard.component';
import { ReconIqRoutingModule } from './recon-iq-routing.module';
import { EncounterResearchComponent } from './encounter-research/encounter-research.component';
import { ReconIQFilterComponent } from './recon-iq-filter-dialog/recon-iq-filter-dialog.component';
import { ActiveFilterPillsComponent } from '../claim-queue/components/active-filter-pills/active-filter-pills.component';
import { ClaimQueueModule } from '../claim-queue/claim-queue.module';
import { PayRecClaimDetailComponent } from './pay-rec-claim-detail/pay-rec.component';
import { MatchingComponent } from './matching/matching.component';
import { FullyReconciledPostedComponent } from './dashboard/fully-reconciled-posted/fully-reconciled-posted.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatchingConfirmDialogComponent } from './matching/matching-confirm-dialog/matching-confirm-dialog.component';
import { EraPostingConfirmDialogComponent } from './pay-rec-claim-detail/era-posting-confirm-dialog/era-posting-confirm-dialog.component';
import { ReconciliationReportComponent } from './reconciliation-report/reconciliation-report.component';
import { FinanceSummaryComponent } from './finance-summary/finance-summary.component';
import { PatientStatementsGenerationComponent } from './patient-statements/patient-statements-generation.component';
import { BankEscalationsComponent } from './bank-escalations/bank-escalations.component';
import { EraIngestionComponent } from './era-ingestion/era-ingestion.component';
import { ReconAdminConfigComponent } from './admin-config/recon-admin-config.component';
import { ReconAlertsComponent } from './recon-alerts/recon-alerts.component';
import { BankAccountConnectionsComponent } from './bank-account-connections/bank-account-connections.component';
import { SecondaryBillingComponent } from './secondary-billing/secondary-billing.component';


@NgModule({
  declarations: [
    ReconIQComponent,
    ReconIQTabsComponent,
    DashboardShellComponent,
    ReconIQDashboardComponent,
    EncounterResearchComponent,
    ReconIQFilterComponent,
    PayRecClaimDetailComponent,
    MatchingComponent,
    MatchingConfirmDialogComponent,
    EraPostingConfirmDialogComponent,
    FullyReconciledPostedComponent,
    ReconciliationReportComponent,
    FinanceSummaryComponent,
    PatientStatementsGenerationComponent,
    BankEscalationsComponent,
    EraIngestionComponent,
    ReconAdminConfigComponent,
    ReconAlertsComponent,
    BankAccountConnectionsComponent,
    SecondaryBillingComponent,
  ],
  imports: [
    CommonModule,
    MatSlideToggleModule,
    FormsModule,
    ReactiveFormsModule,
    SharedComponentsModule,
    MaterialModule,
    RouterModule,
    ReconIqRoutingModule,
    ClaimQueueModule
],
  exports:[
    ReconIQComponent,
    ReconIQTabsComponent,
    ReconIQDashboardComponent,
    EncounterResearchComponent,
    ReconIQFilterComponent,
    PayRecClaimDetailComponent,
    MatchingComponent,
    MatchingConfirmDialogComponent,
    FullyReconciledPostedComponent
]
})
export class ReconIqModule {}
