// src/app/pages/admin/admin.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { MaterialModule } from '../../shared/material/material.module';
import { AdminSharedModule } from './admin-shared.module';
import { SharedComponentsModule } from '../../shared/shared-components.module';

import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatStepperModule } from '@angular/material/stepper';

import { AdminComponent } from './admin';
import { UsersListComponent, ConfirmActionDialogComponent } from './users-list/users-list.component';
import { AddUserComponent } from './users-list/add-user/add-user.component';
import { LogsComponent } from './logs/logs.component';
import { ExecThresholdsAdminComponent } from './exec-thresholds/exec-thresholds.component';
import { SecurityAdminComponent } from './security/security.component';
import { ComplianceAdminComponent } from './compliance/compliance.component';
import { WriteOffRulesAdminComponent } from './writeoff-rules/writeoff-rules.component';
import { DenialCodeMappingAdminComponent } from './denial-code-mapping/denial-code-mapping.component';
import { AdminRoutingModule } from './admin-routing.module';

@NgModule({
  declarations: [
    AdminComponent,
    UsersListComponent,
    AddUserComponent,
    ConfirmActionDialogComponent,
    LogsComponent,
    ExecThresholdsAdminComponent,
    SecurityAdminComponent,
    ComplianceAdminComponent,
    WriteOffRulesAdminComponent,
    DenialCodeMappingAdminComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AdminSharedModule,
    SharedComponentsModule,
    MaterialModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    MatStepperModule,
    AdminRoutingModule,
  ],
})
export class AdminModule {}
