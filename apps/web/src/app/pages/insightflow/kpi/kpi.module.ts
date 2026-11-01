// src/app/pages/insightflow/kpi/insightflow-kpi.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

/* Angular Material */
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { KpiDetailComponent } from './detail-view/kpi-detail.component';
import { KpiFilterDialogComponent } from './filter-dialog/kpi-filter-dialog.component';
import { KpiComponent } from './list-view/kpi.component';
import { KpiProgressBarComponent } from './progress-bar/kpi-progress-bar.component';
import { SharedComponentsModule } from '../../../shared/shared-components.module';

const routes: Routes = [
  { path: '', component: KpiComponent }, //list
  { path: ':slug', component: KpiDetailComponent } //detail
];

@NgModule({ declarations: [KpiComponent, KpiDetailComponent, KpiFilterDialogComponent, KpiProgressBarComponent], imports: [CommonModule,
        FormsModule,
        ReactiveFormsModule,
        SharedComponentsModule,
        /* Material */
        MatButtonModule,
        MatCardModule,
        MatChipsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatMenuModule,
        MatProgressBarModule,
        MatSelectModule,
        MatSlideToggleModule,
        MatTooltipModule,
        MatAutocompleteModule,
        MatTabsModule,
        /* routes */
        RouterModule.forChild(routes)], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class InsightflowKpiModule {}
