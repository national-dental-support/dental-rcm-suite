// pages/analytics/analytics.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { InsightflowComponent } from './insightflow.component';
import { MaterialModule } from '../../shared/material/material.module';
import { RouterModule } from '@angular/router';
import { InsightflowRoutingModule } from './insightflow-routing.module';
import { MatRippleModule } from '@angular/material/core';
import { InsightflowTabsComponent } from './insightflow-tabs/insightflow-tabs.component';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SharedComponentsModule } from '../../shared/shared-components.module';
import { DenialManagementModule } from './denial-management/denial-management.module';
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
import { DashboardCustomizeDialogComponent } from './executive-summary/dashboard-customize-dialog/dashboard-customize-dialog.component';
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
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@NgModule({
  declarations: [
   InsightflowComponent,
   InsightflowTabsComponent,
   ExecutiveSummaryComponent,
   ScheduledReportsComponent,
   RiskPredictionsComponent,
   ReportBuilderComponent,
   IndustryBenchmarkingComponent,
   FinancialOverviewComponent,
   CarcLibraryComponent,
   RevenueForecastComponent,
   ProviderDailyGoalsComponent,
   TreatmentAcceptanceComponent,
   PatientLtvComponent,
   DashboardCustomizeDialogComponent,
   BadDebtAnalysisComponent,
   CycleTimeComponent,
   PreauthAnalyticsComponent,
   ReactivationComponent,
   ClaimsAnalyticsComponent,
   BillingOptimizationComponent,
   ClaimAutoSubmissionComponent,
   DenialPredictionComponent,
   CleanClaimComponent,
   ImageVerificationComponent,
   ConsultingPortalComponent,
   AppealSuccessComponent,
   CptDenialComponent,
  ],
  imports: [
    CommonModule,
    RouterModule,
    SharedComponentsModule,
    InsightflowRoutingModule,
    MaterialModule,
    MatRippleModule,
    AnalyticsModule,
    DenialManagementModule,
    FormsModule,
    MatSlideToggleModule,
    DragDropModule,
  ],
  exports:[
  ]
})
export class InsightflowModule {}
