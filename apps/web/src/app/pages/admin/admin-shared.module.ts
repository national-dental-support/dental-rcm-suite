// Single declaration point for the admin components, so each is declared in
// exactly one NgModule and can be reused by any module that imports this one.
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material/material.module';
import { SharedComponentsModule } from '../../shared/shared-components.module';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatStepperModule } from '@angular/material/stepper';

import { CatalogManagementComponent } from './catalog-management/catalog-management.component';
import { CustomerSSOAdminComponent } from './customer-sso/customer-sso.component';
import { EscalationChainsAdminComponent } from './escalation-chains/escalation-chains.component';
import { PayerFollowupAdminComponent } from './payer-followup/payer-followup.component';
import { PrioritySettingsComponent } from './priority-settings/priority-settings.component';
import { RemediationAdminComponent } from './remediation/remediation.component';
import { WorkflowRulesAdminComponent } from './workflow-rules/workflow-rules.component';

const ADMIN_COMPONENTS = [
  CatalogManagementComponent,
  CustomerSSOAdminComponent,
  EscalationChainsAdminComponent,
  PayerFollowupAdminComponent,
  PrioritySettingsComponent,
  RemediationAdminComponent,
  WorkflowRulesAdminComponent,
];

@NgModule({
  declarations: ADMIN_COMPONENTS,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    SharedComponentsModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    MatStepperModule,
  ],
  exports: ADMIN_COMPONENTS,
})
export class AdminSharedModule {}
