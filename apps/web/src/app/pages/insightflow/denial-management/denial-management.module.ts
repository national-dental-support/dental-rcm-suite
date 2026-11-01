// src/app/pages/insightflow/denial-management/denial-management.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { MaterialModule } from '../../../shared/material/material.module';
import { NgApexchartsModule } from 'ng-apexcharts';
import { DenialManagementComponent } from './denial-management.component';
import { SharedComponentsModule } from '../../../shared/shared-components.module';

@NgModule({
  declarations: [DenialManagementComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MaterialModule,
    NgApexchartsModule,
    SharedComponentsModule,
  ],
  exports: [DenialManagementComponent],
})
export class DenialManagementModule {}
