import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { RouterModule } from '@angular/router';

import { MaterialModule } from '../../../shared/material/material.module';
import { InViewOnceDirective } from './shared/in-view-once.directive';
import { MedicareDashboardComponent } from './medicare-dashboard.component';
import { SharedComponentsModule } from '../../../shared/shared-components.module';

@NgModule({ declarations: [
        MedicareDashboardComponent,
        InViewOnceDirective,
    ],
    exports: [MedicareDashboardComponent, InViewOnceDirective], imports: [CommonModule,
        ReactiveFormsModule,
        RouterModule,
        MaterialModule,
        SharedComponentsModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class MedicareDashboardModule {}
