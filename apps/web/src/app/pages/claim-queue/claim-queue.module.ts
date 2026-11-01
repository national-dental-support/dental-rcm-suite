import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AdminSharedModule } from '../admin/admin-shared.module';
import { ClaimQueueRoutingModule } from './claim-queue.routing';

// Your shared bundles
import { SharedComponentsModule } from '../../shared/shared-components.module';
import { MaterialModule } from '../../shared/material/material.module';

import { ClaimQueueListComponent } from './components/claim-queue-list/claim-queue-list.component';
import { ClaimDetailComponent } from './components/claim-detail/claim-detail.component';
import { ClaimFilterDialogComponent } from './components/claim-filter-dialog/claim-filter-dialog.component';
import { ActiveFilterPillsComponent } from './components/active-filter-pills/active-filter-pills.component';
import { ClaimActionDialogComponent, TransactionalAdjustmentDialogComponent } from './components/claim-action-dialog/claim-action-dialog';
import { ClaimDocumentDialogComponent } from './components/claim-dialog/claim-document-dialog.component';
import { ReconIqPanelComponent } from './components/enrichment/recon-iq-panel/recon-iq-panel.component';
import { ClaimVisionPanelComponent } from './components/enrichment/claim-vision-panel/claim-vision-panel.component';
import { InsightflowPanelComponent } from './components/enrichment/insightflow-panel/insightflow-panel.component';
import { ClaimCommentsComponent } from './components/claim-comments/claim-comments.component';

import { AppealPanelComponent } from './components/appeal-panel/appeal-panel.component';
import { NextActionsComponent } from './components/next-actions/next-actions.component';
import { DenialIqShellComponent } from './denial-iq-shell/denial-iq-shell.component';
import { DenialIqAdminSettingsComponent } from './denial-iq-admin-settings/denial-iq-admin-settings.component';
import { ManagerApprovalQueueComponent } from './components/manager-approval-queue/manager-approval-queue.component';
import { ComplianceCheckerComponent } from './components/compliance-checker/compliance-checker.component';
import { PatientAdvocacyComponent } from './components/patient-advocacy/patient-advocacy.component';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@NgModule({
  declarations: [
    ClaimQueueListComponent,
    ClaimDetailComponent,
    ClaimFilterDialogComponent,
    ClaimActionDialogComponent,
    TransactionalAdjustmentDialogComponent,
    ActiveFilterPillsComponent,
    ClaimDocumentDialogComponent,
    ReconIqPanelComponent,
    ClaimVisionPanelComponent,
    InsightflowPanelComponent,
    ClaimCommentsComponent,
    AppealPanelComponent,
    NextActionsComponent,
    DenialIqShellComponent,
    DenialIqAdminSettingsComponent,
    ManagerApprovalQueueComponent,
    ComplianceCheckerComponent,
    PatientAdvocacyComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    // app bundles
    SharedComponentsModule,
    MaterialModule,


    // local needs (not in MaterialModule)
    MatSnackBarModule,
    MatExpansionModule,
    MatSlideToggleModule,

    AdminSharedModule,
    ClaimQueueRoutingModule,
  ],
})
export class ClaimQueueModule {}
