import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InsightflowComponent } from './insightflow.component';

// v Import the 5 existing analytics pages
import { PayerMixComponent } from '../analytics/payer-mix/payer-mix.component';
import { RcmComponent as RevenueCycleManagementComponent } from '../analytics/rcm/rcm.component';    // <-- update path/name
import { InsightflowTabsComponent } from './insightflow-tabs/insightflow-tabs.component';
import { ARComponent } from '../analytics/ar/ar.component';
import { DenialManagementComponent } from './denial-management/denial-management.component';
import { ExecutiveSummaryComponent } from './executive-summary/executive-summary.component';
import { ScheduledReportsComponent } from './scheduled-reports/scheduled-reports.component';
import { RiskPredictionsComponent } from './risk-predictions/risk-predictions.component';
import { ReportBuilderComponent } from './report-builder/report-builder.component';
import { IndustryBenchmarkingComponent } from './industry-benchmarking/industry-benchmarking.component';
import { FinancialOverviewComponent } from './financial-overview/financial-overview.component';
import { CarcLibraryComponent } from './carc-library/carc-library.component';
import { RevenueForecastComponent } from './revenue-forecast/revenue-forecast.component';
import { ProviderDailyGoalsComponent } from './provider-daily-goals/provider-daily-goals.component';
import { TreatmentAcceptanceComponent } from './treatment-acceptance/treatment-acceptance.component';
import { PatientLtvComponent } from './patient-ltv/patient-ltv.component';
import { BadDebtAnalysisComponent } from './bad-debt-analysis/bad-debt-analysis.component';
import { CycleTimeComponent } from './cycle-time/cycle-time.component';
import { PreauthAnalyticsComponent } from './preauth-analytics/preauth-analytics.component';
import { ReactivationComponent } from './reactivation/reactivation.component';
import { ClaimsAnalyticsComponent } from './claims-analytics/claims-analytics.component';
import { BillingOptimizationComponent } from './billing-optimization/billing-optimization.component';
import { ClaimAutoSubmissionComponent } from './claim-auto-submission/claim-auto-submission.component';
import { DenialPredictionComponent } from './denial-prediction/denial-prediction.component';
import { CleanClaimComponent } from './clean-claim/clean-claim.component';
import { ImageVerificationComponent } from './image-verification/image-verification.component';
import { ConsultingPortalComponent } from './consulting-portal/consulting-portal.component';
import { AppealSuccessComponent } from './appeal-success/appeal-success.component';
import { CptDenialComponent } from './cpt-denial/cpt-denial.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'view/summary' }, // skip landing page

  {
    path: 'view',
    component: InsightflowTabsComponent,
    children: [
      { path: 'summary',   component: ExecutiveSummaryComponent },
      { path: 'denials',   component: DenialManagementComponent },
      { path: 'ar',        component: ARComponent },
      { path: 'rcm',       component: RevenueCycleManagementComponent },
      { path: 'payer-mix', component: PayerMixComponent },
      { path: 'kpi', loadChildren: () => import('./kpi/kpi.module').then(m => m.InsightflowKpiModule) },
      { path: 'schedules', component: ScheduledReportsComponent },
      { path: 'predictions', component: RiskPredictionsComponent },
      { path: 'report-builder', component: ReportBuilderComponent },
      { path: 'benchmarking', component: IndustryBenchmarkingComponent },
      { path: 'financial',    component: FinancialOverviewComponent },
      { path: 'carc-library',  component: CarcLibraryComponent },
      { path: 'revenue-forecast', component: RevenueForecastComponent },
      { path: 'provider-daily-goals', component: ProviderDailyGoalsComponent },
      { path: 'treatment-acceptance', component: TreatmentAcceptanceComponent },
      { path: 'patient-ltv',      component: PatientLtvComponent },
      { path: 'bad-debt',         component: BadDebtAnalysisComponent },
      { path: 'cycle-time',       component: CycleTimeComponent },
      { path: 'preauth-analytics', component: PreauthAnalyticsComponent },
      { path: 'reactivation',     component: ReactivationComponent },
      { path: 'claims-analytics', component: ClaimsAnalyticsComponent },
      { path: 'billing-optimization', component: BillingOptimizationComponent },
      { path: 'claim-auto-submission', component: ClaimAutoSubmissionComponent },
      { path: 'denial-prediction', component: DenialPredictionComponent },
      { path: 'clean-claim', component: CleanClaimComponent },
      { path: 'image-verification', component: ImageVerificationComponent },
      { path: 'consulting-portal', component: ConsultingPortalComponent },
      { path: 'appeal-success',   component: AppealSuccessComponent },
      { path: 'cpt-denial',       component: CptDenialComponent },
      { path: '', pathMatch: 'full', redirectTo: 'summary' },
    ],
  },
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InsightflowRoutingModule {}
