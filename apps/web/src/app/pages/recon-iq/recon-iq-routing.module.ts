// src/app/pages/payer-iq/payer-iq-routing.module.ts
// OPTIONAL: Use this if your codebase prefers a dedicated routing module.
// If not, you can delete this file and keep routes inside payer-iq.module.ts.

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ReconIQComponent } from './recon-iq.component';
import { adminGuard } from '../../guards/admin.guard';
import { DashboardShellComponent } from './dashboard/dashboard-shell.component';
import { ReconIQDashboardComponent } from './dashboard/recon-iq-dashboard.component';
import { EncounterResearchComponent } from './encounter-research/encounter-research.component';
import { PayRecClaimDetailComponent } from './pay-rec-claim-detail/pay-rec.component';
import { MatchingComponent } from './matching/matching.component';
import { FullyReconciledPostedComponent } from './dashboard/fully-reconciled-posted/fully-reconciled-posted.component';
import { ReconciliationReportComponent } from './reconciliation-report/reconciliation-report.component';
import { FinanceSummaryComponent } from './finance-summary/finance-summary.component';
import { PatientStatementsGenerationComponent } from './patient-statements/patient-statements-generation.component';
import { BankEscalationsComponent } from './bank-escalations/bank-escalations.component';
import { EraIngestionComponent } from './era-ingestion/era-ingestion.component';
import { ReconAdminConfigComponent } from './admin-config/recon-admin-config.component';
import { ReconAlertsComponent } from './recon-alerts/recon-alerts.component';
import { BankAccountConnectionsComponent } from './bank-account-connections/bank-account-connections.component';
import { SecondaryBillingComponent } from './secondary-billing/secondary-billing.component';


const routes: Routes = [

  {
    path: '',
    component: ReconIQComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      {
        path: 'dashboard',
        component: DashboardShellComponent,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          { path: 'overview',              component: ReconIQDashboardComponent },
          { path: 'finance-summary',       component: FinanceSummaryComponent },
          { path: 'reconciliation-report', component: ReconciliationReportComponent },
        ],
      },
      {
        path: 'fully-reconciled-posted',
        component: FullyReconciledPostedComponent,
      },
      { path: 'encounter-research',    component: EncounterResearchComponent },
      { path: 'payment-reconciliation', component: PayRecClaimDetailComponent },
      { path: 'secondary-billing',      component: SecondaryBillingComponent },
      { path: 'matching',              component: MatchingComponent },
      { path: 'patient-statements',    component: PatientStatementsGenerationComponent },
      { path: 'bank-escalations',      redirectTo: 'admin', pathMatch: 'full' },
      { path: 'era-ingestion',         component: EraIngestionComponent },
      { path: 'alerts',                redirectTo: 'admin', pathMatch: 'full' },
      { path: 'admin',                 component: ReconAdminConfigComponent, canActivate: [adminGuard] },
      { path: 'bank-accounts',         component: BankAccountConnectionsComponent },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ReconIqRoutingModule {}
