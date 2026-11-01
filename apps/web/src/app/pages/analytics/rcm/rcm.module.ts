import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { MaterialModule } from '../../../shared/material/material.module';
import { RcmComponent } from './rcm.component';
import { SharedComponentsModule } from '../../../shared/shared-components.module';
import { FilterDialogModule } from '../../../shared/components/filter-dialog/filter-dialog.module';
import { NgApexchartsModule } from 'ng-apexcharts';
import {
  ToClaimValueSeriesPipe,
  ToClaimStatusLabelsPipe,
  ToClaimValueByStatusChartPipe,
  ToClaimAmountsSeriesPipe,
  ToClaimPracticeLabelsPipe,
  ToClaimAmountsByPracticeChartPipe,
  ToCollectionAdjustmentSeriesPipe,
  ToCollectionAdjustmentLabelsPipe,
  ToClaimAmountsByPayerSeriesPipe,
  ToClaimPayerLabelsPipe,
  ToClaimAmountsByPayerChartPipe,
  ToClaimValuesByTypeSeriesPipe,
  ToClaimTypeLabelsPipe,
  ToClaimValuesByTypeChartPipe,
} from '../../../core/pipes/rcm-chart-pipes';

@NgModule({ declarations: [
        RcmComponent,
        ToClaimValueSeriesPipe,
        ToClaimStatusLabelsPipe,
        ToClaimValueByStatusChartPipe,
        ToClaimAmountsSeriesPipe,
        ToClaimPracticeLabelsPipe,
        ToClaimAmountsByPracticeChartPipe,
        ToCollectionAdjustmentSeriesPipe,
        ToCollectionAdjustmentLabelsPipe,
        ToClaimAmountsByPayerSeriesPipe,
        ToClaimPayerLabelsPipe,
        ToClaimAmountsByPayerChartPipe,
        ToClaimValuesByTypeSeriesPipe,
        ToClaimTypeLabelsPipe,
        ToClaimValuesByTypeChartPipe,
    ],
    exports: [RcmComponent], imports: [CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MaterialModule,
        NgApexchartsModule,
        SharedComponentsModule,
        FilterDialogModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class RcmModule {}
