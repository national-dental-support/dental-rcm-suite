import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { SectionCardModule } from './components/section-card/section-card.module';
// Chart components
import { CustomTabStripComponent } from '../pages/analytics/shared/custom-tab-strip/custom-tab-strip.component';

// Reusable UI components
import { BarChartComponent } from './components/bar-chart/bar-chart.component';
import { DataCardComponent } from './components/data-card/data-card.component';
import { LineChartComponent } from './components/line-chart/line-chart.component';
import { DataTableComponent } from './components/data-table/data-table.component';
import { FilterButtonComponent } from './components/filter-button/filter-button.component';
import { MaterialModule } from './material/material.module';
import { FilesPaginatorComponent } from './components/pagination/pagination.component';
import { DentalPracticeTableComponent } from './components/dental-practice-table/dental-practice-table.component';
import { InsuranceAndPatientCollectionsBarChartComponent } from './components/insurance-patient-collections-bar/insurance-patient-collections-bar.component';
import { InsuranceAndPatientCollectionsTrendsLineChartComponent } from './components/insurance-collections-trends-line/insurance-collections-trends-line.component';
import { EmptyValuePipe } from './pipes/empty-value.pipe';
import { ProceduresIncreasingBarChartComponent } from './components/procedures-increasing-bar/procedures-increasing-bar.component';
import { ProceduresDecliningBarChartComponent } from './components/procedures-declining-bar/procedures-declining-bar.component';
import { PieChartComponent } from './components/pie-chart/pie-chart.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgApexchartsModule } from 'ng-apexcharts';
import { HorizontalBarChartComponent } from './components/horizontal-bar-chart/horizontal-bar-chart.component';
import { AdvancedTableModule } from './components/advanced-table/advanced-table.module';
import { RpSkeletonModule } from './components/rp-skeleton/rp-skeleton.module';
import { DialogComponent } from './components/dialogs/dialog-shell/dialog-shell.component';
import { MixedChartComponent } from './components/mixed-chart/mixed-chart.component';
import { GlobalFiltersComponent } from './components/global-filters/global-filters.component';
import { TrainingTooltipDirective } from './directives/training-tooltip.directive';
import { TrainingPanelComponent } from './components/training-panel/training-panel.component';
import { A11yModule } from '@angular/cdk/a11y';

// Shared reusable components
import { SharedPatientSearchComponent } from './components/patient-search/patient-search.component';
import { SharedStatusBadgeComponent } from './components/status-badge/status-badge.component';
import { SharedStatCardComponent } from './components/stat-card/stat-card.component';
import { SharedConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { AiAlertsPanelComponent } from './components/ai-alerts-panel/ai-alerts-panel.component';
import { MatBadgeModule } from '@angular/material/badge';

@NgModule({ declarations: [
        CustomTabStripComponent,
        BarChartComponent,
        DataCardComponent,
        LineChartComponent,
        DataTableComponent,
        FilterButtonComponent,
        FilesPaginatorComponent,
        DentalPracticeTableComponent,
        InsuranceAndPatientCollectionsBarChartComponent,
        InsuranceAndPatientCollectionsTrendsLineChartComponent,
        ProceduresIncreasingBarChartComponent,
        ProceduresDecliningBarChartComponent,
        PieChartComponent,
        HorizontalBarChartComponent,
        DialogComponent,
        MixedChartComponent,
        GlobalFiltersComponent,
        TrainingTooltipDirective,
        TrainingPanelComponent,
        SharedPatientSearchComponent,
        SharedStatusBadgeComponent,
        SharedStatCardComponent,
        SharedConfirmDialogComponent,
        AiAlertsPanelComponent,
        EmptyValuePipe,
    ],
    exports: [
        SectionCardModule,
        CustomTabStripComponent,
        BarChartComponent,
        DataCardComponent,
        LineChartComponent,
        DataTableComponent,
        FilterButtonComponent,
        FilesPaginatorComponent,
        DentalPracticeTableComponent,
        InsuranceAndPatientCollectionsBarChartComponent,
        InsuranceAndPatientCollectionsTrendsLineChartComponent,
        ProceduresIncreasingBarChartComponent,
        ProceduresDecliningBarChartComponent,
        PieChartComponent,
        HorizontalBarChartComponent,
        AdvancedTableModule,
        RpSkeletonModule,
        DialogComponent,
        MixedChartComponent,
        NgApexchartsModule,
        GlobalFiltersComponent,
        TrainingTooltipDirective,
        TrainingPanelComponent,
        SharedPatientSearchComponent,
        SharedStatusBadgeComponent,
        SharedStatCardComponent,
        SharedConfirmDialogComponent,
        AiAlertsPanelComponent,
        EmptyValuePipe,
    ], imports: [CommonModule,
        SectionCardModule,
        NgApexchartsModule,
        FormsModule,
        ReactiveFormsModule,
        MaterialModule,
        RpSkeletonModule,
        AdvancedTableModule,
        A11yModule,
        MatBadgeModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class SharedComponentsModule {}
